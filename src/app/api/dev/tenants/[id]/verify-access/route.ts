import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { asInt, fail, readJson, requireDeveloper } from "@/lib/api";
import { subscriptionState } from "@/lib/auth";
import { verifyTenantPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

/** Confere a licença e a senha sem substituir a sessão do desenvolvedor. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDeveloper();
  if (auth.error) return auth.error;
  const { id } = await params;
  const tenantId = asInt(id, 0);
  if (!tenantId) return fail("Conta inválida.", 400);

  const [tenant] = await db.select().from(tenants).where(and(eq(tenants.id, tenantId))).limit(1);
  if (!tenant) return fail("Conta não encontrada.", 404);

  const state = subscriptionState(tenant);
  if (state.status === "blocked") {
    return fail("Esta conta está bloqueada. Ative o acesso no painel antes de compartilhar o link.", 403, { code: "blocked" });
  }
  if (state.status === "expired") {
    return fail("A licença desta conta está vencida. Renove o plano para liberar o acesso.", 402, {
      code: "expired",
      expiresAt: state.expiresAt,
    });
  }

  const body = await readJson(req);
  const password = typeof body.password === "string" ? body.password.trim().slice(0, 200) : "";
  if (!password) return fail("Informe a senha que será usada pela profissional.", 400);
  if (!verifyTenantPassword(password, tenant.passwordHash)) {
    return fail("A senha informada não corresponde à desta conta. Se necessário, redefina-a em Editar.", 400, {
      code: "incorrect_password",
    });
  }

  return Response.json({
    ok: true,
    message: "Acesso validado: a conta está ativa e a senha está correta.",
    account: { email: tenant.email, plan: state.plan, status: state.status, expiresAt: state.expiresAt },
  });
}
