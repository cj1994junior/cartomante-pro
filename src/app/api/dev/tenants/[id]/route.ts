import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  backups,
  consultations,
  consulentes,
  methods,
  monthlyGoals,
  payments,
  sessions,
  spiritualWorks,
  tenantSettings,
  tenants,
  transactions,
  workCatalog,
  workPayments,
} from "@/db/schema";
import { asCents, asInt, fail, readJson, requireDeveloper, str } from "@/lib/api";
import { resolveExpiry } from "@/lib/auth";
import { hashPassword, normalizeEmail, tenantPasswordError, validateEmail } from "@/lib/password";
import { addDaysISO, todayISO } from "@/lib/format";
import type { Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

const PLANS: Plan[] = ["monthly", "annual", "lifetime"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDeveloper();
  if (auth.error) return auth.error;
  const { id } = await params;
  const tenantId = asInt(id, 0);
  if (!tenantId) return fail("Conta inválida.", 400);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return fail("Conta não encontrada.", 404);

  const body = await readJson(req);
  const patch: Partial<typeof tenants.$inferInsert> = {};

  if (body.name !== undefined) {
    const name = str(body.name, 140);
    if (name.length < 2) return fail("Informe o nome da conta.", 400);
    patch.name = name;
  }
  if (body.ownerName !== undefined) patch.ownerName = str(body.ownerName, 140) || tenant.ownerName;
  if (body.email !== undefined) {
    const email = normalizeEmail(str(body.email, 200));
    if (!validateEmail(email)) return fail("E-mail inválido.", 400);
    const [other] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.email, email)).limit(1);
    if (other && other.id !== tenantId) return fail("Outra conta já usa este e-mail.", 409);
    patch.email = email;
  }
  if (body.phone !== undefined) patch.phone = str(body.phone, 40) || null;
  if (body.notes !== undefined) patch.notes = str(body.notes, 1000) || null;
  if (body.priceCents !== undefined) patch.priceCents = asCents(body.priceCents);
  if (body.password !== undefined && body.password !== "") {
    const passwordError = tenantPasswordError(body.password);
    if (passwordError) return fail(passwordError, 400);
    patch.passwordHash = hashPassword(body.password as string);
  }

  const planChanged = body.plan !== undefined && PLANS.includes(str(body.plan) as Plan) && str(body.plan) !== tenant.plan;
  if (planChanged) {
    const plan = str(body.plan) as Plan;
    patch.plan = plan;
    patch.startedAt = todayISO();
    patch.expiresAt = resolveExpiry(plan, todayISO());
    patch.status = "active";
  }

  if (body.renewDays !== undefined) {
    const days = Math.min(3650, Math.max(1, asInt(body.renewDays, 30)));
    patch.startedAt = todayISO();
    patch.expiresAt = addDaysISO(todayISO(), days);
    patch.status = "active";
  }

  if (body.startedAt !== undefined) {
    const startedAt = str(body.startedAt, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) return fail("Data de início inválida.", 400);
    patch.startedAt = startedAt;
    const plan = (patch.plan as Plan) ?? (tenant.plan as Plan);
    if (!patch.expiresAt) patch.expiresAt = resolveExpiry(plan, startedAt);
  }

  if (body.status !== undefined && body.renewDays === undefined) {
    const status = str(body.status);
    if (!["active", "blocked", "expired"].includes(status)) return fail("Status inválido.", 400);
    patch.status = status;
    const plan = (patch.plan ?? tenant.plan) as Plan;
    const expiry = patch.expiresAt !== undefined ? patch.expiresAt : (tenant.expiresAt ?? resolveExpiry(plan, tenant.startedAt));
    if (status === "active" && plan !== "lifetime" && expiry && expiry < todayISO()) {
      patch.startedAt = todayISO();
      patch.expiresAt = resolveExpiry(plan, todayISO());
    }
  }

  const [updated] = await db.update(tenants).set(patch).where(eq(tenants.id, tenantId)).returning();
  if ((patch.status && patch.status !== "active") || patch.passwordHash !== undefined) {
    await db.delete(sessions).where(and(eq(sessions.role, "tenant"), eq(sessions.tenantId, tenantId)));
  }
  return Response.json({ ok: true, tenant: { ...updated, passwordHash: undefined } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDeveloper();
  if (auth.error) return auth.error;
  const { id } = await params;
  const tenantId = asInt(id, 0);
  if (!tenantId) return fail("Conta inválida.", 400);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return fail("Conta não encontrada.", 404);

  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(and(eq(sessions.role, "tenant"), eq(sessions.tenantId, tenantId)));
    await tx.delete(transactions).where(eq(transactions.tenantId, tenantId));
    await tx.delete(workPayments).where(eq(workPayments.tenantId, tenantId));
    await tx.delete(spiritualWorks).where(eq(spiritualWorks.tenantId, tenantId));
    await tx.delete(workCatalog).where(eq(workCatalog.tenantId, tenantId));
    await tx.delete(payments).where(eq(payments.tenantId, tenantId));
    await tx.delete(consultations).where(eq(consultations.tenantId, tenantId));
    await tx.delete(methods).where(eq(methods.tenantId, tenantId));
    await tx.delete(consulentes).where(eq(consulentes.tenantId, tenantId));
    await tx.delete(monthlyGoals).where(eq(monthlyGoals.tenantId, tenantId));
    await tx.delete(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
    await tx.delete(backups).where(eq(backups.tenantId, tenantId));
    await tx.delete(auditLog).where(eq(auditLog.tenantId, tenantId));
    await tx.delete(tenants).where(eq(tenants.id, tenantId));
  });

  return Response.json({
    ok: true,
    message: `Conta "${tenant.name}" removida e acesso encerrado. Os pagamentos de licença foram mantidos no faturamento histórico.`,
  });
}
