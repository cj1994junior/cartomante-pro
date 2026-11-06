import { eq } from "drizzle-orm";
import { db } from "@/db";
import { developers } from "@/db/schema";
import { asCents, fail, readJson, requireDeveloper, str } from "@/lib/api";
import { hashPassword, normalizeEmail, validateEmail, verifyPassword } from "@/lib/password";
import { getDeveloperSettings, saveDeveloperSettings } from "@/lib/settings";
import type { DeveloperSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireDeveloper();
  if (auth.error) return auth.error;
  return Response.json({ settings: await getDeveloperSettings(auth.developer.id) });
}

export async function PATCH(req: Request) {
  const auth = await requireDeveloper();
  if (auth.error) return auth.error;
  const body = await readJson(req);
  const patch: Partial<DeveloperSettings> = {};

  if (body.planPrices !== undefined && typeof body.planPrices === "object" && body.planPrices !== null) {
    const incoming = body.planPrices as Record<string, unknown>;
    patch.planPrices = {
      monthly: asCents(incoming.monthly),
      annual: asCents(incoming.annual),
      lifetime: asCents(incoming.lifetime),
    };
  }
  if (body.paymentInstructions !== undefined) patch.paymentInstructions = str(body.paymentInstructions, 700);
  if (body.supportContact !== undefined) patch.supportContact = str(body.supportContact, 200);
  if (body.autoBlockNotice !== undefined) patch.autoBlockNotice = str(body.autoBlockNotice, 600);
  if (Array.isArray(body.showcaseImages)) {
    patch.showcaseImages = (body.showcaseImages as unknown[]).map((item) => str(item, 500)).filter(Boolean).slice(0, 10);
  }

  const devPatch: Partial<typeof developers.$inferInsert> = {};
  if (body.name !== undefined) {
    const name = str(body.name, 140);
    if (name.length < 2) return fail("Informe seu nome.", 400);
    devPatch.name = name;
  }
  if (body.email !== undefined) {
    const email = normalizeEmail(str(body.email, 200));
    if (!validateEmail(email)) return fail("E-mail inválido.", 400);
    const [other] = await db.select({ id: developers.id }).from(developers).where(eq(developers.email, email)).limit(1);
    if (other && other.id !== auth.developer.id) return fail("Este e-mail já está em uso por outra conta.", 409);
    devPatch.email = email;
  }
  if (body.newPassword !== undefined && str(body.newPassword)) {
    const newPassword = str(body.newPassword, 120);
    if (newPassword.length < 8) return fail("A nova senha deve ter ao menos 8 caracteres.", 400);
    if (!verifyPassword(str(body.currentPassword, 120), auth.developer.passwordHash)) {
      return fail("Senha atual incorreta.", 403);
    }
    devPatch.passwordHash = hashPassword(newPassword);
  }

  const settings = await saveDeveloperSettings(auth.developer.id, patch);
  let account = { name: auth.developer.name, email: auth.developer.email };
  if (Object.keys(devPatch).length) {
    const [updated] = await db
      .update(developers)
      .set(devPatch)
      .where(eq(developers.id, auth.developer.id))
      .returning({ name: developers.name, email: developers.email });
    if (updated) account = updated;
  }
  return Response.json({
    ok: true,
    settings,
    account,
    passwordChanged: Boolean(devPatch.passwordHash),
  });
}
