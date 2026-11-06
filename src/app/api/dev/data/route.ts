import { and, count, desc, eq, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { consultations, licensePayments, tenants } from "@/db/schema";
import { requireDeveloper } from "@/lib/api";
import { daysLeft, subscriptionState } from "@/lib/auth";
import { getDeveloperSettings } from "@/lib/settings";
import { todayISO } from "@/lib/format";
import { ensureSeed } from "@/lib/seed";
import type { DevData, DevTenant, Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireDeveloper();
  if (auth.error) return auth.error;
  const developer = auth.developer;

  try {
    await ensureSeed();
  } catch (error) {
    console.error("seed error", error);
  }

  // Bloqueio automático de licenças mensais/anuais vencidas.
  await db
    .update(tenants)
    .set({ status: "expired" })
    .where(and(ne(tenants.plan, "lifetime"), eq(tenants.status, "active"), lt(tenants.expiresAt, todayISO())));

  const [tenantRows, paymentRows, countRows] = await Promise.all([
    db.select().from(tenants).orderBy(desc(tenants.createdAt)),
    db
      .select({
        id: licensePayments.id,
        tenantId: licensePayments.tenantId,
        amountCents: licensePayments.amountCents,
        plan: licensePayments.plan,
        paidAt: licensePayments.paidAt,
        reference: licensePayments.reference,
        notes: licensePayments.notes,
        tenantName: tenants.name,
      })
      .from(licensePayments)
      .leftJoin(tenants, eq(tenants.id, licensePayments.tenantId))
      .orderBy(desc(licensePayments.paidAt)),
    db.select({ tenantId: consultations.tenantId, total: count() }).from(consultations).groupBy(consultations.tenantId),
  ]);

  const consultationsByTenant = new Map(countRows.map((r) => [r.tenantId, Number(r.total)]));
  const revenueByTenant = new Map<number, number>();
  for (const p of paymentRows) revenueByTenant.set(p.tenantId, (revenueByTenant.get(p.tenantId) ?? 0) + p.amountCents);

  const tenantList: DevTenant[] = tenantRows.map((t) => {
    const state = subscriptionState(t);
    return {
      id: t.id,
      name: t.name,
      ownerName: t.ownerName,
      email: t.email,
      phone: t.phone,
      plan: t.plan as Plan,
      status: state.status,
      priceCents: t.priceCents,
      startedAt: t.startedAt,
      expiresAt: state.expiresAt,
      notes: t.notes,
      isDemo: t.isDemo,
      createdAt: t.createdAt.toISOString(),
      lastLoginAt: t.lastLoginAt ? t.lastLoginAt.toISOString() : null,
      daysLeft: daysLeft(state.expiresAt),
      consultationsCount: consultationsByTenant.get(t.id) ?? 0,
      revenueCents: revenueByTenant.get(t.id) ?? 0,
    };
  });

  const data: DevData = {
    developer: { id: developer.id, name: developer.name, email: developer.email, settings: await getDeveloperSettings(developer.id) },
    tenants: tenantList,
    licensePayments: paymentRows.map((p) => ({
      id: p.id,
      tenantId: p.tenantId,
      tenantName: p.tenantName ?? "Conta removida",
      amountCents: p.amountCents,
      plan: p.plan as Plan,
      paidAt: p.paidAt,
      reference: p.reference,
      notes: p.notes,
    })),
    demoCredentials: null,
  };

  return Response.json(data);
}
