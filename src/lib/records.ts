import { and, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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
import { derivePaymentStatus } from "@/lib/metrics";
import { isClientOrigin } from "@/lib/client-origins";
import {
  asBool,
  asCents,
  asInt,
  isISODate,
  isTime,
  logAudit,
  normalizeName,
  normalizePhone,
  optionalImageStr,
  optionalStr,
  str,
} from "@/lib/api";
import { addDaysISO } from "@/lib/format";

export const ENTITIES = [
  "consulentes",
  "methods",
  "consultations",
  "payments",
  "work_catalog",
  "spiritual_works",
  "work_payments",
  "transactions",
  "goals",
] as const;
export type Entity = (typeof ENTITIES)[number];

export type RecordResult = { status: number; data: Record<string, unknown> };
export class RecordError extends Error {
  status: number;
  extra: Record<string, unknown>;
  constructor(message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function isEntity(value: string): value is Entity {
  return (ENTITIES as readonly string[]).includes(value);
}

const CONSULTATION_STATUSES = ["agendada", "confirmada", "em_atendimento", "realizada", "cancelada", "nao_compareceu"] as const;
const WORK_STATUSES = ["planejado", "em_andamento", "concluido", "cancelado"] as const;
const WORK_KINDS = ["magia", "atividade"] as const;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  credito: "Cartão de crédito",
  "cartão de crédito": "Cartão de crédito",
  debito: "Cartão de débito",
  "cartão de débito": "Cartão de débito",
  transferencia: "Transferência",
  transferência: "Transferência",
  outro: "Outro",
};

function cleanPaymentMethod(value: unknown): string {
  const text = str(value, 60);
  if (!text) return "Pix";
  return PAYMENT_METHOD_LABELS[text.toLowerCase()] ?? text;
}

async function recomputeConsultation(tenantId: number, consultationId: number) {
  const [consultation] = await db
    .select()
    .from(consultations)
    .where(and(eq(consultations.id, consultationId), eq(consultations.tenantId, tenantId)))
    .limit(1);
  if (!consultation) return;
  const list = await db
    .select()
    .from(payments)
    .where(and(eq(payments.consultationId, consultationId), eq(payments.tenantId, tenantId)));
  const paid = list.reduce((acc, p) => acc + p.amountCents, 0);
  const paymentStatus = consultation.status === "cancelada" ? consultation.paymentStatus : derivePaymentStatus(consultation.priceCents, paid);
  await db
    .update(consultations)
    .set({ paymentStatus, updatedAt: new Date() })
    .where(and(eq(consultations.id, consultationId), eq(consultations.tenantId, tenantId)));
}

async function recomputeWork(tenantId: number, workId: number) {
  const [work] = await db
    .select()
    .from(spiritualWorks)
    .where(and(eq(spiritualWorks.id, workId), eq(spiritualWorks.tenantId, tenantId)))
    .limit(1);
  if (!work) return;
  const list = await db
    .select()
    .from(workPayments)
    .where(and(eq(workPayments.workId, workId), eq(workPayments.tenantId, tenantId)));
  const paid = list.reduce((acc, p) => acc + p.amountCents, 0);
  const paymentStatus = work.status === "cancelado" ? work.paymentStatus : derivePaymentStatus(work.priceCents, paid);
  await db
    .update(spiritualWorks)
    .set({ paymentStatus, updatedAt: new Date() })
    .where(and(eq(spiritualWorks.id, workId), eq(spiritualWorks.tenantId, tenantId)));
}

async function ownedWorkOrFail(tenantId: number, id: number) {
  const [row] = await db
    .select()
    .from(spiritualWorks)
    .where(and(eq(spiritualWorks.id, id), eq(spiritualWorks.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new RecordError("Trabalho ou atividade não encontrado.", 404);
  return row;
}

async function ownedConsultation(tenantId: number, id: number) {
  const [row] = await db
    .select()
    .from(consultations)
    .where(and(eq(consultations.id, id), eq(consultations.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

async function ownedConsultationOrFail(tenantId: number, id: number) {
  const row = await ownedConsultation(tenantId, id);
  if (!row) throw new RecordError("Consulta não encontrada.", 404);
  return row;
}

async function ownedConsulente(tenantId: number, id: number) {
  const [row] = await db
    .select()
    .from(consulentes)
    .where(and(eq(consulentes.id, id), eq(consulentes.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new RecordError("Consulente não encontrada.", 404);
  return row;
}

export async function createRecord(tenantId: number, entity: Entity, body: Record<string, unknown>): Promise<RecordResult> {
  if (entity === "consulentes") {
    const name = str(body.name, 160);
    if (name.length < 2) throw new RecordError("Informe o nome da consulente (mínimo 2 letras).", 400);
    const phone = optionalStr(body.phone, 40);
    const notes = optionalStr(body.notes, 2000);
    if (body.origin !== undefined && !isClientOrigin(body.origin)) {
      throw new RecordError("Selecione uma origem válida para a consulente.", 400);
    }
    const origin = isClientOrigin(body.origin) ? body.origin : "nao_informado";
    const all = await db.select().from(consulentes).where(and(eq(consulentes.tenantId, tenantId), eq(consulentes.archived, false)));
    const normalized = normalizeName(name);
    const phoneDigits = normalizePhone(phone);
    const duplicates = all.filter((c) => {
      const sameName =
        normalizeName(c.name) === normalized ||
        (normalized.length > 4 && normalizeName(c.name).includes(normalized)) ||
        (normalizeName(c.name).length > 4 && normalized.includes(normalizeName(c.name)));
      const samePhone = phoneDigits.length >= 8 && normalizePhone(c.phone) === phoneDigits;
      return sameName || samePhone;
    });
    if (duplicates.length && !asBool(body.force)) {
      throw new RecordError("Já existe uma consulente parecida com este cadastro. Confirme se deseja usar a existente ou criar outra.", 409, {
        duplicates: duplicates.map((d) => ({ id: d.id, name: d.name, phone: d.phone, archived: d.archived })),
      });
    }
    const [created] = await db.insert(consulentes).values({ tenantId, name, phone, notes, origin }).returning();
    await logAudit(tenantId, "criar", "consulente", created.id, { name, origin });
    return { status: 201, data: { record: created } };
  }

  if (entity === "methods") {
    const name = str(body.name, 120);
    if (name.length < 2) throw new RecordError("Informe o nome do método.", 400);
    const priceCents = asCents(body.priceCents ?? body.price);
    const [created] = await db
      .insert(methods)
      .values({
        tenantId,
        name,
        description: optionalStr(body.description, 1000),
        priceCents,
        durationMinutes: Math.min(600, Math.max(5, asInt(body.durationMinutes, 60))),
        active: asBool(body.active, true),
      })
      .returning();
    await logAudit(tenantId, "criar", "metodo", created.id, { name, priceCents });
    return { status: 201, data: { record: created } };
  }

  if (entity === "consultations") {
    const consulenteId = asInt(body.consulenteId, 0);
    if (!consulenteId) throw new RecordError("Selecione a consulente.", 400);
    await ownedConsulente(tenantId, consulenteId);
    const date = str(body.date, 10);
    if (!isISODate(date)) throw new RecordError("Informe uma data válida (DD/MM/AAAA).", 400);
    const startTime = str(body.startTime, 5);
    if (!isTime(startTime)) throw new RecordError("Informe o horário de início no formato 24h (HH:MM).", 400);
    const methodId = asInt(body.methodId, 0) || null;
    let methodName = str(body.methodName, 120);
    let methodPriceCents = asCents(body.methodPriceCents);
    let duration = asInt(body.durationMinutes, 0);
    if (methodId) {
      const [method] = await db
        .select()
        .from(methods)
        .where(and(eq(methods.id, methodId), eq(methods.tenantId, tenantId)))
        .limit(1);
      if (!method) throw new RecordError("Método não encontrado.", 404);
      if (method.archived) throw new RecordError("Este método está arquivado e não pode ser usado em novos agendamentos.", 400);
      methodName = method.name;
      methodPriceCents = method.priceCents;
      if (!duration) duration = method.durationMinutes;
    }
    if (!methodName) throw new RecordError("Selecione o método de tiragem.", 400);
    const status = CONSULTATION_STATUSES.includes(str(body.status) as (typeof CONSULTATION_STATUSES)[number])
      ? str(body.status)
      : "agendada";
    const priceProvided = body.priceCents !== undefined && body.priceCents !== null && body.priceCents !== "";
    const priceCents = priceProvided ? asCents(body.priceCents) : methodPriceCents;
    const [created] = await db
      .insert(consultations)
      .values({
        tenantId,
        consulenteId,
        methodId,
        methodName,
        methodPriceCents,
        priceCents,
        date,
        startTime,
        durationMinutes: Math.min(600, Math.max(5, duration || 60)),
        status,
        paymentStatus: priceCents > 0 ? "pendente" : "pago",
        paymentMethod: optionalStr(body.paymentMethod, 60),
        notes: optionalStr(body.notes, 2000),
      })
      .returning();
    await logAudit(tenantId, "criar", "consulta", created.id, { date, startTime, methodName, priceCents });
    return { status: 201, data: { record: created } };
  }

  if (entity === "payments") {
    const consultationId = asInt(body.consultationId, 0);
    if (!consultationId) throw new RecordError("Informe a consulta do pagamento.", 400);
    const consultation = await ownedConsultationOrFail(tenantId, consultationId);
    const kind = str(body.kind) === "estorno" ? "estorno" : "pagamento";
    const rawAmount = asInt(body.amountCents, 0);
    const amount = kind === "estorno" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    if (amount === 0) throw new RecordError("Informe um valor de pagamento maior que zero.", 400);
    const paidAt = str(body.paidAt, 10);
    if (!isISODate(paidAt)) throw new RecordError("Informe a data do recebimento.", 400);
    const idempotencyKey = str(body.idempotencyKey, 140) || `pay_${randomUUID()}`;

    const [existing] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, tenantId), eq(payments.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existing) {
      return { status: 200, data: { record: existing, duplicate: true, message: "Este pagamento já estava registrado." } };
    }

    const existingPayments = await db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, tenantId), eq(payments.consultationId, consultationId)));
    const paid = existingPayments.reduce((acc, p) => acc + p.amountCents, 0);
    const remaining = Math.max(0, consultation.priceCents - paid);
    if (kind === "pagamento" && amount > remaining) {
      throw new RecordError(
        `O valor informado excede o saldo restante de ${(remaining / 100).toFixed(2).replace(".", ",")}.`,
        400,
        { remainingCents: remaining },
      );
    }
    if (kind === "estorno" && Math.abs(amount) > paid) {
      throw new RecordError("O estorno não pode ser maior que o total já pago nesta consulta.", 400);
    }

    const created = await db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId,
          consultationId,
          amountCents: amount,
          paidAt,
          method: cleanPaymentMethod(body.method),
          notes: optionalStr(body.notes, 1000),
          kind,
          idempotencyKey,
        })
        .returning();
      if (kind === "pagamento") {
        await tx.insert(transactions).values({
          tenantId,
          type: "entrada",
          description: `Pagamento — ${consultation.methodName}`,
          amountCents: amount,
          date: paidAt,
          category: "Consultas",
          paymentMethod: str(body.paymentMethodLabel, 60) || str(body.method, 60) || "Pix",
          notes: optionalStr(body.notes, 1000),
          consultationId,
          paymentId: payment.id,
          reference: `payment:${payment.id}`,
        });
      } else {
        await tx.insert(transactions).values({
          tenantId,
          type: "despesa",
          description: `Estorno de pagamento — ${consultation.methodName}`,
          amountCents: Math.abs(amount),
          date: paidAt,
          category: "Estornos",
          paymentMethod: str(body.method, 60) || "Pix",
          notes: optionalStr(body.notes, 1000),
          consultationId,
          paymentId: payment.id,
          reference: `refund:${payment.id}`,
        });
      }
      await tx
        .update(consultations)
        .set({
          paymentStatus: derivePaymentStatus(consultation.priceCents, paid + amount),
          paymentMethod: str(body.method, 60) || consultation.paymentMethod,
          updatedAt: new Date(),
        })
        .where(and(eq(consultations.id, consultationId), eq(consultations.tenantId, tenantId)));
      return payment;
    });

    await logAudit(tenantId, kind, "pagamento", created.id, { consultationId, amount });
    return { status: 201, data: { record: created } };
  }

  if (entity === "work_catalog") {
    const name = str(body.name, 140);
    if (name.length < 2) throw new RecordError("Informe o nome do trabalho, magia ou atividade.", 400);
    const kind = WORK_KINDS.includes(str(body.kind) as (typeof WORK_KINDS)[number]) ? str(body.kind) : "magia";
    const priceCents = asCents(body.priceCents ?? body.price);
    const [created] = await db
      .insert(workCatalog)
      .values({
        tenantId,
        kind,
        name,
        description: optionalStr(body.description, 1500),
        materials: optionalStr(body.materials, 1000),
        priceCents,
        cycleDays: Math.min(365, Math.max(1, asInt(body.cycleDays, kind === "magia" ? 7 : 1))),
        durationMinutes: Math.min(600, Math.max(5, asInt(body.durationMinutes, 60))),
        imageUrl: optionalImageStr(body.imageUrl),
        active: asBool(body.active, true),
      })
      .returning();
    await logAudit(tenantId, "criar", "catalogo_trabalho", created.id, { name, kind, priceCents });
    return { status: 201, data: { record: created } };
  }

  if (entity === "spiritual_works") {
    const consulenteId = asInt(body.consulenteId, 0);
    if (!consulenteId) throw new RecordError("Selecione a consulente.", 400);
    await ownedConsulente(tenantId, consulenteId);
    const date = str(body.date, 10);
    if (!isISODate(date)) throw new RecordError("Informe uma data válida (DD/MM/AAAA).", 400);
    const startTimeRaw = optionalStr(body.startTime, 5);
    if (startTimeRaw && !isTime(startTimeRaw)) throw new RecordError("Horário inválido (use HH:MM).", 400);

    const catalogId = asInt(body.catalogId, 0) || null;
    let kind = WORK_KINDS.includes(str(body.kind) as (typeof WORK_KINDS)[number]) ? str(body.kind) : "magia";
    let title = str(body.title, 160);
    let catalogPriceCents = asCents(body.catalogPriceCents);
    let cycleDays = Math.min(365, Math.max(1, asInt(body.cycleDays, 1)));
    let durationMinutes = Math.min(600, Math.max(5, asInt(body.durationMinutes, 60)));
    let defaultMaterials: string | null = null;
    let defaultImage: string | null = null;

    if (catalogId) {
      const [cat] = await db
        .select()
        .from(workCatalog)
        .where(and(eq(workCatalog.id, catalogId), eq(workCatalog.tenantId, tenantId)))
        .limit(1);
      if (!cat) throw new RecordError("Item do catálogo não encontrado.", 404);
      if (cat.archived) throw new RecordError("Este trabalho/atividade está arquivado.", 400);
      kind = cat.kind;
      if (!title) title = cat.name;
      catalogPriceCents = cat.priceCents;
      if (!body.cycleDays) cycleDays = cat.cycleDays;
      if (!body.durationMinutes) durationMinutes = cat.durationMinutes;
      defaultMaterials = cat.materials;
      defaultImage = cat.imageUrl;
    }

    if (!title) throw new RecordError("Informe ou selecione o trabalho, magia ou atividade.", 400);
    const status = WORK_STATUSES.includes(str(body.status) as (typeof WORK_STATUSES)[number])
      ? str(body.status)
      : "em_andamento";
    const priceProvided = body.priceCents !== undefined && body.priceCents !== null && body.priceCents !== "";
    const priceCents = priceProvided ? asCents(body.priceCents) : catalogPriceCents;
    const materialCostCents = asCents(body.materialCostCents);
    const endDateRaw = optionalStr(body.endDate, 10);
    const endDate = endDateRaw && isISODate(endDateRaw) ? endDateRaw : cycleDays > 1 ? addDaysISO(date, cycleDays) : date;
    const imageUrl = body.imageUrl !== undefined ? optionalImageStr(body.imageUrl) : defaultImage;
    const materials = body.materials !== undefined ? optionalStr(body.materials, 1500) : defaultMaterials;

    const [created] = await db
      .insert(spiritualWorks)
      .values({
        tenantId,
        consulenteId,
        catalogId,
        kind,
        title,
        catalogPriceCents,
        priceCents,
        materialCostCents,
        date,
        startTime: startTimeRaw,
        endDate,
        durationMinutes,
        cycleDays,
        status,
        paymentStatus: priceCents > 0 ? "pendente" : "pago",
        paymentMethod: optionalStr(body.paymentMethod, 60),
        intention: optionalStr(body.intention, 1000),
        materials,
        imageUrl,
        notes: optionalStr(body.notes, 2000),
      })
      .returning();

    if (asBool(body.registerMaterialExpense) && materialCostCents > 0) {
      await db.insert(transactions).values({
        tenantId,
        type: "despesa",
        description: `Materiais — ${title}`,
        amountCents: materialCostCents,
        date,
        category: "Materiais de trabalho",
        paymentMethod: optionalStr(body.paymentMethod, 60) || "Pix",
        notes: materials,
        workId: created.id,
        reference: `work_material:${created.id}`,
      });
    }

    await logAudit(tenantId, "criar", "trabalho", created.id, { title, kind, date, priceCents });
    return { status: 201, data: { record: created } };
  }

  if (entity === "work_payments") {
    const workId = asInt(body.workId, 0);
    if (!workId) throw new RecordError("Informe o trabalho ou atividade do pagamento.", 400);
    const work = await ownedWorkOrFail(tenantId, workId);
    const kind = str(body.kind) === "estorno" ? "estorno" : "pagamento";
    const rawAmount = asInt(body.amountCents, 0);
    const amount = kind === "estorno" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    if (amount === 0) throw new RecordError("Informe um valor de pagamento maior que zero.", 400);
    const paidAt = str(body.paidAt, 10);
    if (!isISODate(paidAt)) throw new RecordError("Informe a data do recebimento.", 400);
    const idempotencyKey = str(body.idempotencyKey, 140) || `wpay_${randomUUID()}`;

    const [existing] = await db
      .select()
      .from(workPayments)
      .where(and(eq(workPayments.tenantId, tenantId), eq(workPayments.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existing) {
      return { status: 200, data: { record: existing, duplicate: true, message: "Este pagamento já estava registrado." } };
    }

    const existingList = await db
      .select()
      .from(workPayments)
      .where(and(eq(workPayments.tenantId, tenantId), eq(workPayments.workId, workId)));
    const paid = existingList.reduce((acc, p) => acc + p.amountCents, 0);
    const remaining = Math.max(0, work.priceCents - paid);
    if (kind === "pagamento" && amount > remaining) {
      throw new RecordError(
        `O valor informado excede o saldo restante de ${(remaining / 100).toFixed(2).replace(".", ",")}.`,
        400,
        { remainingCents: remaining },
      );
    }
    if (kind === "estorno" && Math.abs(amount) > paid) {
      throw new RecordError("O estorno não pode ser maior que o total já pago neste trabalho/atividade.", 400);
    }

    const created = await db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(workPayments)
        .values({
          tenantId,
          workId,
          amountCents: amount,
          paidAt,
          method: cleanPaymentMethod(body.method),
          notes: optionalStr(body.notes, 1000),
          kind,
          idempotencyKey,
        })
        .returning();

      const labelPrefix = work.kind === "atividade" ? "Atividade" : "Trabalho";
      if (kind === "pagamento") {
        await tx.insert(transactions).values({
          tenantId,
          type: "entrada",
          description: `${labelPrefix} — ${work.title}`,
          amountCents: amount,
          date: paidAt,
          category: "Trabalhos e terapias",
          paymentMethod: str(body.paymentMethodLabel, 60) || cleanPaymentMethod(body.method),
          notes: optionalStr(body.notes, 1000),
          workId,
          workPaymentId: payment.id,
          reference: `work_payment:${payment.id}`,
        });
      } else {
        await tx.insert(transactions).values({
          tenantId,
          type: "despesa",
          description: `Estorno (${labelPrefix}) — ${work.title}`,
          amountCents: Math.abs(amount),
          date: paidAt,
          category: "Estornos",
          paymentMethod: cleanPaymentMethod(body.method),
          notes: optionalStr(body.notes, 1000),
          workId,
          workPaymentId: payment.id,
          reference: `work_refund:${payment.id}`,
        });
      }

      await tx
        .update(spiritualWorks)
        .set({
          paymentStatus: derivePaymentStatus(work.priceCents, paid + amount),
          paymentMethod: cleanPaymentMethod(body.method) || work.paymentMethod,
          updatedAt: new Date(),
        })
        .where(and(eq(spiritualWorks.id, workId), eq(spiritualWorks.tenantId, tenantId)));

      return payment;
    });

    await logAudit(tenantId, kind, "pagamento_trabalho", created.id, { workId, amount });
    return { status: 201, data: { record: created } };
  }

  if (entity === "transactions") {
    const type = str(body.type) === "despesa" ? "despesa" : "entrada";
    const description = str(body.description, 200);
    if (description.length < 2) throw new RecordError("Descreva o lançamento.", 400);
    const amountCents = asCents(body.amountCents ?? body.amount);
    if (amountCents <= 0) throw new RecordError("O valor deve ser maior que zero.", 400);
    const date = str(body.date, 10);
    if (!isISODate(date)) throw new RecordError("Informe uma data válida.", 400);
    const category = str(body.category, 80) || (type === "entrada" ? "Outros" : "Outros");
    const idempotencyKey = str(body.idempotencyKey, 140);
    const reference = idempotencyKey ? `manual:${idempotencyKey}` : null;
    if (reference) {
      const [existing] = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.tenantId, tenantId), eq(transactions.reference, reference)))
        .limit(1);
      if (existing) return { status: 200, data: { record: existing, duplicate: true, message: "Lançamento já registrado." } };
    }
    const [created] = await db
      .insert(transactions)
      .values({
        tenantId,
        type,
        description,
        amountCents,
        date,
        category,
        paymentMethod: str(body.paymentMethod, 60) || "Pix",
        notes: optionalStr(body.notes, 1000),
        reference,
      })
      .returning();
    await logAudit(tenantId, "criar", type, created.id, { description, amountCents });
    return { status: 201, data: { record: created } };
  }

  // goals
  const month = str(body.month, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new RecordError("Informe o mês da meta (AAAA-MM).", 400);
  const amountCents = asCents(body.amountCents ?? body.amount);
  const [upserted] = await db
    .insert(monthlyGoals)
    .values({ tenantId, month, amountCents })
    .onConflictDoUpdate({
      target: [monthlyGoals.tenantId, monthlyGoals.month],
      set: { amountCents, updatedAt: new Date() },
    })
    .returning();
  await logAudit(tenantId, "definir", "meta", upserted.id, { month, amountCents });
  return { status: 200, data: { record: upserted } };
}

export async function updateRecord(
  tenantId: number,
  entity: Entity,
  id: number,
  body: Record<string, unknown>,
): Promise<RecordResult> {
  if (entity === "consulentes") {
    const current = await ownedConsulente(tenantId, id);
    const name = body.name === undefined ? current.name : str(body.name, 160);
    if (name.length < 2) throw new RecordError("Informe o nome da consulente.", 400);
    if (body.origin !== undefined && !isClientOrigin(body.origin)) {
      throw new RecordError("Selecione uma origem válida para a consulente.", 400);
    }
    const [updated] = await db
      .update(consulentes)
      .set({
        name,
        phone: body.phone === undefined ? current.phone : optionalStr(body.phone, 40),
        notes: body.notes === undefined ? current.notes : optionalStr(body.notes, 2000),
        origin: body.origin === undefined ? current.origin : (body.origin as string),
        archived: body.archived === undefined ? current.archived : asBool(body.archived),
        updatedAt: new Date(),
      })
      .where(and(eq(consulentes.id, id), eq(consulentes.tenantId, tenantId)))
      .returning();
    await logAudit(tenantId, "editar", "consulente", id, { name });
    return { status: 200, data: { record: updated } };
  }

  if (entity === "methods") {
    const [current] = await db
      .select()
      .from(methods)
      .where(and(eq(methods.id, id), eq(methods.tenantId, tenantId)))
      .limit(1);
    if (!current) throw new RecordError("Método não encontrado.", 404);
    const [updated] = await db
      .update(methods)
      .set({
        name: body.name === undefined ? current.name : str(body.name, 120) || current.name,
        description: body.description === undefined ? current.description : optionalStr(body.description, 1000),
        priceCents: body.priceCents === undefined && body.price === undefined ? current.priceCents : asCents(body.priceCents ?? body.price),
        durationMinutes:
          body.durationMinutes === undefined
            ? current.durationMinutes
            : Math.min(600, Math.max(5, asInt(body.durationMinutes, current.durationMinutes))),
        active: body.active === undefined ? current.active : asBool(body.active, current.active),
        archived: body.archived === undefined ? current.archived : asBool(body.archived, current.archived),
        updatedAt: new Date(),
      })
      .where(and(eq(methods.id, id), eq(methods.tenantId, tenantId)))
      .returning();
    await logAudit(tenantId, "editar", "metodo", id, { priceCents: updated.priceCents, name: updated.name });
    return { status: 200, data: { record: updated } };
  }

  if (entity === "consultations") {
    const current = await ownedConsultationOrFail(tenantId, id);
    let methodName = current.methodName;
    let methodId = current.methodId;
    let methodPriceCents = current.methodPriceCents;
    let duration = current.durationMinutes;
    let priceCents = current.priceCents;
    const methodChanged = body.methodId !== undefined && asInt(body.methodId, 0) !== current.methodId;

    if (methodChanged) {
      const nextMethodId = asInt(body.methodId, 0) || null;
      if (nextMethodId) {
        const [method] = await db
          .select()
          .from(methods)
          .where(and(eq(methods.id, nextMethodId), eq(methods.tenantId, tenantId)))
          .limit(1);
        if (!method) throw new RecordError("Método não encontrado.", 404);
        if (method.archived) throw new RecordError("Método arquivado não pode ser usado.", 400);
        methodId = method.id;
        methodName = method.name;
        methodPriceCents = method.priceCents;
        duration = method.durationMinutes;
        priceCents = method.priceCents;
      } else {
        methodId = null;
        methodName = str(body.methodName, 120) || current.methodName;
      }
    }
    if (body.priceCents !== undefined) priceCents = asCents(body.priceCents);
    if (body.durationMinutes !== undefined) duration = Math.min(600, Math.max(5, asInt(body.durationMinutes, duration)));
    if (body.date !== undefined) {
      if (!isISODate(body.date)) throw new RecordError("Data inválida.", 400);
    }
    if (body.startTime !== undefined && !isTime(body.startTime)) throw new RecordError("Horário inválido.", 400);
    if (body.consulenteId !== undefined) await ownedConsulente(tenantId, asInt(body.consulenteId, 0));
    const status =
      body.status !== undefined && CONSULTATION_STATUSES.includes(str(body.status) as (typeof CONSULTATION_STATUSES)[number])
        ? str(body.status)
        : current.status;

    let actualSeconds =
      body.actualSeconds !== undefined ? Math.max(0, asInt(body.actualSeconds, current.actualSeconds)) : current.actualSeconds;
    let timerStartedAt = current.timerStartedAt;
    let timerEndedAt = current.timerEndedAt;

    if (timerStartedAt && (status === "realizada" || status === "cancelada" || status === "nao_compareceu")) {
      if (status === "realizada") {
        const elapsed = Math.max(1, Math.floor((Date.now() - timerStartedAt.getTime()) / 1000));
        actualSeconds += elapsed;
        timerEndedAt = new Date();
      }
      timerStartedAt = null;
    }

    const [updated] = await db
      .update(consultations)
      .set({
        consulenteId: body.consulenteId === undefined ? current.consulenteId : asInt(body.consulenteId, current.consulenteId),
        methodId,
        methodName,
        methodPriceCents,
        priceCents,
        date: body.date === undefined ? current.date : (body.date as string),
        startTime: body.startTime === undefined ? current.startTime : (body.startTime as string),
        durationMinutes: duration,
        actualSeconds,
        timerStartedAt,
        timerEndedAt,
        status,
        paymentMethod: body.paymentMethod === undefined ? current.paymentMethod : optionalStr(body.paymentMethod, 60),
        notes: body.notes === undefined ? current.notes : optionalStr(body.notes, 2000),
        updatedAt: new Date(),
      })
      .where(and(eq(consultations.id, id), eq(consultations.tenantId, tenantId)))
      .returning();

    await recomputeConsultation(tenantId, id);
    await logAudit(tenantId, "editar", "consulta", id, { status, date: updated.date, startTime: updated.startTime, priceCents });
    return { status: 200, data: { record: updated } };
  }

  if (entity === "work_catalog") {
    const [current] = await db
      .select()
      .from(workCatalog)
      .where(and(eq(workCatalog.id, id), eq(workCatalog.tenantId, tenantId)))
      .limit(1);
    if (!current) throw new RecordError("Item do catálogo não encontrado.", 404);
    const kind =
      body.kind !== undefined && WORK_KINDS.includes(str(body.kind) as (typeof WORK_KINDS)[number])
        ? str(body.kind)
        : current.kind;
    const [updated] = await db
      .update(workCatalog)
      .set({
        kind,
        name: body.name === undefined ? current.name : str(body.name, 140) || current.name,
        description: body.description === undefined ? current.description : optionalStr(body.description, 1500),
        materials: body.materials === undefined ? current.materials : optionalStr(body.materials, 1000),
        priceCents: body.priceCents === undefined && body.price === undefined ? current.priceCents : asCents(body.priceCents ?? body.price),
        cycleDays:
          body.cycleDays === undefined ? current.cycleDays : Math.min(365, Math.max(1, asInt(body.cycleDays, current.cycleDays))),
        durationMinutes:
          body.durationMinutes === undefined
            ? current.durationMinutes
            : Math.min(600, Math.max(5, asInt(body.durationMinutes, current.durationMinutes))),
        imageUrl: body.imageUrl === undefined ? current.imageUrl : optionalImageStr(body.imageUrl),
        active: body.active === undefined ? current.active : asBool(body.active, current.active),
        archived: body.archived === undefined ? current.archived : asBool(body.archived, current.archived),
        updatedAt: new Date(),
      })
      .where(and(eq(workCatalog.id, id), eq(workCatalog.tenantId, tenantId)))
      .returning();
    await logAudit(tenantId, "editar", "catalogo_trabalho", id, { name: updated.name, priceCents: updated.priceCents });
    return { status: 200, data: { record: updated } };
  }

  if (entity === "spiritual_works") {
    const current = await ownedWorkOrFail(tenantId, id);
    let catalogId = current.catalogId;
    let kind = current.kind;
    let title = current.title;
    let catalogPriceCents = current.catalogPriceCents;
    let priceCents = current.priceCents;
    let cycleDays = current.cycleDays;
    let durationMinutes = current.durationMinutes;

    const catalogChanged = body.catalogId !== undefined && asInt(body.catalogId, 0) !== current.catalogId;
    if (catalogChanged) {
      const nextCatalogId = asInt(body.catalogId, 0) || null;
      if (nextCatalogId) {
        const [cat] = await db
          .select()
          .from(workCatalog)
          .where(and(eq(workCatalog.id, nextCatalogId), eq(workCatalog.tenantId, tenantId)))
          .limit(1);
        if (!cat) throw new RecordError("Item do catálogo não encontrado.", 404);
        if (cat.archived) throw new RecordError("Item arquivado não pode ser selecionado.", 400);
        catalogId = cat.id;
        kind = cat.kind;
        title = cat.name;
        catalogPriceCents = cat.priceCents;
        priceCents = cat.priceCents;
        cycleDays = cat.cycleDays;
        durationMinutes = cat.durationMinutes;
      } else {
        catalogId = null;
      }
    }

    if (body.kind !== undefined && WORK_KINDS.includes(str(body.kind) as (typeof WORK_KINDS)[number])) kind = str(body.kind);
    if (body.title !== undefined && str(body.title, 160)) title = str(body.title, 160);
    if (body.priceCents !== undefined) priceCents = asCents(body.priceCents);
    if (body.cycleDays !== undefined) cycleDays = Math.min(365, Math.max(1, asInt(body.cycleDays, cycleDays)));
    if (body.durationMinutes !== undefined) durationMinutes = Math.min(600, Math.max(5, asInt(body.durationMinutes, durationMinutes)));
    if (body.date !== undefined && !isISODate(body.date)) throw new RecordError("Data inválida.", 400);
    if (body.endDate !== undefined && body.endDate !== null && body.endDate !== "" && !isISODate(body.endDate)) {
      throw new RecordError("Data de conclusão inválida.", 400);
    }
    if (body.startTime !== undefined && body.startTime !== null && body.startTime !== "" && !isTime(body.startTime)) {
      throw new RecordError("Horário inválido.", 400);
    }
    if (body.consulenteId !== undefined) await ownedConsulente(tenantId, asInt(body.consulenteId, 0));

    const status =
      body.status !== undefined && WORK_STATUSES.includes(str(body.status) as (typeof WORK_STATUSES)[number])
        ? str(body.status)
        : current.status;

    const [updated] = await db
      .update(spiritualWorks)
      .set({
        consulenteId: body.consulenteId === undefined ? current.consulenteId : asInt(body.consulenteId, current.consulenteId),
        catalogId,
        kind,
        title,
        catalogPriceCents,
        priceCents,
        materialCostCents: body.materialCostCents === undefined ? current.materialCostCents : asCents(body.materialCostCents),
        date: body.date === undefined ? current.date : (body.date as string),
        startTime: body.startTime === undefined ? current.startTime : optionalStr(body.startTime, 5),
        endDate: body.endDate === undefined ? current.endDate : optionalStr(body.endDate, 10),
        durationMinutes,
        cycleDays,
        status,
        paymentMethod: body.paymentMethod === undefined ? current.paymentMethod : optionalStr(body.paymentMethod, 60),
        intention: body.intention === undefined ? current.intention : optionalStr(body.intention, 1000),
        materials: body.materials === undefined ? current.materials : optionalStr(body.materials, 1500),
        imageUrl: body.imageUrl === undefined ? current.imageUrl : optionalImageStr(body.imageUrl),
        notes: body.notes === undefined ? current.notes : optionalStr(body.notes, 2000),
        updatedAt: new Date(),
      })
      .where(and(eq(spiritualWorks.id, id), eq(spiritualWorks.tenantId, tenantId)))
      .returning();

    await recomputeWork(tenantId, id);
    await logAudit(tenantId, "editar", "trabalho", id, { status, title, priceCents });
    return { status: 200, data: { record: updated } };
  }

  if (entity === "goals") {
    return createRecord(tenantId, "goals", { ...body, month: body.month });
  }

  throw new RecordError("Este tipo de registro não pode ser editado por esta rota.", 400);
}

export async function deleteRecord(tenantId: number, entity: Entity, id: number): Promise<RecordResult> {
  if (entity === "consulentes") {
    const [relatedConsultas, relatedWorks] = await Promise.all([
      db.select({ id: consultations.id }).from(consultations).where(and(eq(consultations.tenantId, tenantId), eq(consultations.consulenteId, id))),
      db.select({ id: spiritualWorks.id }).from(spiritualWorks).where(and(eq(spiritualWorks.tenantId, tenantId), eq(spiritualWorks.consulenteId, id))),
    ]);
    if (relatedConsultas.length || relatedWorks.length) {
      await db
        .update(consulentes)
        .set({ archived: true, updatedAt: new Date() })
        .where(and(eq(consulentes.id, id), eq(consulentes.tenantId, tenantId)));
      await logAudit(tenantId, "arquivar", "consulente", id, { motivo: "histórico preservado" });
      return {
        status: 200,
        data: {
          archived: true,
          message: "Esta consulente possui histórico de atendimentos/trabalhos. O cadastro foi arquivado e o histórico preservado.",
        },
      };
    }
    await db.delete(consulentes).where(and(eq(consulentes.id, id), eq(consulentes.tenantId, tenantId)));
    await logAudit(tenantId, "excluir", "consulente", id);
    return { status: 200, data: { deleted: true } };
  }

  if (entity === "methods") {
    const related = await db.select({ id: consultations.id }).from(consultations).where(
      and(eq(consultations.tenantId, tenantId), eq(consultations.methodId, id)),
    );
    if (related.length) {
      await db
        .update(methods)
        .set({ archived: true, active: false, updatedAt: new Date() })
        .where(and(eq(methods.id, id), eq(methods.tenantId, tenantId)));
      await logAudit(tenantId, "arquivar", "metodo", id, { motivo: "histórico preservado" });
      return {
        status: 200,
        data: {
          archived: true,
          message: "Este método já foi usado em consultas. Ele foi desativado e arquivado para preservar o histórico.",
        },
      };
    }
    await db.delete(methods).where(and(eq(methods.id, id), eq(methods.tenantId, tenantId)));
    await logAudit(tenantId, "excluir", "metodo", id);
    return { status: 200, data: { deleted: true } };
  }

  if (entity === "consultations") {
    const related = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.tenantId, tenantId), eq(payments.consultationId, id)));
    if (related.length) {
      throw new RecordError(
        "Esta consulta já possui pagamentos registrados e não pode ser excluída. Cancele a consulta para preservar o histórico financeiro.",
        409,
      );
    }
    await db.delete(consultations).where(and(eq(consultations.id, id), eq(consultations.tenantId, tenantId)));
    await logAudit(tenantId, "excluir", "consulta", id);
    return { status: 200, data: { deleted: true, message: "Consulta excluída e lembretes cancelados." } };
  }

  if (entity === "work_catalog") {
    const related = await db
      .select({ id: spiritualWorks.id })
      .from(spiritualWorks)
      .where(and(eq(spiritualWorks.tenantId, tenantId), eq(spiritualWorks.catalogId, id)));
    if (related.length) {
      await db
        .update(workCatalog)
        .set({ archived: true, active: false, updatedAt: new Date() })
        .where(and(eq(workCatalog.id, id), eq(workCatalog.tenantId, tenantId)));
      await logAudit(tenantId, "arquivar", "catalogo_trabalho", id, { motivo: "histórico preservado" });
      return {
        status: 200,
        data: {
          archived: true,
          message: "Este item já foi utilizado em registros anteriores. Ele foi desativado e arquivado para preservar o histórico.",
        },
      };
    }
    await db.delete(workCatalog).where(and(eq(workCatalog.id, id), eq(workCatalog.tenantId, tenantId)));
    await logAudit(tenantId, "excluir", "catalogo_trabalho", id);
    return { status: 200, data: { deleted: true } };
  }

  if (entity === "spiritual_works") {
    const related = await db
      .select({ id: workPayments.id })
      .from(workPayments)
      .where(and(eq(workPayments.tenantId, tenantId), eq(workPayments.workId, id)));
    if (related.length) {
      throw new RecordError(
        "Este trabalho/atividade já possui pagamentos registrados e não pode ser excluído. Marque como cancelado para preservar o histórico financeiro.",
        409,
      );
    }
    await db.delete(spiritualWorks).where(and(eq(spiritualWorks.id, id), eq(spiritualWorks.tenantId, tenantId)));
    await logAudit(tenantId, "excluir", "trabalho", id);
    return { status: 200, data: { deleted: true, message: "Registro excluído." } };
  }

  if (entity === "transactions") {
    const [current] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.tenantId, tenantId)))
      .limit(1);
    if (!current) throw new RecordError("Lançamento não encontrado.", 404);
    if (current.paymentId || current.workPaymentId) {
      throw new RecordError(
        "Este lançamento está vinculado a um pagamento de consulta ou trabalho. Use o estorno no registro correspondente para manter o histórico.",
        409,
      );
    }
    await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.tenantId, tenantId)));
    await logAudit(tenantId, "excluir", "lancamento", id, { description: current.description, amountCents: current.amountCents });
    return { status: 200, data: { deleted: true } };
  }

  if (entity === "payments" || entity === "work_payments") {
    throw new RecordError("Pagamentos não são apagados. Registre um estorno para manter o histórico.", 409);
  }

  await db.delete(monthlyGoals).where(and(eq(monthlyGoals.id, id), eq(monthlyGoals.tenantId, tenantId)));
  return { status: 200, data: { deleted: true } };
}

/** Recalcula o status de pagamento de todas as consultas e trabalhos (usado após importação). */
export async function recalcAllPayments(tenantId: number) {
  const list = await db.select({ id: consultations.id }).from(consultations).where(eq(consultations.tenantId, tenantId));
  for (const row of list) await recomputeConsultation(tenantId, row.id);
  const works = await db.select({ id: spiritualWorks.id }).from(spiritualWorks).where(eq(spiritualWorks.tenantId, tenantId));
  for (const row of works) await recomputeWork(tenantId, row.id);
}

export async function consultationsFor(tenantId: number) {
  return db.select().from(consultations).where(and(eq(consultations.tenantId, tenantId), ne(consultations.status, "excluida")));
}
