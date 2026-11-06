import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  backups,
  consultations,
  consulentes,
  methods,
  monthlyGoals,
  payments,
  spiritualWorks,
  tenantSettings,
  transactions,
  workCatalog,
  workPayments,
} from "@/db/schema";
import {
  asCents,
  asInt,
  fail,
  isISODate,
  isTime,
  normalizeName,
  normalizePhone,
  optionalImageStr,
  optionalStr,
  readJson,
  requireTenant,
  str,
} from "@/lib/api";
import { getTenantSettings, saveTenantSettings } from "@/lib/settings";
import { PALETTES } from "@/lib/palettes";
import { CURRENCIES } from "@/lib/format";
import { isClientOrigin } from "@/lib/client-origins";
import { isMood } from "@/lib/moods";
import type { TenantSettingsData } from "@/lib/types";
import { recalcAllPayments } from "@/lib/records";

export const dynamic = "force-dynamic";

export async function buildSnapshot(tenantId: number) {
  const [
    consulenteRows,
    methodRows,
    consultationRows,
    paymentRows,
    catalogRows,
    workRows,
    workPaymentRows,
    transactionRows,
    goalRows,
    settings,
  ] = await Promise.all([
    db.select().from(consulentes).where(eq(consulentes.tenantId, tenantId)),
    db.select().from(methods).where(eq(methods.tenantId, tenantId)),
    db.select().from(consultations).where(eq(consultations.tenantId, tenantId)),
    db.select().from(payments).where(eq(payments.tenantId, tenantId)),
    db.select().from(workCatalog).where(eq(workCatalog.tenantId, tenantId)),
    db.select().from(spiritualWorks).where(eq(spiritualWorks.tenantId, tenantId)),
    db.select().from(workPayments).where(eq(workPayments.tenantId, tenantId)),
    db.select().from(transactions).where(eq(transactions.tenantId, tenantId)),
    db.select().from(monthlyGoals).where(eq(monthlyGoals.tenantId, tenantId)),
    getTenantSettings(tenantId),
  ]);

  return {
    app: "Cartomante Pro",
    version: "1.1",
    exportedAt: new Date().toISOString(),
    storeType: "postgres-tenant",
    settings,
    data: {
      consulentes: consulenteRows,
      methods: methodRows,
      consultations: consultationRows,
      payments: paymentRows,
      workCatalog: catalogRows,
      spiritualWorks: workRows,
      workPayments: workPaymentRows,
      transactions: transactionRows,
      goals: goalRows,
    },
    counts: {
      consulentes: consulenteRows.length,
      methods: methodRows.length,
      consultas: consultationRows.length,
      pagamentos: paymentRows.length,
      catalogoTrabalhos: catalogRows.length,
      trabalhos: workRows.length,
      pagamentosTrabalhos: workPaymentRows.length,
      lancamentos: transactionRows.length,
      metas: goalRows.length,
    },
  };
}

export async function GET() {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const snapshot = await buildSnapshot(auth.tenant.id);
  const filename = `cartomante-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(snapshot, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

type Row = Record<string, unknown>;

function rowsOf(value: unknown, key: string): Row[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`O campo "${key}" do arquivo é inválido.`);
  return value.filter((item): item is Row => typeof item === "object" && item !== null);
}

export async function POST(req: Request) {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const tenantId = auth.tenant.id;
  const body = await readJson(req);
  const mode = str(body.mode) === "replace" ? "replace" : "merge";
  const rawPayload = (body.payload ?? body) as Row;
  const data = (rawPayload.data ?? {}) as Record<string, unknown>;

  if (rawPayload.app !== undefined && rawPayload.app !== "Cartomante Pro") {
    return fail("Arquivo não reconhecido. Use um backup exportado pelo Cartomante Pro.", 400);
  }
  if (rawPayload.version === undefined) {
    return fail("O arquivo não informa a versão do esquema. Importação cancelada.", 400);
  }
  const keys = [
    "consulentes",
    "methods",
    "consultations",
    "payments",
    "workCatalog",
    "spiritualWorks",
    "workPayments",
    "transactions",
    "goals",
  ];
  if (!keys.some((key) => Array.isArray(data[key]))) {
    return fail("Arquivo incompleto: nenhum conjunto de dados foi encontrado.", 400);
  }

  let importData: Record<string, Row[]>;
  try {
    importData = Object.fromEntries(keys.map((key) => [key, rowsOf(data[key], key)]));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Arquivo inválido.", 400);
  }

  // Cópia de segurança dos dados atuais antes de restaurar.
  const currentSnapshot = await buildSnapshot(tenantId);
  await db.insert(backups).values({
    tenantId,
    payload: currentSnapshot as unknown as Record<string, unknown>,
    counts: currentSnapshot.counts,
    reason: `pre-restore:${mode}`,
  });

  const created = {
    consulentes: 0,
    methods: 0,
    consultations: 0,
    payments: 0,
    workCatalog: 0,
    spiritualWorks: 0,
    workPayments: 0,
    transactions: 0,
    goals: 0,
  };
  const skipped = {
    consulentes: 0,
    methods: 0,
    consultations: 0,
    payments: 0,
    workCatalog: 0,
    spiritualWorks: 0,
    workPayments: 0,
    transactions: 0,
    goals: 0,
  };

  if (mode === "replace") {
    await db.delete(transactions).where(eq(transactions.tenantId, tenantId));
    await db.delete(workPayments).where(eq(workPayments.tenantId, tenantId));
    await db.delete(spiritualWorks).where(eq(spiritualWorks.tenantId, tenantId));
    await db.delete(workCatalog).where(eq(workCatalog.tenantId, tenantId));
    await db.delete(payments).where(eq(payments.tenantId, tenantId));
    await db.delete(consultations).where(eq(consultations.tenantId, tenantId));
    await db.delete(methods).where(eq(methods.tenantId, tenantId));
    await db.delete(consulentes).where(eq(consulentes.tenantId, tenantId));
    await db.delete(monthlyGoals).where(eq(monthlyGoals.tenantId, tenantId));
  }

  const existingConsulentes = await db.select().from(consulentes).where(eq(consulentes.tenantId, tenantId));
  const consulenteMap = new Map<number, number>();
  for (const row of importData.consulentes) {
    const name = str(row.name, 160);
    if (!name) {
      skipped.consulentes += 1;
      continue;
    }
    const phone = optionalStr(row.phone, 40);
    const match = existingConsulentes.find(
      (c) =>
        normalizeName(c.name) === normalizeName(name) &&
        (!phone || !c.phone || normalizePhone(phone) === normalizePhone(c.phone)),
    );
    if (match) {
      consulenteMap.set(asInt(row.id), match.id);
      skipped.consulentes += 1;
      continue;
    }
    const parsedCreatedAt = typeof row.createdAt === "string" ? new Date(row.createdAt) : null;
    const createdAt = parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime()) ? parsedCreatedAt : undefined;
    const [inserted] = await db
      .insert(consulentes)
      .values({
        tenantId,
        name,
        phone,
        notes: optionalStr(row.notes, 2000),
        origin: isClientOrigin(row.origin) ? row.origin : "nao_informado",
        archived: Boolean(row.archived),
        ...(createdAt ? { createdAt } : {}),
      })
      .returning();
    existingConsulentes.push(inserted);
    consulenteMap.set(asInt(row.id), inserted.id);
    created.consulentes += 1;
  }

  const existingMethods = await db.select().from(methods).where(eq(methods.tenantId, tenantId));
  const methodMap = new Map<number, number>();
  for (const row of importData.methods) {
    const name = str(row.name, 120);
    if (!name) continue;
    const match = existingMethods.find((m) => normalizeName(m.name) === normalizeName(name));
    if (match) {
      methodMap.set(asInt(row.id), match.id);
      skipped.methods += 1;
      continue;
    }
    const [inserted] = await db
      .insert(methods)
      .values({
        tenantId,
        name,
        description: optionalStr(row.description, 1000),
        priceCents: asCents(row.priceCents),
        durationMinutes: Math.min(600, Math.max(5, asInt(row.durationMinutes, 60))),
        active: row.active === false ? false : true,
        archived: Boolean(row.archived),
      })
      .returning();
    existingMethods.push(inserted);
    methodMap.set(asInt(row.id), inserted.id);
    created.methods += 1;
  }

  const existingConsultations = await db.select().from(consultations).where(eq(consultations.tenantId, tenantId));
  const consultationMap = new Map<number, number>();
  for (const row of importData.consultations) {
    const oldConsulente = asInt(row.consulenteId);
    const newConsulente = consulenteMap.get(oldConsulente);
    if (!newConsulente) {
      skipped.consultations += 1;
      continue;
    }
    const date = str(row.date, 10);
    const startTime = str(row.startTime, 5);
    if (!isISODate(date) || !isTime(startTime)) {
      skipped.consultations += 1;
      continue;
    }
    const duplicate = existingConsultations.find(
      (c) => c.consulenteId === newConsulente && c.date === date && c.startTime === startTime,
    );
    if (duplicate) {
      consultationMap.set(asInt(row.id), duplicate.id);
      skipped.consultations += 1;
      continue;
    }
    const methodName = str(row.methodName, 120) || "Atendimento";
    const [inserted] = await db
      .insert(consultations)
      .values({
        tenantId,
        consulenteId: newConsulente,
        methodId: methodMap.get(asInt(row.methodId)) ?? null,
        methodName,
        methodPriceCents: asCents(row.methodPriceCents),
        priceCents: asCents(row.priceCents),
        date,
        startTime,
        durationMinutes: Math.min(600, Math.max(5, asInt(row.durationMinutes, 60))),
        actualSeconds: Math.max(0, asInt(row.actualSeconds, 0)),
        status: str(row.status, 20) || "agendada",
        paymentStatus: "pendente",
        paymentMethod: optionalStr(row.paymentMethod, 60),
        notes: optionalStr(row.notes, 2000),
      })
      .returning();
    existingConsultations.push(inserted);
    consultationMap.set(asInt(row.id), inserted.id);
    created.consultations += 1;
  }

  const existingPayments = await db.select().from(payments).where(eq(payments.tenantId, tenantId));
  const existingKeys = new Set(existingPayments.map((p) => p.idempotencyKey));
  for (const row of importData.payments) {
    const newConsultation = consultationMap.get(asInt(row.consultationId));
    if (!newConsultation) {
      skipped.payments += 1;
      continue;
    }
    const oldId = asInt(row.id);
    const key = str(row.idempotencyKey, 140) || `import-${oldId}`;
    if (existingKeys.has(key)) {
      skipped.payments += 1;
      continue;
    }
    const amountCents = asInt(row.amountCents, 0);
    if (amountCents === 0) {
      skipped.payments += 1;
      continue;
    }
    const paidAt = isISODate(row.paidAt) ? row.paidAt : new Date().toISOString().slice(0, 10);
    const [inserted] = await db
      .insert(payments)
      .values({
        tenantId,
        consultationId: newConsultation,
        amountCents,
        paidAt,
        method: str(row.method, 60) || "pix",
        notes: optionalStr(row.notes, 1000),
        kind: str(row.kind) === "estorno" ? "estorno" : "pagamento",
        idempotencyKey: key,
      })
      .returning();
    existingKeys.add(key);
    created.payments += 1;
    await db.insert(transactions).values({
      tenantId,
      type: amountCents >= 0 ? "entrada" : "despesa",
      description: amountCents >= 0 ? "Pagamento importado de backup" : "Estorno importado de backup",
      amountCents: Math.abs(amountCents),
      date: paidAt,
      category: amountCents >= 0 ? "Consultas" : "Estornos",
      paymentMethod: str(row.method, 60) || "Pix",
      consultationId: newConsultation,
      paymentId: inserted.id,
      reference: `${amountCents >= 0 ? "payment" : "refund"}:${inserted.id}`,
    });
  }

  const existingWorkCatalog = await db.select().from(workCatalog).where(eq(workCatalog.tenantId, tenantId));
  const workCatalogMap = new Map<number, number>();
  for (const row of importData.workCatalog) {
    const name = str(row.name, 140);
    if (!name) continue;
    const match = existingWorkCatalog.find((item) => normalizeName(item.name) === normalizeName(name));
    if (match) {
      workCatalogMap.set(asInt(row.id), match.id);
      skipped.workCatalog += 1;
      continue;
    }
    const kind = str(row.kind) === "atividade" ? "atividade" : "magia";
    const [inserted] = await db
      .insert(workCatalog)
      .values({
        tenantId,
        kind,
        name,
        description: optionalStr(row.description, 1500),
        materials: optionalStr(row.materials, 1000),
        priceCents: asCents(row.priceCents),
        cycleDays: Math.min(365, Math.max(1, asInt(row.cycleDays, kind === "magia" ? 7 : 1))),
        durationMinutes: Math.min(600, Math.max(5, asInt(row.durationMinutes, 60))),
        imageUrl: optionalImageStr(row.imageUrl),
        active: row.active === false ? false : true,
        archived: Boolean(row.archived),
      })
      .returning();
    existingWorkCatalog.push(inserted);
    workCatalogMap.set(asInt(row.id), inserted.id);
    created.workCatalog += 1;
  }

  const existingWorks = await db.select().from(spiritualWorks).where(eq(spiritualWorks.tenantId, tenantId));
  const workMap = new Map<number, number>();
  for (const row of importData.spiritualWorks) {
    const newConsulente = consulenteMap.get(asInt(row.consulenteId));
    const date = str(row.date, 10);
    const title = str(row.title, 160) || "Trabalho";
    if (!newConsulente || !isISODate(date)) {
      skipped.spiritualWorks += 1;
      continue;
    }
    const duplicate = existingWorks.find(
      (w) => w.consulenteId === newConsulente && w.date === date && normalizeName(w.title) === normalizeName(title),
    );
    if (duplicate) {
      workMap.set(asInt(row.id), duplicate.id);
      skipped.spiritualWorks += 1;
      continue;
    }
    const [inserted] = await db
      .insert(spiritualWorks)
      .values({
        tenantId,
        consulenteId: newConsulente,
        catalogId: workCatalogMap.get(asInt(row.catalogId)) ?? null,
        kind: str(row.kind) === "atividade" ? "atividade" : "magia",
        title,
        catalogPriceCents: asCents(row.catalogPriceCents),
        priceCents: asCents(row.priceCents),
        materialCostCents: asCents(row.materialCostCents),
        date,
        startTime: optionalStr(row.startTime, 5),
        endDate: isISODate(row.endDate) ? row.endDate : null,
        durationMinutes: Math.min(600, Math.max(5, asInt(row.durationMinutes, 60))),
        cycleDays: Math.min(365, Math.max(1, asInt(row.cycleDays, 1))),
        status: str(row.status, 24) || "em_andamento",
        paymentStatus: "pendente",
        paymentMethod: optionalStr(row.paymentMethod, 60),
        intention: optionalStr(row.intention, 1000),
        materials: optionalStr(row.materials, 1500),
        imageUrl: optionalImageStr(row.imageUrl),
        notes: optionalStr(row.notes, 2000),
      })
      .returning();
    existingWorks.push(inserted);
    workMap.set(asInt(row.id), inserted.id);
    created.spiritualWorks += 1;
  }

  const existingWorkPayments = await db.select().from(workPayments).where(eq(workPayments.tenantId, tenantId));
  const existingWorkKeys = new Set(existingWorkPayments.map((p) => p.idempotencyKey));
  for (const row of importData.workPayments) {
    const newWork = workMap.get(asInt(row.workId));
    if (!newWork) {
      skipped.workPayments += 1;
      continue;
    }
    const key = str(row.idempotencyKey, 140) || `import-work-${asInt(row.id)}`;
    if (existingWorkKeys.has(key)) {
      skipped.workPayments += 1;
      continue;
    }
    const amountCents = asInt(row.amountCents, 0);
    if (amountCents === 0) {
      skipped.workPayments += 1;
      continue;
    }
    const paidAt = isISODate(row.paidAt) ? row.paidAt : new Date().toISOString().slice(0, 10);
    const [inserted] = await db
      .insert(workPayments)
      .values({
        tenantId,
        workId: newWork,
        amountCents,
        paidAt,
        method: str(row.method, 60) || "Pix",
        notes: optionalStr(row.notes, 1000),
        kind: str(row.kind) === "estorno" ? "estorno" : "pagamento",
        idempotencyKey: key,
      })
      .returning();
    existingWorkKeys.add(key);
    created.workPayments += 1;
    await db.insert(transactions).values({
      tenantId,
      type: amountCents >= 0 ? "entrada" : "despesa",
      description: amountCents >= 0 ? "Pagamento de trabalho importado" : "Estorno de trabalho importado",
      amountCents: Math.abs(amountCents),
      date: paidAt,
      category: amountCents >= 0 ? "Trabalhos e terapias" : "Estornos",
      paymentMethod: str(row.method, 60) || "Pix",
      workId: newWork,
      workPaymentId: inserted.id,
      reference: `${amountCents >= 0 ? "work_payment" : "work_refund"}:${inserted.id}`,
    });
  }

  const existingTransactions = await db.select().from(transactions).where(eq(transactions.tenantId, tenantId));
  for (const row of importData.transactions) {
    if (row.paymentId || row.workPaymentId) {
      skipped.transactions += 1;
      continue;
    }
    const reference = str(row.reference, 140);
    if (reference && existingTransactions.some((t) => t.reference === reference)) {
      skipped.transactions += 1;
      continue;
    }
    const date = isISODate(row.date) ? row.date : new Date().toISOString().slice(0, 10);
    const amountCents = asCents(row.amountCents);
    const type = str(row.type) === "despesa" ? "despesa" : "entrada";
    if (!amountCents) {
      skipped.transactions += 1;
      continue;
    }
    const duplicate = existingTransactions.find(
      (t) =>
        !t.paymentId &&
        t.type === type &&
        t.date === date &&
        t.amountCents === amountCents &&
        normalizeName(t.description) === normalizeName(str(row.description, 200)),
    );
    if (duplicate) {
      skipped.transactions += 1;
      continue;
    }
    await db.insert(transactions).values({
      tenantId,
      type,
      description: str(row.description, 200) || "Lançamento importado",
      amountCents,
      date,
      category: str(row.category, 80) || "Outros",
      paymentMethod: str(row.paymentMethod, 60) || "Pix",
      notes: optionalStr(row.notes, 1000),
      reference: reference || `import:${tenantId}:${created.transactions}-${date}`,
    });
    created.transactions += 1;
  }

  const existingGoals = await db.select().from(monthlyGoals).where(eq(monthlyGoals.tenantId, tenantId));
  for (const row of importData.goals) {
    const month = str(row.month, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const amountCents = asCents(row.amountCents);
    const existing = existingGoals.find((g) => g.month === month);
    if (existing) {
      if (mode === "replace") {
        await db
          .update(monthlyGoals)
          .set({ amountCents, updatedAt: new Date() })
          .where(and(eq(monthlyGoals.tenantId, tenantId), eq(monthlyGoals.month, month)));
        created.goals += 1;
      } else {
        skipped.goals += 1;
      }
      continue;
    }
    await db.insert(monthlyGoals).values({ tenantId, month, amountCents });
    created.goals += 1;
  }

  if (mode === "replace" && rawPayload.settings && typeof rawPayload.settings === "object") {
    const incoming = rawPayload.settings as Partial<TenantSettingsData>;
    const patch: Partial<TenantSettingsData> = {};
    if (incoming.professionalName !== undefined) patch.professionalName = str(incoming.professionalName, 120);
    if (incoming.currency && CURRENCIES[incoming.currency]) patch.currency = incoming.currency;
    if (incoming.palette && PALETTES.some((p) => p.id === incoming.palette)) patch.palette = incoming.palette;
    if (incoming.monthlyGoalCents !== undefined) patch.monthlyGoalCents = asCents(incoming.monthlyGoalCents);
    if (incoming.initialBalanceCents !== undefined) patch.initialBalanceCents = asCents(incoming.initialBalanceCents);
    if (Array.isArray(incoming.expenseCategories)) patch.expenseCategories = incoming.expenseCategories.map((c) => str(c, 80)).filter(Boolean);
    if (Array.isArray(incoming.incomeCategories)) patch.incomeCategories = incoming.incomeCategories.map((c) => str(c, 80)).filter(Boolean);
    if (incoming.paymentInstructions !== undefined) patch.paymentInstructions = str(incoming.paymentInstructions, 600);
    if (incoming.about !== undefined) patch.about = str(incoming.about, 1000);
    if (incoming.profileImage !== undefined) patch.profileImage = optionalImageStr(incoming.profileImage) ?? "";
    if (incoming.coverImage !== undefined) patch.coverImage = optionalImageStr(incoming.coverImage) ?? "";
    if (incoming.dailyMood === null) patch.dailyMood = null;
    else if (incoming.dailyMood && isISODate(incoming.dailyMood.date) && isMood(incoming.dailyMood.mood)) {
      patch.dailyMood = { date: incoming.dailyMood.date, mood: incoming.dailyMood.mood };
    }
    await saveTenantSettings(tenantId, patch);
  }

  await recalcAllPayments(tenantId);

  // Preserva o bloqueio local por senha atual (não sobrescreve credencial de segurança).
  const [settingsRow] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);
  if (!settingsRow) await saveTenantSettings(tenantId, {});

  return Response.json({
    ok: true,
    mode,
    created,
    skipped,
    message:
      mode === "replace"
        ? "Backup restaurado. Os dados anteriores foram copiados para a lixeira de segurança antes da substituição."
        : "Backup mesclado. Registros duplicados foram ignorados.",
  });
}


