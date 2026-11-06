import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { developers, tenants } from "@/db/schema";
import { cookieOptions, createSession, subscriptionState, syncTenantExpiry } from "@/lib/auth";
import { normalizeEmail, verifyPassword, verifyTenantPassword } from "@/lib/password";
import { fail, readJson, str } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";
import { getDeveloperSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureSeed();
  } catch (error) {
    console.error("seed error", error);
  }

  const body = await readJson(req);
  const email = normalizeEmail(str(body.email, 200));
  const password = str(body.password, 200);
  const role = str(body.role) === "developer" ? "developer" : "tenant";

  if (!email || !password) return fail("Informe e-mail e senha.", 400);

  if (role === "developer") {
    const [dev] = await db.select().from(developers).where(eq(developers.email, email)).limit(1);
    if (!dev || !verifyPassword(password, dev.passwordHash)) return fail("E-mail ou senha incorretos.", 401);
    const session = await createSession("developer", dev.id);
    const store = await cookies();
    store.set({ ...cookieOptions(session.maxAge), value: session.token });
    return Response.json({ ok: true, redirect: "/dev", role: "developer" });
  }

  const [found] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
  if (!found || !verifyTenantPassword(password, found.passwordHash)) return fail("E-mail ou senha incorretos.", 401);
  const tenant = await syncTenantExpiry(found);
  const state = subscriptionState(tenant);

  if (state.status === "blocked") {
    return fail("Este acesso foi bloqueado pelo desenvolvedor. Fale com o suporte.", 403, { code: "blocked" });
  }
  if (state.status === "expired") {
    const [dev] = await db.select({ id: developers.id }).from(developers).limit(1);
    const devSettings = dev ? await getDeveloperSettings(dev.id) : null;
    return Response.json(
      {
        error: `Seu acesso ${tenant.plan === "monthly" ? "mensal" : "anual"} venceu em ${state.expiresAt?.split("-").reverse().join("/")}. Realize o pagamento para liberar o painel.`,
        code: "expired",
        expiresAt: state.expiresAt,
        paymentInstructions: devSettings?.paymentInstructions ?? "",
        supportContact: devSettings?.supportContact ?? "",
      },
      { status: 402 },
    );
  }

  await db.update(tenants).set({ lastLoginAt: new Date() }).where(eq(tenants.id, tenant.id));
  const session = await createSession("tenant", tenant.id);
  const store = await cookies();
  store.set({ ...cookieOptions(session.maxAge), value: session.token });
  return Response.json({ ok: true, redirect: "/app", role: "tenant", isDemo: tenant.isDemo });
}
