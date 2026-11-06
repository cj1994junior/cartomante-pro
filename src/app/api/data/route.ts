import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  consultations,
  consulentes,
  methods,
  monthlyGoals,
  payments,
  spiritualWorks,
  transactions,
  workCatalog,
  workPayments,
} from "@/db/schema";
import { fail, requireTenant } from "@/lib/api";
import { subscriptionState } from "@/lib/auth";
import { getTenantSettings } from "@/lib/settings";
import { isClientOrigin } from "@/lib/client-origins";
import { ensureWorkCatalogForTenant } from "@/lib/work-defaults";
import type { DataBundle, Plan, TenantStatus, WorkKind, WorkStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const tenant = auth.tenant;

  await ensureWorkCatalogForTenant(tenant.id, tenant.isDemo);

  const [
    settings,
    consulenteRows,
    methodRows,
    consultationRows,
    paymentRows,
    catalogRows,
    workRows,
    workPaymentRows,
    transactionRows,
    goalRows,
  ] = await Promise.all([
    getTenantSettings(tenant.id),
    db.select().from(consulentes).where(eq(consulentes.tenantId, tenant.id)).orderBy(consulentes.name),
    db.select().from(methods).where(eq(methods.tenantId, tenant.id)).orderBy(methods.name),
    db.select().from(consultations).where(eq(consultations.tenantId, tenant.id)).orderBy(desc(consultations.date), consultations.startTime),
    db.select().from(payments).where(eq(payments.tenantId, tenant.id)).orderBy(desc(payments.paidAt)),
    db.select().from(workCatalog).where(eq(workCatalog.tenantId, tenant.id)).orderBy(workCatalog.kind, workCatalog.name),
    db.select().from(spiritualWorks).where(eq(spiritualWorks.tenantId, tenant.id)).orderBy(desc(spiritualWorks.date), desc(spiritualWorks.id)),
    db.select().from(workPayments).where(eq(workPayments.tenantId, tenant.id)).orderBy(desc(workPayments.paidAt)),
    db.select().from(transactions).where(eq(transactions.tenantId, tenant.id)).orderBy(desc(transactions.date), desc(transactions.id)),
    db.select().from(monthlyGoals).where(eq(monthlyGoals.tenantId, tenant.id)),
  ]);

  const state = subscriptionState(tenant);
  const bundle: DataBundle = {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      ownerName: tenant.ownerName,
      email: tenant.email,
      plan: tenant.plan as Plan,
      status: state.status as TenantStatus,
      expiresAt: state.expiresAt,
      startedAt: tenant.startedAt,
      isDemo: tenant.isDemo,
    },
    settings,
    consulentes: consulenteRows.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      notes: c.notes,
      origin: isClientOrigin(c.origin) ? c.origin : "nao_informado",
      archived: c.archived,
      createdAt: c.createdAt.toISOString(),
    })),
    methods: methodRows.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      priceCents: m.priceCents,
      durationMinutes: m.durationMinutes,
      active: m.active,
      archived: m.archived,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
    consultations: consultationRows.map((c) => ({
      id: c.id,
      consulenteId: c.consulenteId,
      methodId: c.methodId,
      methodName: c.methodName,
      methodPriceCents: c.methodPriceCents,
      priceCents: c.priceCents,
      date: c.date,
      startTime: c.startTime,
      durationMinutes: c.durationMinutes,
      actualSeconds: c.actualSeconds,
      timerStartedAt: c.timerStartedAt ? c.timerStartedAt.toISOString() : null,
      timerEndedAt: c.timerEndedAt ? c.timerEndedAt.toISOString() : null,
      status: c.status as DataBundle["consultations"][number]["status"],
      paymentStatus: c.paymentStatus as DataBundle["consultations"][number]["paymentStatus"],
      paymentMethod: c.paymentMethod,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
    })),
    payments: paymentRows.map((p) => ({
      id: p.id,
      consultationId: p.consultationId,
      amountCents: p.amountCents,
      paidAt: p.paidAt,
      method: p.method,
      notes: p.notes,
      kind: p.kind as "pagamento" | "estorno",
      createdAt: p.createdAt.toISOString(),
    })),
    workCatalog: catalogRows.map((w) => ({
      id: w.id,
      kind: (w.kind === "atividade" ? "atividade" : "magia") as WorkKind,
      name: w.name,
      description: w.description,
      materials: w.materials,
      priceCents: w.priceCents,
      cycleDays: w.cycleDays,
      durationMinutes: w.durationMinutes,
      imageUrl: w.imageUrl,
      active: w.active,
      archived: w.archived,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    })),
    spiritualWorks: workRows.map((w) => ({
      id: w.id,
      consulenteId: w.consulenteId,
      catalogId: w.catalogId,
      kind: (w.kind === "atividade" ? "atividade" : "magia") as WorkKind,
      title: w.title,
      catalogPriceCents: w.catalogPriceCents,
      priceCents: w.priceCents,
      materialCostCents: w.materialCostCents,
      date: w.date,
      startTime: w.startTime,
      endDate: w.endDate,
      durationMinutes: w.durationMinutes,
      cycleDays: w.cycleDays,
      status: w.status as WorkStatus,
      paymentStatus: w.paymentStatus as DataBundle["spiritualWorks"][number]["paymentStatus"],
      paymentMethod: w.paymentMethod,
      intention: w.intention,
      materials: w.materials,
      imageUrl: w.imageUrl,
      notes: w.notes,
      createdAt: w.createdAt.toISOString(),
    })),
    workPayments: workPaymentRows.map((p) => ({
      id: p.id,
      workId: p.workId,
      amountCents: p.amountCents,
      paidAt: p.paidAt,
      method: p.method,
      notes: p.notes,
      kind: p.kind as "pagamento" | "estorno",
      createdAt: p.createdAt.toISOString(),
    })),
    transactions: transactionRows.map((t) => ({
      id: t.id,
      type: t.type as "entrada" | "despesa",
      description: t.description,
      amountCents: t.amountCents,
      date: t.date,
      category: t.category,
      paymentMethod: t.paymentMethod,
      notes: t.notes,
      consultationId: t.consultationId,
      paymentId: t.paymentId,
      workId: t.workId,
      workPaymentId: t.workPaymentId,
      reference: t.reference,
      createdAt: t.createdAt.toISOString(),
    })),
    goals: goalRows.map((g) => ({ id: g.id, month: g.month, amountCents: g.amountCents })),
  };

  if (state.status === "blocked") return fail("Acesso bloqueado pelo desenvolvedor.", 403, { code: "blocked" });

  return Response.json(bundle);
}
