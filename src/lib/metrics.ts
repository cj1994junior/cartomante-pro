import type {
  Consultation,
  Consulente,
  Method,
  MonthlyGoal,
  Payment,
  PaymentStatus,
  SpiritualWork,
  TenantSettingsData,
  Transaction,
  WorkCatalogItem,
  WorkPayment,
} from "./types";
import { monthKey, timeToMinutes, todayISO } from "./format";

export type PaymentIndex = {
  byConsultation: Record<number, number>;
  byConsultationList: Record<number, Payment[]>;
  total: number;
};

export function indexPayments(payments: Payment[]): PaymentIndex {
  const byConsultation: Record<number, number> = {};
  const byConsultationList: Record<number, Payment[]> = {};
  let total = 0;
  for (const p of payments) {
    byConsultation[p.consultationId] = (byConsultation[p.consultationId] ?? 0) + p.amountCents;
    (byConsultationList[p.consultationId] ??= []).push(p);
    total += p.amountCents;
  }
  return { byConsultation, byConsultationList, total };
}

export function paidFor(consultationId: number, payments: Payment[]): number {
  return payments.filter((p) => p.consultationId === consultationId).reduce((acc, p) => acc + p.amountCents, 0);
}

export function derivePaymentStatus(priceCents: number, paidCents: number): PaymentStatus {
  if (paidCents <= 0) return "pendente";
  if (paidCents >= priceCents) return "pago";
  return "parcial";
}

export function paidForWork(workId: number, workPayments: WorkPayment[]): number {
  return workPayments.filter((p) => p.workId === workId).reduce((acc, p) => acc + p.amountCents, 0);
}

export function workBalance(w: SpiritualWork, workPayments: WorkPayment[]): number {
  if (w.status === "cancelado") return 0;
  return Math.max(0, w.priceCents - paidForWork(w.id, workPayments));
}

export function consultationBalance(c: Consultation, payments: Payment[]): number {
  if (c.status === "cancelada") return 0;
  return Math.max(0, c.priceCents - paidFor(c.id, payments));
}

export function isRevenueConsultation(c: Consultation): boolean {
  return c.status === "realizada" || c.status === "confirmada" || c.status === "agendada";
}

export type FinanceMonth = {
  receivedCents: number;
  expensesCents: number;
  otherIncomeCents: number;
  consultationIncomeCents: number;
  workIncomeCents: number;
  balanceCents: number;
  outstandingCents: number;
  goalCents: number;
  goalPercent: number;
  realizedCount: number;
  scheduledCount: number;
  cancelledCount: number;
  noShowCount: number;
  worksCompletedCount: number;
  worksActiveCount: number;
  workedSeconds: number;
  estimatedMinutes: number;
  hoursMinutes: number;
  entries: Transaction[];
  expenses: Transaction[];
};

export function financeForMonth(
  month: string,
  data: {
    transactions: Transaction[];
    payments: Payment[];
    consultations: Consultation[];
    spiritualWorks?: SpiritualWork[];
    workPayments?: WorkPayment[];
    goals: MonthlyGoal[];
    settings: TenantSettingsData;
  },
): FinanceMonth {
  const works = data.spiritualWorks ?? [];
  const wPayments = data.workPayments ?? [];
  const entries = data.transactions.filter((t) => t.type === "entrada" && monthKey(t.date) === month);
  const expenses = data.transactions.filter((t) => t.type === "despesa" && monthKey(t.date) === month);
  const receivedCents = entries.reduce((a, t) => a + t.amountCents, 0);
  const expensesCents = expenses.reduce((a, t) => a + t.amountCents, 0);
  const consultationIncomeCents = data.payments
    .filter((p) => monthKey(p.paidAt) === month && p.kind === "pagamento")
    .reduce((a, p) => a + p.amountCents, 0);
  const workIncomeCents = wPayments
    .filter((p) => monthKey(p.paidAt) === month && p.kind === "pagamento")
    .reduce((a, p) => a + p.amountCents, 0);
  const allEntries = data.transactions.filter((t) => t.type === "entrada").reduce((a, t) => a + t.amountCents, 0);
  const allExpenses = data.transactions.filter((t) => t.type === "despesa").reduce((a, t) => a + t.amountCents, 0);

  const monthConsultations = data.consultations.filter((c) => monthKey(c.date) === month);
  const realized = monthConsultations.filter((c) => c.status === "realizada");
  const monthWorks = works.filter((w) => monthKey(w.date) === month);
  const consultationOutstanding = data.consultations
    .filter((c) => c.status !== "cancelada" && c.status !== "nao_compareceu")
    .reduce((acc, c) => acc + consultationBalance(c, data.payments), 0);
  const workOutstanding = works
    .filter((w) => w.status !== "cancelado")
    .reduce((acc, w) => acc + workBalance(w, wPayments), 0);
  const outstandingCents = consultationOutstanding + workOutstanding;

  const workedSeconds = realized.reduce((a, c) => a + (c.actualSeconds ?? 0), 0);
  const estimatedMinutes = realized.reduce((a, c) => a + c.durationMinutes, 0);
  const goalCents = data.goals.find((g) => g.month === month)?.amountCents ?? data.settings.monthlyGoalCents;
  return {
    receivedCents,
    expensesCents,
    otherIncomeCents: Math.max(0, receivedCents - consultationIncomeCents - workIncomeCents),
    consultationIncomeCents,
    workIncomeCents,
    balanceCents: data.settings.initialBalanceCents + allEntries - allExpenses,
    outstandingCents,
    goalCents,
    goalPercent: goalCents > 0 ? Math.min(100, Math.round((receivedCents / goalCents) * 100)) : 0,
    realizedCount: realized.length,
    scheduledCount: monthConsultations.filter(
      (c) => c.status === "agendada" || c.status === "confirmada" || c.status === "em_atendimento",
    ).length,
    cancelledCount: monthConsultations.filter((c) => c.status === "cancelada").length,
    noShowCount: monthConsultations.filter((c) => c.status === "nao_compareceu").length,
    worksCompletedCount: monthWorks.filter((w) => w.status === "concluido").length,
    worksActiveCount: works.filter((w) => w.status === "em_andamento" || w.status === "planejado").length,
    workedSeconds,
    estimatedMinutes,
    hoursMinutes: Math.round(workedSeconds / 60),
    entries,
    expenses,
  };
}

export type WorkCatalogStat = {
  item: WorkCatalogItem;
  completed: number;
  activeCount: number;
  revenueCents: number;
};

export function workCatalogStats(
  catalog: WorkCatalogItem[],
  works: SpiritualWork[],
  workPayments: WorkPayment[],
): WorkCatalogStat[] {
  return catalog.map((item) => {
    const related = works.filter((w) => w.catalogId === item.id);
    const nonCancelled = related.filter((w) => w.status !== "cancelado");
    const revenueCents = nonCancelled.reduce((acc, w) => acc + paidForWork(w.id, workPayments), 0);
    return {
      item,
      completed: related.filter((w) => w.status === "concluido").length,
      activeCount: related.filter((w) => w.status === "em_andamento" || w.status === "planejado").length,
      revenueCents,
    };
  });
}

export type MethodStat = {
  method: Method;
  realized: number;
  scheduled: number;
  revenueCents: number;
};

export function methodStats(methods: Method[], consultations: Consultation[], payments: Payment[]): MethodStat[] {
  return methods.map((method) => {
    const related = consultations.filter((c) => c.methodId === method.id);
    const realized = related.filter((c) => c.status === "realizada");
    const revenueCents = realized.reduce((acc, c) => acc + paidFor(c.id, payments), 0);
    return {
      method,
      realized: realized.length,
      scheduled: related.filter((c) => c.status === "agendada" || c.status === "confirmada").length,
      revenueCents,
    };
  });
}

export type ConsulenteStat = {
  consulente: Consulente;
  total: number;
  realizada: number;
  futura: number;
  cancelada: number;
  falta: number;
  worksTotal: number;
  worksCompleted: number;
  lastRealized: string | null;
  first: string | null;
  paidCents: number;
  pendingCents: number;
  favoriteMethod: string | null;
  methodUsage: { name: string; count: number }[];
};

export function consulenteStats(
  consulente: Consulente,
  consultations: Consultation[],
  payments: Payment[],
  spiritualWorks: SpiritualWork[] = [],
  workPayments: WorkPayment[] = [],
): ConsulenteStat {
  const related = consultations.filter((c) => c.consulenteId === consulente.id);
  const relatedWorks = spiritualWorks.filter((w) => w.consulenteId === consulente.id);
  const realized = related.filter((c) => c.status === "realizada");
  const today = todayISO();
  const usage = new Map<string, number>();
  for (const c of related) usage.set(c.methodName, (usage.get(c.methodName) ?? 0) + 1);
  for (const w of relatedWorks) usage.set(w.title, (usage.get(w.title) ?? 0) + 1);
  const sortedUsage = [...usage.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const consultationPaid = payments
    .filter((p) => related.some((c) => c.id === p.consultationId))
    .reduce((a, p) => a + p.amountCents, 0);
  const workPaid = workPayments
    .filter((p) => relatedWorks.some((w) => w.id === p.workId))
    .reduce((a, p) => a + p.amountCents, 0);
  const consultationPending = related
    .filter((c) => c.status !== "cancelada")
    .reduce((acc, c) => acc + Math.max(0, c.priceCents - paidFor(c.id, payments)), 0);
  const workPending = relatedWorks
    .filter((w) => w.status !== "cancelado")
    .reduce((acc, w) => acc + Math.max(0, w.priceCents - paidForWork(w.id, workPayments)), 0);
  const allDates = [...related.map((c) => c.date), ...relatedWorks.map((w) => w.date)].sort();
  const realizedDates = [
    ...realized.map((c) => c.date),
    ...relatedWorks.filter((w) => w.status === "concluido").map((w) => w.date),
  ].sort();

  return {
    consulente,
    total: related.length,
    realizada: realized.length,
    futura: related.filter((c) => (c.status === "agendada" || c.status === "confirmada") && c.date >= today).length,
    cancelada: related.filter((c) => c.status === "cancelada").length,
    falta: related.filter((c) => c.status === "nao_compareceu").length,
    worksTotal: relatedWorks.length,
    worksCompleted: relatedWorks.filter((w) => w.status === "concluido").length,
    lastRealized: realizedDates.length ? realizedDates.at(-1) ?? null : null,
    first: allDates.length ? allDates[0] ?? null : null,
    paidCents: consultationPaid + workPaid,
    pendingCents: consultationPending + workPending,
    favoriteMethod: sortedUsage[0]?.name ?? null,
    methodUsage: sortedUsage,
  };
}

export type PeriodReport = {
  start: string;
  end: string;
  realized: Consultation[];
  scheduled: Consultation[];
  cancelled: Consultation[];
  noShow: Consultation[];
  receivedCents: number;
  pendingCents: number;
  workedSeconds: number;
  estimatedMinutes: number;
  hoursMinutes: number;
  methodUsage: { name: string; count: number; revenueCents: number }[];
  monthly: { month: string; consultations: number; paymentsCents: number; expensesCents: number }[];
};

export function periodReport(
  start: string,
  end: string,
  data: {
    consultations: Consultation[];
    payments: Payment[];
    transactions: Transaction[];
    consulenteId?: number | null;
  },
): PeriodReport {
  const inPeriod = (iso: string) => iso >= start && iso <= end;
  const consultations = data.consultations.filter(
    (c) => inPeriod(c.date) && (!data.consulenteId || c.consulenteId === data.consulenteId),
  );
  const relatedIds = new Set(consultations.map((c) => c.id));
  const paymentList = data.payments.filter((p) => relatedIds.has(p.consultationId) && inPeriod(p.paidAt));
  const realized = consultations.filter((c) => c.status === "realizada");
  const usageMap = new Map<string, { count: number; revenueCents: number }>();
  for (const c of realized) {
    const entry = usageMap.get(c.methodName) ?? { count: 0, revenueCents: 0 };
    entry.count += 1;
    entry.revenueCents += paidFor(c.id, data.payments);
    usageMap.set(c.methodName, entry);
  }
  const months = new Map<string, { consultations: number; paymentsCents: number; expensesCents: number }>();
  for (const c of consultations) {
    if (c.status !== "realizada") continue;
    const key = monthKey(c.date);
    const entry = months.get(key) ?? { consultations: 0, paymentsCents: 0, expensesCents: 0 };
    entry.consultations += 1;
    months.set(key, entry);
  }
  for (const p of paymentList) {
    const key = monthKey(p.paidAt);
    const entry = months.get(key) ?? { consultations: 0, paymentsCents: 0, expensesCents: 0 };
    entry.paymentsCents += p.amountCents;
    months.set(key, entry);
  }
  for (const t of data.transactions) {
    if (t.type !== "despesa" || !inPeriod(t.date)) continue;
    const key = monthKey(t.date);
    const entry = months.get(key) ?? { consultations: 0, paymentsCents: 0, expensesCents: 0 };
    entry.expensesCents += t.amountCents;
    months.set(key, entry);
  }
  return {
    start,
    end,
    realized,
    scheduled: consultations.filter((c) => c.status === "agendada" || c.status === "confirmada"),
    cancelled: consultations.filter((c) => c.status === "cancelada"),
    noShow: consultations.filter((c) => c.status === "nao_compareceu"),
    receivedCents: paymentList.reduce((a, p) => a + p.amountCents, 0),
    pendingCents: consultations
      .filter((c) => c.status !== "cancelada")
      .reduce((acc, c) => acc + Math.max(0, c.priceCents - paidFor(c.id, data.payments)), 0),
    workedSeconds: realized.reduce((a, c) => a + (c.actualSeconds ?? 0), 0),
    estimatedMinutes: realized.reduce((a, c) => a + c.durationMinutes, 0),
    hoursMinutes: Math.round(realized.reduce((a, c) => a + (c.actualSeconds ?? 0), 0) / 60),
    methodUsage: [...usageMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count),
    monthly: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
  };
}

export type UpcomingItem = { consultation: Consultation; consulenteName: string; paidCents: number; remainingCents: number };

export function upcomingConsultations(
  consultations: Consultation[],
  consulentes: Consulente[],
  payments: Payment[],
  limit = 6,
): UpcomingItem[] {
  const today = todayISO();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const nameById = new Map(consulentes.map((c) => [c.id, c.name]));
  return consultations
    .filter(
      (c) =>
        c.status === "em_atendimento" ||
        ((c.status === "agendada" || c.status === "confirmada") &&
          c.date >= today &&
          (c.date > today || timeToMinutes(c.startTime) >= nowMinutes - 30)),
    )
    .sort((a, b) => {
      if (a.status === "em_atendimento" && b.status !== "em_atendimento") return -1;
      if (b.status === "em_atendimento" && a.status !== "em_atendimento") return 1;
      return (a.date + a.startTime).localeCompare(b.date + b.startTime);
    })
    .slice(0, limit)
    .map((consultation) => {
      const paidCents = paidFor(consultation.id, payments);
      return {
        consultation,
        consulenteName: nameById.get(consultation.consulenteId) ?? "Consulente",
        paidCents,
        remainingCents: Math.max(0, consultation.priceCents - paidCents),
      };
    });
}
