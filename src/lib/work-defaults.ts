import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { consultations, consulentes, spiritualWorks, transactions, workCatalog, workPayments } from "@/db/schema";
import { addDaysISO, todayISO, toISO } from "@/lib/format";
import { getTenantSettings, saveTenantSettings } from "@/lib/settings";
import type { WorkKind } from "@/lib/types";

export type StarterWorkCatalogItem = {
  kind: WorkKind;
  name: string;
  description: string;
  materials: string;
  priceCents: number;
  cycleDays: number;
  durationMinutes: number;
  imageUrl: string;
};

export const STARTER_WORK_CATALOG: StarterWorkCatalogItem[] = [
  {
    kind: "magia",
    name: "Abertura de caminhos",
    description: "Trabalho espiritual para destravar prosperidade, oportunidades profissionais e fluidez pessoal.",
    materials: "Velas douradas e brancas, louro, canela, alecrim, cristal citrino",
    priceCents: 38000,
    cycleDays: 7,
    durationMinutes: 60,
    imageUrl: "/images/spiritual-works.jpg",
  },
  {
    kind: "magia",
    name: "Vira pensamento",
    description: "Ritual direcionado ao alinhamento mental, clareza de intenções e reaproximação afetiva.",
    materials: "Vela de 7 dias, ervas de harmonização, incenso natural, quartzo",
    priceCents: 42000,
    cycleDays: 7,
    durationMinutes: 60,
    imageUrl: "/images/spiritual-works.jpg",
  },
  {
    kind: "magia",
    name: "Adoçamento",
    description: "Trabalho afetivo de harmonização, ternura e equilíbrio emocional com elementos doces.",
    materials: "Mel puro, velas cor-de-rosa, pétalas de rosa, canela em pau, quartzo rosa",
    priceCents: 35000,
    cycleDays: 7,
    durationMinutes: 60,
    imageUrl: "/images/spiritual-works.jpg",
  },
  {
    kind: "magia",
    name: "Limpeza espiritual",
    description: "Desbloqueio energético, corte de cargas densas e proteção espiritual.",
    materials: "Arruda, guiné, sal grosso, vela branca, defumação de mirra",
    priceCents: 28000,
    cycleDays: 3,
    durationMinutes: 50,
    imageUrl: "/images/tarot-crystal.jpg",
  },
  {
    kind: "atividade",
    name: "Reiki",
    description: "Sessão terapêutica de imposição de mãos e alinhamento energético dos chakras.",
    materials: "Cristais dos 7 chakras, incenso suave, música de frequência",
    priceCents: 15000,
    cycleDays: 1,
    durationMinutes: 60,
    imageUrl: "/images/holistic-therapy.jpg",
  },
  {
    kind: "atividade",
    name: "Aromaterapia",
    description: "Atendimento terapêutico com sinergia personalizada de óleos essenciais puros.",
    materials: "Óleos essenciais (lavanda, bergamota, olíbano), óleo vegetal carreador, difusor",
    priceCents: 16000,
    cycleDays: 1,
    durationMinutes: 50,
    imageUrl: "/images/holistic-therapy.jpg",
  },
  {
    kind: "atividade",
    name: "Acupuntura",
    description: "Sessão integrativa de equilíbrio físico e energético por estímulo de meridianos e pontos.",
    materials: "Agulhas descartáveis estéreis, sementes auriculares, moxa",
    priceCents: 18000,
    cycleDays: 1,
    durationMinutes: 60,
    imageUrl: "/images/holistic-therapy.jpg",
  },
];

export async function ensureWorkCatalogForTenant(tenantId: number, isDemo = false): Promise<void> {
  const settings = await getTenantSettings(tenantId);
  const existingCatalog = await db.select().from(workCatalog).where(eq(workCatalog.tenantId, tenantId));

  let catalogRows = existingCatalog;
  if (!existingCatalog.length && !settings.workCatalogSeeded) {
    catalogRows = await db
      .insert(workCatalog)
      .values(
        STARTER_WORK_CATALOG.map((item) => ({
          tenantId,
          ...item,
          active: true,
          archived: false,
        })),
      )
      .returning();

    const nextIncome = settings.incomeCategories.includes("Trabalhos e terapias")
      ? settings.incomeCategories
      : [...settings.incomeCategories, "Trabalhos e terapias"];
    await saveTenantSettings(tenantId, {
      workCatalogSeeded: true,
      incomeCategories: nextIncome,
    });
  } else if (!settings.workCatalogSeeded) {
    await saveTenantSettings(tenantId, { workCatalogSeeded: true });
  }

  if (!isDemo) return;

  // Garante tempos cronometrados realistas nas consultas realizadas da conta de demonstração
  const untimedDemo = await db
    .select()
    .from(consultations)
    .where(and(eq(consultations.tenantId, tenantId), eq(consultations.status, "realizada"), eq(consultations.actualSeconds, 0)));
  for (const [idx, row] of untimedDemo.entries()) {
    const deltaSeconds = ((idx % 5) - 2) * 195 + 42; // variação realista de segundos/minutos em torno da duração estimada
    const simulatedSeconds = Math.max(900, row.durationMinutes * 60 + deltaSeconds);
    await db
      .update(consultations)
      .set({ actualSeconds: simulatedSeconds })
      .where(eq(consultations.id, row.id));
  }

  const existingWorks = await db.select({ id: spiritualWorks.id }).from(spiritualWorks).where(eq(spiritualWorks.tenantId, tenantId)).limit(1);
  if (existingWorks.length || !catalogRows.length) return;

  const tenantConsulentes = await db.select().from(consulentes).where(eq(consulentes.tenantId, tenantId));
  if (!tenantConsulentes.length) return;

  const now = new Date();
  const today = todayISO();
  const sampleSpecs = [
    { offsetMonths: -2, day: 6, catalogIdx: 0, consulenteIdx: 0, status: "concluido", paidRatio: 1, intention: "Destravar nova fase profissional e clientes." },
    { offsetMonths: -2, day: 16, catalogIdx: 4, consulenteIdx: 1, status: "concluido", paidRatio: 1, intention: "Ansiedade e equilíbrio do sono." },
    { offsetMonths: -1, day: 5, catalogIdx: 2, consulenteIdx: 2, status: "concluido", paidRatio: 1, intention: "Harmonização do relacionamento." },
    { offsetMonths: -1, day: 14, catalogIdx: 5, consulenteIdx: 3, status: "concluido", paidRatio: 1, intention: "Blend calmante para foco diário." },
    { offsetMonths: -1, day: 22, catalogIdx: 1, consulenteIdx: 4, status: "concluido", paidRatio: 0.5, intention: "Reaproximação e diálogo aberto." },
    { offsetMonths: 0, day: 1, catalogIdx: 6, consulenteIdx: 5, status: "concluido", paidRatio: 1, intention: "Alívio de tensão cervical e energia vital." },
    { offsetMonths: 0, day: Math.max(1, now.getDate()), catalogIdx: 0, consulenteIdx: 0, status: "em_andamento", paidRatio: 0.5, intention: "Firmeza de 7 dias para prosperidade." },
    { offsetMonths: 0, day: Math.max(1, now.getDate()), catalogIdx: 4, consulenteIdx: 6, status: "planejado", paidRatio: 0, intention: "Sessão agendada de Reiki com cristais.", futureDays: 2 },
  ];

  const createdWorks = await db
    .insert(spiritualWorks)
    .values(
      sampleSpecs.map((spec, idx) => {
        const cat = catalogRows[spec.catalogIdx % catalogRows.length];
        const con = tenantConsulentes[spec.consulenteIdx % tenantConsulentes.length];
        const baseDate = spec.futureDays
          ? addDaysISO(today, spec.futureDays)
          : toISO(new Date(now.getFullYear(), now.getMonth() + spec.offsetMonths, Math.min(spec.day, 27)));
        const endDate = cat.cycleDays > 1 ? addDaysISO(baseDate, cat.cycleDays) : baseDate;
        return {
          tenantId,
          consulenteId: con.id,
          catalogId: cat.id,
          kind: cat.kind,
          title: cat.name,
          catalogPriceCents: cat.priceCents,
          priceCents: cat.priceCents,
          materialCostCents: cat.kind === "magia" ? 4500 : 1500,
          date: baseDate,
          startTime: cat.kind === "atividade" ? (idx % 2 === 0 ? "14:00" : "16:30") : "20:00",
          endDate,
          durationMinutes: cat.durationMinutes,
          cycleDays: cat.cycleDays,
          status: spec.status,
          paymentStatus: spec.paidRatio >= 1 ? "pago" : spec.paidRatio > 0 ? "parcial" : "pendente",
          paymentMethod: "Pix",
          intention: spec.intention,
          materials: cat.materials,
          imageUrl: cat.imageUrl,
          notes: "Registro fictício da conta de demonstração.",
        };
      }),
    )
    .returning();

  for (const [idx, work] of createdWorks.entries()) {
    const ratio = sampleSpecs[idx]?.paidRatio ?? 0;
    if (ratio <= 0) continue;
    const amountCents = Math.round(work.priceCents * ratio);
    const [wp] = await db
      .insert(workPayments)
      .values({
        tenantId,
        workId: work.id,
        amountCents,
        paidAt: work.date,
        method: "Pix",
        notes: ratio < 1 ? "Entrada de 50% para início do trabalho." : null,
        kind: "pagamento",
        idempotencyKey: `seed-work-${tenantId}-${work.id}`,
      })
      .returning();

    await db.insert(transactions).values({
      tenantId,
      type: "entrada",
      description: `${work.kind === "magia" ? "Trabalho" : "Atividade"} — ${work.title}`,
      amountCents,
      date: work.date,
      category: "Trabalhos e terapias",
      paymentMethod: "Pix",
      workId: work.id,
      workPaymentId: wp.id,
      reference: `work_payment:${wp.id}`,
    });
  }
}
