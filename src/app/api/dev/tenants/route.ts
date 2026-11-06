import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenantSettings, tenants } from "@/db/schema";
import { asCents, fail, readJson, requireDeveloper, str } from "@/lib/api";
import { resolveExpiry } from "@/lib/auth";
import { getDeveloperSettings, DEFAULT_TENANT_SETTINGS } from "@/lib/settings";
import { hashPassword, normalizeEmail, tenantPasswordError, validateEmail } from "@/lib/password";
import { todayISO } from "@/lib/format";
import type { Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

const PLANS: Plan[] = ["monthly", "annual", "lifetime"];
const STATUSES = ["active", "blocked", "expired"];

export async function POST(req: Request) {
  const auth = await requireDeveloper();
  if (auth.error) return auth.error;
  const body = await readJson(req);

  const name = str(body.name, 140);
  const ownerName = str(body.ownerName, 140) || name;
  const email = normalizeEmail(str(body.email, 200));
  const password = typeof body.password === "string" ? body.password : "";
  const plan = (PLANS.includes(str(body.plan) as Plan) ? str(body.plan) : "monthly") as Plan;
  const phone = str(body.phone, 40) || null;
  const notes = str(body.notes, 1000) || null;
  const status = body.status === undefined ? "active" : str(body.status);

  if (name.length < 2) return fail("Informe o nome da conta.", 400);
  if (!validateEmail(email)) return fail("Informe um e-mail válido para a conta.", 400);
  const passwordError = tenantPasswordError(password);
  if (passwordError) return fail(passwordError, 400);
  if (!STATUSES.includes(status)) return fail("Selecione um status de acesso válido.", 400);

  const [existing] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.email, email)).limit(1);
  if (existing) return fail("Já existe uma conta com este e-mail.", 409);

  const devSettings = await getDeveloperSettings(auth.developer.id);
  const priceCents = body.priceCents !== undefined ? asCents(body.priceCents) : devSettings.planPrices[plan];
  const startedAt = todayISO();
  const expiresAt = resolveExpiry(plan, startedAt);

  try {
    // Cria a conta e suas configurações na mesma transação, sem deixar cadastros incompletos.
    const created = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          name,
          ownerName,
          email,
          phone,
          passwordHash: hashPassword(password),
          plan,
          status,
          priceCents,
          startedAt,
          expiresAt,
          notes,
        })
        .returning();

      await tx.insert(tenantSettings).values({
        tenantId: tenant.id,
        data: {
          ...DEFAULT_TENANT_SETTINGS,
          professionalName: ownerName,
          monthlyGoalCents: 0,
          initialBalanceCents: 0,
        },
      });
      return tenant;
    });

    return Response.json({ ok: true, tenant: { ...created, passwordHash: undefined } }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return fail("Já existe uma conta com este e-mail.", 409);
    console.error("Erro ao criar conta da profissional", error);
    return fail("Não foi possível criar a conta. Tente novamente.", 500);
  }
}
