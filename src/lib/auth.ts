import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { developers, sessions, tenants } from "@/db/schema";
import type { Plan, TenantStatus } from "@/lib/types";
import { addDaysISO, todayISO } from "@/lib/format";

export const SESSION_COOKIE = "cartomante_session";
const SESSION_DAYS = 30;

export type TenantRow = typeof tenants.$inferSelect;
export type DeveloperRow = typeof developers.$inferSelect;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(":");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function planDurationDays(plan: Plan): number | null {
  if (plan === "monthly") return 30;
  if (plan === "annual") return 365;
  return null;
}

export function resolveExpiry(plan: Plan, startedAt: string): string | null {
  const days = planDurationDays(plan);
  if (days === null) return null;
  return addDaysISO(startedAt, days);
}

export function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(`${expiresAt}T23:59:59`).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

/** Bloqueia automaticamente mensal/anual vencido (sem intervenção do desenvolvedor). */
export function subscriptionState(tenant: Pick<TenantRow, "plan" | "status" | "expiresAt" | "startedAt">) {
  const plan = tenant.plan as Plan;
  const expiresAt = tenant.expiresAt ?? resolveExpiry(plan, tenant.startedAt ?? todayISO());
  const isExpired = plan !== "lifetime" && expiresAt !== null && expiresAt < todayISO();
  const status: TenantStatus =
    tenant.status === "blocked" ? "blocked" : isExpired && tenant.status !== "expired" ? "expired" : (tenant.status as TenantStatus);
  return { plan, expiresAt, status, daysLeft: daysLeft(expiresAt), expired: status === "expired" };
}

export async function syncTenantExpiry(tenant: TenantRow): Promise<TenantRow> {
  const state = subscriptionState(tenant);
  if (state.status !== tenant.status) {
    const [updated] = await db
      .update(tenants)
      .set({ status: state.status })
      .where(eq(tenants.id, tenant.id))
      .returning();
    return updated ?? tenant;
  }
  return tenant;
}

export async function createSession(role: "developer" | "tenant", id: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.insert(sessions).values({
    token,
    role,
    developerId: role === "developer" ? id : null,
    tenantId: role === "tenant" ? id : null,
    expiresAt,
  });
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt, maxAge: SESSION_DAYS * 86400 };
}

export const cookieOptions = (maxAge: number) => ({
  name: SESSION_COOKIE,
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge,
});

export async function readSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }
  return row;
}

export async function currentTenant(): Promise<TenantRow | null> {
  const session = await readSession();
  if (!session || session.role !== "tenant" || !session.tenantId) return null;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, session.tenantId)).limit(1);
  if (!tenant) return null;
  return syncTenantExpiry(tenant);
}

export async function currentDeveloper(): Promise<DeveloperRow | null> {
  const session = await readSession();
  if (!session || session.role !== "developer" || !session.developerId) return null;
  const [dev] = await db.select().from(developers).where(eq(developers.id, session.developerId)).limit(1);
  return dev ?? null;
}

export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  store.delete(SESSION_COOKIE);
}

export async function deleteTenantSessions(tenantId: number) {
  await db.delete(sessions).where(and(eq(sessions.role, "tenant"), eq(sessions.tenantId, tenantId)));
}
