import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, tenants } from "@/db/schema";
import { currentDeveloper, currentTenant, type DeveloperRow, type TenantRow } from "@/lib/auth";
import { subscriptionState } from "@/lib/auth";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function str(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function optionalStr(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

export function optionalImageStr(value: unknown, max = 450000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) return trimmed.slice(0, max);
  return trimmed;
}

export function asInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string") {
    const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
    const parsed = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed * 100));
  }
  return 0;
}

export function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export type TenantAuth = { tenant: TenantRow; error?: never } | { tenant?: never; error: Response };

export async function requireTenant(): Promise<TenantAuth> {
  const tenant = await currentTenant();
  if (!tenant) return { error: fail("Sessão expirada. Faça login novamente.", 401) };
  const state = subscriptionState(tenant);
  if (state.status === "expired") {
    return {
      error: fail(
        "Sua licença de acesso está vencida. Realize o pagamento para liberar o painel novamente.",
        402,
        { code: "expired", expiresAt: state.expiresAt },
      ),
    };
  }
  if (state.status === "blocked") {
    return { error: fail("Este acesso foi bloqueado pelo desenvolvedor. Fale com o suporte.", 403, { code: "blocked" }) };
  }
  return { tenant };
}

export async function requireDeveloper(): Promise<{ developer: DeveloperRow; error?: never } | { developer?: never; error: Response }> {
  const developer = await currentDeveloper();
  if (!developer) return { error: fail("Acesso de desenvolvedor necessário.", 401) };
  return { developer };
}

export async function logAudit(
  tenantId: number,
  action: string,
  entity: string,
  entityId: string | number | null,
  detail?: Record<string, unknown>,
) {
  try {
    await db.insert(auditLog).values({
      tenantId,
      action,
      entity,
      entityId: entityId === null ? null : String(entityId),
      detail: detail ?? null,
    });
  } catch {
    // auditoria nunca deve impedir a operação principal
  }
}

export async function findTenantById(id: number) {
  const [tenant] = await db.select().from(tenants).where(and(eq(tenants.id, id))).limit(1);
  return tenant ?? null;
}

export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
