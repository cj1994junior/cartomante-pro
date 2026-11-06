import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  backups,
  consultations,
  consulentes,
  methods,
  payments,
  spiritualWorks,
  transactions,
  workCatalog,
  workPayments,
} from "@/db/schema";
import { fail, logAudit, normalizeName, normalizePhone, requireTenant, str } from "@/lib/api";
import { buildSnapshot } from "@/app/api/backup/route";
import { recalcAllPayments } from "@/lib/records";
import { clientOriginLabel, parseClientOrigin } from "@/lib/client-origins";
import { addDaysISO, formatDateBR, parseDateFlexible, parseMoneyToCents, todayISO } from "@/lib/format";
import type { ClientOrigin, ConsultationStatus, WorkKind, WorkStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type SheetKey = "consulentes" | "metodos" | "catalogo_trabalhos" | "consultas" | "trabalhos" | "financeiro";

function normHeader(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getField(row: Record<string, unknown>, aliases: string[]): unknown {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normHeader(alias);
    for (const [k, v] of entries) {
      if (normHeader(k) === target) {
        if (v !== undefined && v !== null && String(v).trim() !== "") return v;
      }
    }
  }
  return undefined;
}

function isExampleRow(row: Record<string, unknown>): boolean {
  return Object.values(row).some((val) => typeof val === "string" && val.toUpperCase().includes("[EXEMPLO]"));
}

function parseTimeFlexible(raw: unknown, fallback = "10:00"): string {
  if (raw === null || raw === undefined || raw === "") return fallback;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${String(raw.getHours()).padStart(2, "0")}:${String(raw.getMinutes()).padStart(2, "0")}`;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw >= 0 && raw < 1) {
      const totalMinutes = Math.round(raw * 1440) % 1440;
      return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
    }
    if (raw >= 0 && raw <= 23) return `${String(Math.trunc(raw)).padStart(2, "0")}:00`;
  }
  const text = String(raw).trim().toLowerCase();
  const hm = text.match(/^(\d{1,2})[:h](\d{2})?$/);
  if (hm) {
    const h = Math.min(23, Math.max(0, Number(hm[1])));
    const m = Math.min(59, Math.max(0, Number(hm[2] ?? "0")));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return fallback;
}

function parseConsultationStatus(raw: unknown): ConsultationStatus {
  const t = normalizeName(String(raw ?? ""));
  if (t.includes("confirm")) return "confirmada";
  if (t.includes("realiz") || t.includes("conclu") || t.includes("atendid")) return "realizada";
  if (t.includes("cancel")) return "cancelada";
  if (t.includes("falt") || t.includes("nao comparec") || t.includes("ausent")) return "nao_compareceu";
  return "agendada";
}

function parseWorkStatus(raw: unknown): WorkStatus {
  const t = normalizeName(String(raw ?? ""));
  if (t.includes("planej") || t.includes("agend")) return "planejado";
  if (t.includes("conclu") || t.includes("realiz") || t.includes("entreg") || t.includes("finaliz")) return "concluido";
  if (t.includes("cancel")) return "cancelado";
  return "em_andamento";
}

function parseWorkKind(rawKind: unknown, title = ""): WorkKind {
  const t = `${normalizeName(String(rawKind ?? ""))} ${normalizeName(title)}`;
  if (
    t.includes("atividad") ||
    t.includes("terapi") ||
    t.includes("reiki") ||
    t.includes("aroma") ||
    t.includes("acupunt") ||
    t.includes("cristal") ||
    t.includes("holist")
  ) {
    return "atividade";
  }
  return "magia";
}

function parseMoneyCell(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.round(raw * 100));
  if (typeof raw === "string") return Math.max(0, parseMoneyToCents(raw));
  return 0;
}

function centsToNumber(cents: number): number {
  return Number(((cents ?? 0) / 100).toFixed(2));
}

function detectSheetKey(sheetName: string, firstRow: Record<string, unknown>): SheetKey | null {
  const sn = normalizeName(sheetName);
  if (sn.includes("instruc")) return null;
  if (sn.includes("catalogo") && sn.includes("trabalh")) return "catalogo_trabalhos";
  if (sn.includes("trabalh") || sn.includes("magia") || sn.includes("terapi") || sn.includes("atividad")) return "trabalhos";
  if (sn.includes("metodo") || sn.includes("tiragem")) return "metodos";
  if (sn.includes("consulta")) return "consultas";
  if (sn.includes("financ") || sn.includes("lancament") || sn.includes("despesa")) return "financeiro";
  if (sn.includes("consulent") || sn.includes("client")) return "consulentes";

  const headers = Object.keys(firstRow).map(normHeader);
  if (headers.some((h) => h.includes("trabalho ou atividade") || h.includes("intencao") || h.includes("data conclusao"))) return "trabalhos";
  if (headers.some((h) => h.includes("metodo")) && headers.some((h) => h.includes("consulente"))) return "consultas";
  if (headers.some((h) => h.includes("ciclo")) && headers.some((h) => h.includes("materiais"))) return "catalogo_trabalhos";
  if (headers.some((h) => h.includes("nome do metodo") || (h.includes("duracao") && h.includes("valor padrao")))) return "metodos";
  if (headers.some((h) => h.includes("categoria")) && headers.some((h) => h.includes("descricao"))) return "financeiro";
  if (headers.some((h) => h.includes("nome completo") || h === "nome") && headers.some((h) => h.includes("telefone"))) return "consulentes";
  return null;
}

export async function GET(req: Request) {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const tenantId = auth.tenant.id;

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "export" ? "export" : "template";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const sheetParam = (url.searchParams.get("sheet") ?? "consultas") as SheetKey;

  const wb = XLSX.utils.book_new();

  const instructionsRows = [
    ["CARTOMANTE PRO — PLANILHA PADRÃO DE IMPORTAÇÃO E EXPORTAÇÃO"],
    [""],
    ["Como usar esta planilha:"],
    ["1. Preencha apenas as abas que desejar importar (Consulentes, Metodos_Tiragem, Catalogo_Trabalhos, Consultas, Trabalhos_e_Magias, Financeiro)."],
    ["2. As linhas que contêm a palavra [EXEMPLO] servem apenas de modelo e são ignoradas automaticamente na importação."],
    ["3. Datas: use o formato DD/MM/AAAA (ex.: 15/11/2026). Horários: use HH:MM em 24h (ex.: 14:30)."],
    ["4. Valores monetários: digite apenas o número (ex.: 150,00 ou 150). Não precisa digitar R$, € ou US$."],
    ["5. Na aba Trabalhos_e_Magias você pode lançar tanto Trabalhos/Magias (Abertura de caminhos, Vira pensamento, Adoçamento) quanto Atividades (Reiki, Aromaterapia, Acupuntura)."],
    ["6. Se você informar uma Consulente ou Método/Trabalho que ainda não existe no app, ele será cadastrado automaticamente na importação."],
    ["7. Se preencher a coluna 'Valor Pago', o aplicativo registra automaticamente o pagamento e a entrada financeira sem duplicar."],
    ["8. Na aba Consulentes, informe a Origem: Indicação, WhatsApp, Instagram, Facebook, Outro ou deixe em branco. A data de cadastro é opcional."],
  ];

  if (mode === "template") {
    const wsInst = XLSX.utils.aoa_to_sheet(instructionsRows);
    wsInst["!cols"] = [{ wch: 115 }];
    XLSX.utils.book_append_sheet(wb, wsInst, "Instrucoes");

    const wsConsulentes = XLSX.utils.json_to_sheet([
      {
        "Nome Completo": "[EXEMPLO] Maria Silva",
        Telefone: "(11) 98877-1020",
        Origem: "Indicação",
        "Data Cadastro (DD/MM/AAAA)": "15/11/2026",
        Observacoes: "Prefere atendimento à tarde",
      },
    ]);
    wsConsulentes["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 40 }];

    const wsMetodos = XLSX.utils.json_to_sheet([
      {
        "Nome do Metodo": "[EXEMPLO] Cruz Celta",
        "Valor Padrao": 220,
        "Duracao (min)": 90,
        Descricao: "Leitura profunda com 10 cartas",
        Ativo: "Sim",
      },
    ]);
    wsMetodos["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 15 }, { wch: 42 }, { wch: 10 }];

    const wsCatalogoTrabalhos = XLSX.utils.json_to_sheet([
      {
        "Tipo (Magia ou Atividade)": "Magia",
        Nome: "[EXEMPLO] Abertura de caminhos",
        "Valor Padrao": 380,
        "Ciclo (dias)": 7,
        "Duracao (min)": 60,
        Materiais: "Velas douradas, louro, canela, alecrim",
        Descricao: "Trabalho espiritual para prosperidade e oportunidades",
        Ativo: "Sim",
      },
      {
        "Tipo (Magia ou Atividade)": "Atividade",
        Nome: "[EXEMPLO] Reiki",
        "Valor Padrao": 150,
        "Ciclo (dias)": 1,
        "Duracao (min)": 60,
        Materiais: "Cristais dos chakras e incenso suave",
        Descricao: "Sessão terapêutica de equilíbrio energético",
        Ativo: "Sim",
      },
    ]);
    wsCatalogoTrabalhos["!cols"] = [{ wch: 24 }, { wch: 30 }, { wch: 14 }, { wch: 13 }, { wch: 15 }, { wch: 36 }, { wch: 44 }, { wch: 10 }];

    const wsConsultas = XLSX.utils.json_to_sheet([
      {
        "Data (DD/MM/AAAA)": "15/11/2026",
        "Horario (HH:MM)": "14:00",
        Consulente: "[EXEMPLO] Maria Silva",
        "Telefone Consulente": "(11) 98877-1020",
        "Metodo de Tiragem": "Cruz Celta",
        Valor: 220,
        "Duracao (min)": 90,
        "Tempo Trabalhado (min)": 85,
        "Status (Agendada/Confirmada/Realizada/Cancelada/Falta)": "Realizada",
        "Valor Pago": 220,
        "Data Pagamento (DD/MM/AAAA)": "15/11/2026",
        "Forma de Pagamento": "Pix",
        Observacoes: "Questões sobre carreira",
      },
    ]);
    wsConsultas["!cols"] = [
      { wch: 18 },
      { wch: 16 },
      { wch: 28 },
      { wch: 18 },
      { wch: 24 },
      { wch: 12 },
      { wch: 14 },
      { wch: 24 },
      { wch: 13 },
      { wch: 22 },
      { wch: 18 },
      { wch: 36 },
    ];

    const wsTrabalhos = XLSX.utils.json_to_sheet([
      {
        "Data Inicio (DD/MM/AAAA)": "15/11/2026",
        "Data Conclusao (DD/MM/AAAA)": "22/11/2026",
        "Horario (HH:MM)": "20:00",
        "Tipo (Magia ou Atividade)": "Magia",
        "Trabalho ou Atividade": "Abertura de caminhos",
        Consulente: "[EXEMPLO] Maria Silva",
        "Telefone Consulente": "(11) 98877-1020",
        Valor: 380,
        "Status (Planejado/Em andamento/Concluido/Cancelado)": "Em andamento",
        "Valor Pago": 190,
        "Data Pagamento (DD/MM/AAAA)": "15/11/2026",
        "Forma de Pagamento": "Pix",
        "Intencao ou Foco": "Prosperidade e novos caminhos profissionais",
        "Materiais Utilizados": "Vela de 7 dias dourada, louro e canela",
        Observacoes: "50% na entrada e 50% na entrega",
      },
      {
        "Data Inicio (DD/MM/AAAA)": "16/11/2026",
        "Data Conclusao (DD/MM/AAAA)": "16/11/2026",
        "Horario (HH:MM)": "15:00",
        "Tipo (Magia ou Atividade)": "Atividade",
        "Trabalho ou Atividade": "Reiki",
        Consulente: "[EXEMPLO] Maria Silva",
        "Telefone Consulente": "(11) 98877-1020",
        Valor: 150,
        "Status (Planejado/Em andamento/Concluido/Cancelado)": "Concluido",
        "Valor Pago": 150,
        "Data Pagamento (DD/MM/AAAA)": "16/11/2026",
        "Forma de Pagamento": "Pix",
        "Intencao ou Foco": "Equilíbrio emocional e relaxamento",
        "Materiais Utilizados": "Cristais e aromaterapia de lavanda",
        Observacoes: "Sessão presencial",
      },
    ]);
    wsTrabalhos["!cols"] = [
      { wch: 22 },
      { wch: 24 },
      { wch: 15 },
      { wch: 22 },
      { wch: 26 },
      { wch: 28 },
      { wch: 18 },
      { wch: 12 },
      { wch: 24 },
      { wch: 13 },
      { wch: 22 },
      { wch: 18 },
      { wch: 34 },
      { wch: 34 },
      { wch: 34 },
    ];

    const wsFinanceiro = XLSX.utils.json_to_sheet([
      {
        "Data (DD/MM/AAAA)": "10/11/2026",
        "Tipo (Entrada ou Despesa)": "Despesa",
        Descricao: "[EXEMPLO] Velas, mel, ervas e óleos essenciais",
        Valor: 95.5,
        Categoria: "Materiais de trabalho",
        "Forma de Pagamento": "Pix",
        Observacoes: "Reposição mensal do ateliê",
      },
    ]);
    wsFinanceiro["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 38 }, { wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 32 }];

    const sheetMap: Record<SheetKey, XLSX.WorkSheet> = {
      consulentes: wsConsulentes,
      metodos: wsMetodos,
      catalogo_trabalhos: wsCatalogoTrabalhos,
      consultas: wsConsultas,
      trabalhos: wsTrabalhos,
      financeiro: wsFinanceiro,
    };

    if (format === "csv") {
      const targetWs = sheetMap[sheetParam] ?? wsConsultas;
      const csv = `\uFEFF${XLSX.utils.sheet_to_csv(targetWs, { FS: ";" })}`;
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="planilha-padrao-${sheetParam}.csv"`,
        },
      });
    }

    XLSX.utils.book_append_sheet(wb, wsConsulentes, "Consulentes");
    XLSX.utils.book_append_sheet(wb, wsMetodos, "Metodos_Tiragem");
    XLSX.utils.book_append_sheet(wb, wsCatalogoTrabalhos, "Catalogo_Trabalhos");
    XLSX.utils.book_append_sheet(wb, wsConsultas, "Consultas");
    XLSX.utils.book_append_sheet(wb, wsTrabalhos, "Trabalhos_e_Magias");
    XLSX.utils.book_append_sheet(wb, wsFinanceiro, "Financeiro");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="cartomante-pro-planilha-padrao.xlsx"',
      },
    });
  }

  // mode === "export": Exporta todos os registros atuais da profissional em planilha estruturada
  const [consulenteRows, methodRows, catalogRows, consultationRows, paymentRows, workRows, workPaymentRows, transactionRows] =
    await Promise.all([
      db.select().from(consulentes).where(eq(consulentes.tenantId, tenantId)),
      db.select().from(methods).where(eq(methods.tenantId, tenantId)),
      db.select().from(workCatalog).where(eq(workCatalog.tenantId, tenantId)),
      db.select().from(consultations).where(eq(consultations.tenantId, tenantId)),
      db.select().from(payments).where(eq(payments.tenantId, tenantId)),
      db.select().from(spiritualWorks).where(eq(spiritualWorks.tenantId, tenantId)),
      db.select().from(workPayments).where(eq(workPayments.tenantId, tenantId)),
      db.select().from(transactions).where(eq(transactions.tenantId, tenantId)),
    ]);

  const consulenteById = new Map(consulenteRows.map((c) => [c.id, c]));

  const wsInst = XLSX.utils.aoa_to_sheet(instructionsRows);
  XLSX.utils.book_append_sheet(wb, wsInst, "Instrucoes");

  const wsConsulentes = XLSX.utils.json_to_sheet(
    consulenteRows.map((c) => ({
      "Nome Completo": c.name,
      Telefone: c.phone ?? "",
      Origem: clientOriginLabel(c.origin),
      "Data Cadastro (DD/MM/AAAA)": formatDateBR(c.createdAt.toISOString()),
      Observacoes: c.notes ?? "",
    })),
  );
  const wsMetodos = XLSX.utils.json_to_sheet(
    methodRows.map((m) => ({
      "Nome do Metodo": m.name,
      "Valor Padrao": centsToNumber(m.priceCents),
      "Duracao (min)": m.durationMinutes,
      Descricao: m.description ?? "",
      Ativo: m.active && !m.archived ? "Sim" : "Nao",
    })),
  );
  const wsCatalogoTrabalhos = XLSX.utils.json_to_sheet(
    catalogRows.map((w) => ({
      "Tipo (Magia ou Atividade)": w.kind === "atividade" ? "Atividade" : "Magia",
      Nome: w.name,
      "Valor Padrao": centsToNumber(w.priceCents),
      "Ciclo (dias)": w.cycleDays,
      "Duracao (min)": w.durationMinutes,
      Materiais: w.materials ?? "",
      Descricao: w.description ?? "",
      Ativo: w.active && !w.archived ? "Sim" : "Nao",
    })),
  );
  const wsConsultas = XLSX.utils.json_to_sheet(
    consultationRows.map((c) => {
      const con = consulenteById.get(c.consulenteId);
      const relatedPayments = paymentRows.filter((p) => p.consultationId === c.id);
      const paid = relatedPayments.reduce((a, p) => a + p.amountCents, 0);
      const lastPaidAt = relatedPayments.at(-1)?.paidAt ?? "";
      return {
        "Data (DD/MM/AAAA)": formatDateBR(c.date),
        "Horario (HH:MM)": c.startTime,
        Consulente: con?.name ?? "",
        "Telefone Consulente": con?.phone ?? "",
        "Metodo de Tiragem": c.methodName,
        Valor: centsToNumber(c.priceCents),
        "Duracao (min)": c.durationMinutes,
        "Tempo Trabalhado (min)": c.actualSeconds > 0 ? Math.round(c.actualSeconds / 60) : "",
        "Status (Agendada/Confirmada/Realizada/Cancelada/Falta)": c.status,
        "Valor Pago": centsToNumber(Math.max(0, paid)),
        "Data Pagamento (DD/MM/AAAA)": lastPaidAt ? formatDateBR(lastPaidAt) : "",
        "Forma de Pagamento": c.paymentMethod ?? "Pix",
        Observacoes: c.notes ?? "",
      };
    }),
  );
  const wsTrabalhos = XLSX.utils.json_to_sheet(
    workRows.map((w) => {
      const con = consulenteById.get(w.consulenteId);
      const relatedPayments = workPaymentRows.filter((p) => p.workId === w.id);
      const paid = relatedPayments.reduce((a, p) => a + p.amountCents, 0);
      const lastPaidAt = relatedPayments.at(-1)?.paidAt ?? "";
      return {
        "Data Inicio (DD/MM/AAAA)": formatDateBR(w.date),
        "Data Conclusao (DD/MM/AAAA)": w.endDate ? formatDateBR(w.endDate) : "",
        "Horario (HH:MM)": w.startTime ?? "",
        "Tipo (Magia ou Atividade)": w.kind === "atividade" ? "Atividade" : "Magia",
        "Trabalho ou Atividade": w.title,
        Consulente: con?.name ?? "",
        "Telefone Consulente": con?.phone ?? "",
        Valor: centsToNumber(w.priceCents),
        "Status (Planejado/Em andamento/Concluido/Cancelado)": w.status,
        "Valor Pago": centsToNumber(Math.max(0, paid)),
        "Data Pagamento (DD/MM/AAAA)": lastPaidAt ? formatDateBR(lastPaidAt) : "",
        "Forma de Pagamento": w.paymentMethod ?? "Pix",
        "Intencao ou Foco": w.intention ?? "",
        "Materiais Utilizados": w.materials ?? "",
        Observacoes: w.notes ?? "",
      };
    }),
  );
  const wsFinanceiro = XLSX.utils.json_to_sheet(
    transactionRows
      .filter((t) => !t.paymentId && !t.workPaymentId)
      .map((t) => ({
        "Data (DD/MM/AAAA)": formatDateBR(t.date),
        "Tipo (Entrada ou Despesa)": t.type === "despesa" ? "Despesa" : "Entrada",
        Descricao: t.description,
        Valor: centsToNumber(t.amountCents),
        Categoria: t.category,
        "Forma de Pagamento": t.paymentMethod,
        Observacoes: t.notes ?? "",
      })),
  );

  const exportMap: Record<SheetKey, XLSX.WorkSheet> = {
    consulentes: wsConsulentes,
    metodos: wsMetodos,
    catalogo_trabalhos: wsCatalogoTrabalhos,
    consultas: wsConsultas,
    trabalhos: wsTrabalhos,
    financeiro: wsFinanceiro,
  };

  if (format === "csv") {
    const targetWs = exportMap[sheetParam] ?? wsConsultas;
    const csv = `\uFEFF${XLSX.utils.sheet_to_csv(targetWs, { FS: ";" })}`;
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cartomante-pro-${sheetParam}-${todayISO()}.csv"`,
      },
    });
  }

  XLSX.utils.book_append_sheet(wb, wsConsulentes, "Consulentes");
  XLSX.utils.book_append_sheet(wb, wsMetodos, "Metodos_Tiragem");
  XLSX.utils.book_append_sheet(wb, wsCatalogoTrabalhos, "Catalogo_Trabalhos");
  XLSX.utils.book_append_sheet(wb, wsConsultas, "Consultas");
  XLSX.utils.book_append_sheet(wb, wsTrabalhos, "Trabalhos_e_Magias");
  XLSX.utils.book_append_sheet(wb, wsFinanceiro, "Financeiro");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cartomante-pro-registros-${todayISO()}.xlsx"`,
    },
  });
}

type ParsedConsulente = {
  name: string;
  phone: string | null;
  notes: string | null;
  origin: ClientOrigin;
  createdAt: string | null;
};
type ParsedMetodo = { name: string; priceCents: number; durationMinutes: number; description: string | null; active: boolean };
type ParsedCatalogo = {
  kind: WorkKind;
  name: string;
  priceCents: number;
  cycleDays: number;
  durationMinutes: number;
  materials: string | null;
  description: string | null;
  active: boolean;
};
type ParsedConsulta = {
  date: string;
  startTime: string;
  consulenteName: string;
  consulentePhone: string | null;
  methodName: string;
  priceCents: number | null;
  durationMinutes: number | null;
  actualSeconds: number;
  status: ConsultationStatus;
  paidCents: number;
  paidAt: string;
  paymentMethod: string;
  notes: string | null;
};
type ParsedTrabalho = {
  date: string;
  endDate: string | null;
  startTime: string | null;
  kind: WorkKind;
  title: string;
  consulenteName: string;
  consulentePhone: string | null;
  priceCents: number | null;
  status: WorkStatus;
  paidCents: number;
  paidAt: string;
  paymentMethod: string;
  intention: string | null;
  materials: string | null;
  notes: string | null;
};
type ParsedFinanceiro = {
  date: string;
  type: "entrada" | "despesa";
  description: string;
  amountCents: number;
  category: string;
  paymentMethod: string;
  notes: string | null;
};

export async function POST(req: Request) {
  const auth = await requireTenant();
  if (auth.error) return auth.error;
  const tenantId = auth.tenant.id;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail("Envie um arquivo de planilha (.xlsx ou .csv).", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return fail("Selecione o arquivo da planilha para importar.", 400);
  const dryRun = String(formData.get("dryRun") ?? "true") !== "false";
  const sheetHint = str(formData.get("sheetHint"), 40) as SheetKey | "";

  if (file.size > 12 * 1024 * 1024) {
    return fail("O arquivo excede o limite de 12 MB.", 400);
  }

  let workbook: XLSX.WorkBook;
  try {
    const ab = await file.arrayBuffer();
    const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv");
    if (isCsv) {
      const text = new TextDecoder("utf-8").decode(ab).replace(/^\uFEFF/, "");
      workbook = XLSX.read(text, { type: "string", raw: false });
    } else {
      workbook = XLSX.read(ab, { type: "array", cellDates: true });
    }
  } catch {
    return fail("Não foi possível ler esta planilha. Verifique se o arquivo está em formato .xlsx ou .csv válido.", 400);
  }

  const parsedConsulentes: ParsedConsulente[] = [];
  const parsedMetodos: ParsedMetodo[] = [];
  const parsedCatalogo: ParsedCatalogo[] = [];
  const parsedConsultas: ParsedConsulta[] = [];
  const parsedTrabalhos: ParsedTrabalho[] = [];
  const parsedFinanceiro: ParsedFinanceiro[] = [];
  const warnings: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (!rows.length) continue;

    const detected =
      workbook.SheetNames.length === 1 && sheetHint
        ? (detectSheetKey(sheetName, rows[0]) ?? sheetHint)
        : detectSheetKey(sheetName, rows[0]);
    if (!detected) continue;

    rows.forEach((row, idx) => {
      const lineNum = idx + 2;
      if (isExampleRow(row)) return;
      const nonEmpty = Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== "");
      if (!nonEmpty) return;

      if (detected === "consulentes") {
        const name = str(getField(row, ["Nome Completo", "Nome", "Consulente", "Cliente"]), 160);
        if (name.length < 2) {
          warnings.push(`Aba ${sheetName}, linha ${lineNum}: nome da consulente ausente.`);
          return;
        }
        const phone = str(getField(row, ["Telefone", "Celular", "WhatsApp"]), 40) || null;
        const notes = str(getField(row, ["Observacoes", "Notas"]), 2000) || null;
        const origin = parseClientOrigin(getField(row, ["Origem", "Origem da consulente", "Como conheceu"]));
        const createdAt = parseDateFlexible(getField(row, ["Data Cadastro", "Data de Cadastro", "Cadastro"]));
        parsedConsulentes.push({ name, phone, notes, origin, createdAt });
      } else if (detected === "metodos") {
        const name = str(getField(row, ["Nome do Metodo", "Metodo", "Nome"]), 120);
        if (name.length < 2) {
          warnings.push(`Aba ${sheetName}, linha ${lineNum}: nome do método ausente.`);
          return;
        }
        const priceCents = parseMoneyCell(getField(row, ["Valor Padrao", "Valor", "Preco"]));
        const durationMinutes = Math.min(600, Math.max(5, Number(getField(row, ["Duracao", "Minutos"])) || 60));
        const description = str(getField(row, ["Descricao", "Observacoes"]), 1000) || null;
        const activeRaw = normalizeName(String(getField(row, ["Ativo", "Status"]) ?? "sim"));
        parsedMetodos.push({ name, priceCents, durationMinutes, description, active: !activeRaw.startsWith("n") && !activeRaw.includes("inativ") });
      } else if (detected === "catalogo_trabalhos") {
        const name = str(getField(row, ["Nome", "Trabalho", "Atividade", "Trabalho ou Atividade"]), 140);
        if (name.length < 2) {
          warnings.push(`Aba ${sheetName}, linha ${lineNum}: nome do trabalho/atividade ausente.`);
          return;
        }
        const kind = parseWorkKind(getField(row, ["Tipo"]), name);
        const priceCents = parseMoneyCell(getField(row, ["Valor Padrao", "Valor", "Preco"]));
        const cycleDays = Math.min(365, Math.max(1, Number(getField(row, ["Ciclo", "Dias"])) || (kind === "magia" ? 7 : 1)));
        const durationMinutes = Math.min(600, Math.max(5, Number(getField(row, ["Duracao", "Minutos"])) || 60));
        const materials = str(getField(row, ["Materiais", "Elementos"]), 1000) || null;
        const description = str(getField(row, ["Descricao", "Observacoes"]), 1500) || null;
        const activeRaw = normalizeName(String(getField(row, ["Ativo", "Status"]) ?? "sim"));
        parsedCatalogo.push({
          kind,
          name,
          priceCents,
          cycleDays,
          durationMinutes,
          materials,
          description,
          active: !activeRaw.startsWith("n") && !activeRaw.includes("inativ"),
        });
      } else if (detected === "consultas") {
        const date = parseDateFlexible(getField(row, ["Data", "Data da Consulta"]));
        const consulenteName = str(getField(row, ["Consulente", "Cliente", "Nome"]), 160);
        const methodName = str(getField(row, ["Metodo de Tiragem", "Metodo", "Tiragem", "Servico"]), 120);
        if (!date || consulenteName.length < 2 || methodName.length < 2) {
          warnings.push(`Aba ${sheetName}, linha ${lineNum}: informe Data válida (DD/MM/AAAA), Consulente e Método.`);
          return;
        }
        const startTime = parseTimeFlexible(getField(row, ["Horario", "Hora", "Inicio"]), "10:00");
        const rawValor = getField(row, ["Valor", "Preco"]);
        const priceCents = rawValor !== undefined ? parseMoneyCell(rawValor) : null;
        const rawDur = Number(getField(row, ["Duracao", "Minutos"]));
        const durationMinutes = Number.isFinite(rawDur) && rawDur >= 5 ? Math.min(600, rawDur) : null;
        const rawWorked = Number(getField(row, ["Tempo Trabalhado", "Minutos Trabalhados"]));
        const actualSeconds = Number.isFinite(rawWorked) && rawWorked > 0 ? Math.round(Math.min(600, rawWorked) * 60) : 0;
        const status = parseConsultationStatus(getField(row, ["Status", "Situacao"]));
        const paidCents = parseMoneyCell(getField(row, ["Valor Pago", "Pago", "Recebido"]));
        const paidAt = parseDateFlexible(getField(row, ["Data Pagamento", "Pago em"])) ?? date;
        const paymentMethod = str(getField(row, ["Forma de Pagamento", "Pagamento", "Forma"]), 60) || "Pix";
        const consulentePhone = str(getField(row, ["Telefone Consulente", "Telefone", "Celular"]), 40) || null;
        const notes = str(getField(row, ["Observacoes", "Notas"]), 2000) || null;
        parsedConsultas.push({
          date,
          startTime,
          consulenteName,
          consulentePhone,
          methodName,
          priceCents,
          durationMinutes,
          actualSeconds,
          status,
          paidCents,
          paidAt,
          paymentMethod,
          notes,
        });
      } else if (detected === "trabalhos") {
        const date = parseDateFlexible(getField(row, ["Data Inicio", "Data", "Inicio"]));
        const consulenteName = str(getField(row, ["Consulente", "Cliente", "Nome"]), 160);
        const title = str(getField(row, ["Trabalho ou Atividade", "Trabalho", "Magia", "Atividade", "Servico", "Nome"]), 160);
        if (!date || consulenteName.length < 2 || title.length < 2) {
          warnings.push(`Aba ${sheetName}, linha ${lineNum}: informe Data válida, Consulente e o nome do Trabalho/Atividade.`);
          return;
        }
        const endDate = parseDateFlexible(getField(row, ["Data Conclusao", "Conclusao", "Entrega", "Fim"]));
        const rawTime = getField(row, ["Horario", "Hora"]);
        const startTime = rawTime ? parseTimeFlexible(rawTime, "20:00") : null;
        const kind = parseWorkKind(getField(row, ["Tipo"]), title);
        const rawValor = getField(row, ["Valor", "Preco"]);
        const priceCents = rawValor !== undefined ? parseMoneyCell(rawValor) : null;
        const status = parseWorkStatus(getField(row, ["Status", "Situacao"]));
        const paidCents = parseMoneyCell(getField(row, ["Valor Pago", "Pago", "Recebido"]));
        const paidAt = parseDateFlexible(getField(row, ["Data Pagamento", "Pago em"])) ?? date;
        const paymentMethod = str(getField(row, ["Forma de Pagamento", "Pagamento", "Forma"]), 60) || "Pix";
        const consulentePhone = str(getField(row, ["Telefone Consulente", "Telefone", "Celular"]), 40) || null;
        const intention = str(getField(row, ["Intencao ou Foco", "Intencao", "Objetivo", "Foco"]), 1000) || null;
        const materials = str(getField(row, ["Materiais Utilizados", "Materiais", "Elementos"]), 1500) || null;
        const notes = str(getField(row, ["Observacoes", "Notas"]), 2000) || null;
        parsedTrabalhos.push({
          date,
          endDate,
          startTime,
          kind,
          title,
          consulenteName,
          consulentePhone,
          priceCents,
          status,
          paidCents,
          paidAt,
          paymentMethod,
          intention,
          materials,
          notes,
        });
      } else if (detected === "financeiro") {
        const date = parseDateFlexible(getField(row, ["Data"]));
        const description = str(getField(row, ["Descricao", "Historico", "Lancamento"]), 200);
        const amountCents = parseMoneyCell(getField(row, ["Valor"]));
        if (!date || description.length < 2 || amountCents <= 0) {
          warnings.push(`Aba ${sheetName}, linha ${lineNum}: informe Data válida, Descrição e Valor maior que zero.`);
          return;
        }
        const tipoNorm = normalizeName(String(getField(row, ["Tipo"]) ?? "entrada"));
        const type = tipoNorm.includes("despes") || tipoNorm.includes("saida") || tipoNorm.includes("custo") ? "despesa" : "entrada";
        const category = str(getField(row, ["Categoria"]), 80) || (type === "despesa" ? "Materiais de trabalho" : "Outros");
        const paymentMethod = str(getField(row, ["Forma de Pagamento", "Forma", "Pagamento"]), 60) || "Pix";
        const notes = str(getField(row, ["Observacoes", "Notas"]), 1000) || null;
        parsedFinanceiro.push({ date, type, description, amountCents, category, paymentMethod, notes });
      }
    });
  }

  const totalFound =
    parsedConsulentes.length +
    parsedMetodos.length +
    parsedCatalogo.length +
    parsedConsultas.length +
    parsedTrabalhos.length +
    parsedFinanceiro.length;

  if (totalFound === 0) {
    return fail(
      warnings.length
        ? `Nenhum registro válido encontrado. Verifique: ${warnings.slice(0, 3).join(" | ")}`
        : "A planilha não possui linhas preenchidas (lembre-se de remover ou substituir a palavra [EXEMPLO]).",
      400,
      { warnings },
    );
  }

  const summary = {
    consulentes: parsedConsulentes.length,
    metodos: parsedMetodos.length,
    catalogoTrabalhos: parsedCatalogo.length,
    consultas: parsedConsultas.length,
    trabalhos: parsedTrabalhos.length,
    financeiro: parsedFinanceiro.length,
    total: totalFound,
  };

  if (dryRun) {
    return Response.json({
      ok: true,
      dryRun: true,
      summary,
      warnings: warnings.slice(0, 20),
      preview: {
        consulentes: parsedConsulentes.slice(0, 4),
        consultas: parsedConsultas.slice(0, 4),
        trabalhos: parsedTrabalhos.slice(0, 4),
        financeiro: parsedFinanceiro.slice(0, 4),
      },
    });
  }

  // Backup automático de segurança antes da importação da planilha
  const snapshot = await buildSnapshot(tenantId);
  await db.insert(backups).values({
    tenantId,
    payload: snapshot as unknown as Record<string, unknown>,
    counts: snapshot.counts,
    reason: "pre-spreadsheet-import",
  });

  const created = { consulentes: 0, metodos: 0, catalogoTrabalhos: 0, consultas: 0, trabalhos: 0, pagamentos: 0, financeiro: 0 };
  const skipped = { consulentes: 0, metodos: 0, catalogoTrabalhos: 0, consultas: 0, trabalhos: 0, financeiro: 0 };

  const existingConsulentes = await db.select().from(consulentes).where(eq(consulentes.tenantId, tenantId));
  const ensureConsulente = async (
    name: string,
    phone: string | null,
    notes: string | null = null,
    origin: ClientOrigin = "nao_informado",
    createdAt: string | null = null,
  ) => {
    const norm = normalizeName(name);
    const digits = normalizePhone(phone);
    const match = existingConsulentes.find(
      (c) => normalizeName(c.name) === norm || (digits.length >= 8 && normalizePhone(c.phone) === digits),
    );
    if (match) return { row: match, isNew: false };
    const [inserted] = await db
      .insert(consulentes)
      .values({ tenantId, name, phone, notes, origin, ...(createdAt ? { createdAt: new Date(`${createdAt}T12:00:00.000Z`) } : {}) })
      .returning();
    existingConsulentes.push(inserted);
    created.consulentes += 1;
    return { row: inserted, isNew: true };
  };

  for (const item of parsedConsulentes) {
    const res = await ensureConsulente(item.name, item.phone, item.notes, item.origin, item.createdAt);
    if (!res.isNew) skipped.consulentes += 1;
  }

  const existingMethods = await db.select().from(methods).where(eq(methods.tenantId, tenantId));
  const ensureMethod = async (name: string, priceCents = 0, durationMinutes = 60, description: string | null = null, active = true) => {
    const match = existingMethods.find((m) => normalizeName(m.name) === normalizeName(name));
    if (match) return { row: match, isNew: false };
    const [inserted] = await db
      .insert(methods)
      .values({ tenantId, name, priceCents, durationMinutes, description, active })
      .returning();
    existingMethods.push(inserted);
    created.metodos += 1;
    return { row: inserted, isNew: true };
  };

  for (const item of parsedMetodos) {
    const res = await ensureMethod(item.name, item.priceCents, item.durationMinutes, item.description, item.active);
    if (!res.isNew) skipped.metodos += 1;
  }

  const existingCatalog = await db.select().from(workCatalog).where(eq(workCatalog.tenantId, tenantId));
  const ensureCatalog = async (
    name: string,
    kind: WorkKind,
    priceCents = 0,
    cycleDays = kind === "magia" ? 7 : 1,
    durationMinutes = 60,
    materials: string | null = null,
    description: string | null = null,
    active = true,
  ) => {
    const match = existingCatalog.find((c) => normalizeName(c.name) === normalizeName(name));
    if (match) return { row: match, isNew: false };
    const [inserted] = await db
      .insert(workCatalog)
      .values({
        tenantId,
        kind,
        name,
        priceCents,
        cycleDays,
        durationMinutes,
        materials,
        description,
        imageUrl: kind === "atividade" ? "/images/holistic-therapy.jpg" : "/images/spiritual-works.jpg",
        active,
      })
      .returning();
    existingCatalog.push(inserted);
    created.catalogoTrabalhos += 1;
    return { row: inserted, isNew: true };
  };

  for (const item of parsedCatalogo) {
    const res = await ensureCatalog(
      item.name,
      item.kind,
      item.priceCents,
      item.cycleDays,
      item.durationMinutes,
      item.materials,
      item.description,
      item.active,
    );
    if (!res.isNew) skipped.catalogoTrabalhos += 1;
  }

  const existingConsultations = await db.select().from(consultations).where(eq(consultations.tenantId, tenantId));
  for (const item of parsedConsultas) {
    const { row: con } = await ensureConsulente(item.consulenteName, item.consulentePhone);
    const { row: met } = await ensureMethod(item.methodName, item.priceCents ?? 0, item.durationMinutes ?? 60);
    const duplicate = existingConsultations.find(
      (c) => c.consulenteId === con.id && c.date === item.date && c.startTime === item.startTime,
    );
    if (duplicate) {
      skipped.consultas += 1;
      continue;
    }
    const finalPrice = item.priceCents !== null ? item.priceCents : met.priceCents;
    const [inserted] = await db
      .insert(consultations)
      .values({
        tenantId,
        consulenteId: con.id,
        methodId: met.id,
        methodName: met.name,
        methodPriceCents: met.priceCents,
        priceCents: finalPrice,
        date: item.date,
        startTime: item.startTime,
        durationMinutes: item.durationMinutes ?? met.durationMinutes,
        actualSeconds: item.actualSeconds,
        status: item.status,
        paymentStatus: "pendente",
        paymentMethod: item.paymentMethod,
        notes: item.notes,
      })
      .returning();
    existingConsultations.push(inserted);
    created.consultas += 1;

    if (item.paidCents > 0 && item.status !== "cancelada") {
      const amount = Math.min(item.paidCents, finalPrice > 0 ? finalPrice : item.paidCents);
      const [pay] = await db
        .insert(payments)
        .values({
          tenantId,
          consultationId: inserted.id,
          amountCents: amount,
          paidAt: item.paidAt,
          method: item.paymentMethod,
          kind: "pagamento",
          idempotencyKey: `sheet-c-${tenantId}-${inserted.id}`,
        })
        .returning();
      created.pagamentos += 1;
      await db.insert(transactions).values({
        tenantId,
        type: "entrada",
        description: `Pagamento — ${inserted.methodName}`,
        amountCents: amount,
        date: item.paidAt,
        category: "Consultas",
        paymentMethod: item.paymentMethod,
        consultationId: inserted.id,
        paymentId: pay.id,
        reference: `payment:${pay.id}`,
      });
    }
  }

  const existingWorks = await db.select().from(spiritualWorks).where(eq(spiritualWorks.tenantId, tenantId));
  for (const item of parsedTrabalhos) {
    const { row: con } = await ensureConsulente(item.consulenteName, item.consulentePhone);
    const { row: cat } = await ensureCatalog(item.title, item.kind, item.priceCents ?? 0);
    const duplicate = existingWorks.find(
      (w) => w.consulenteId === con.id && w.date === item.date && normalizeName(w.title) === normalizeName(item.title),
    );
    if (duplicate) {
      skipped.trabalhos += 1;
      continue;
    }
    const finalPrice = item.priceCents !== null ? item.priceCents : cat.priceCents;
    const endDate = item.endDate ?? (cat.cycleDays > 1 ? addDaysISO(item.date, cat.cycleDays) : item.date);
    const [inserted] = await db
      .insert(spiritualWorks)
      .values({
        tenantId,
        consulenteId: con.id,
        catalogId: cat.id,
        kind: item.kind,
        title: cat.name,
        catalogPriceCents: cat.priceCents,
        priceCents: finalPrice,
        materialCostCents: 0,
        date: item.date,
        startTime: item.startTime,
        endDate,
        durationMinutes: cat.durationMinutes,
        cycleDays: cat.cycleDays,
        status: item.status,
        paymentStatus: "pendente",
        paymentMethod: item.paymentMethod,
        intention: item.intention,
        materials: item.materials ?? cat.materials,
        imageUrl: cat.imageUrl,
        notes: item.notes,
      })
      .returning();
    existingWorks.push(inserted);
    created.trabalhos += 1;

    if (item.paidCents > 0 && item.status !== "cancelado") {
      const amount = Math.min(item.paidCents, finalPrice > 0 ? finalPrice : item.paidCents);
      const [wpay] = await db
        .insert(workPayments)
        .values({
          tenantId,
          workId: inserted.id,
          amountCents: amount,
          paidAt: item.paidAt,
          method: item.paymentMethod,
          kind: "pagamento",
          idempotencyKey: `sheet-w-${tenantId}-${inserted.id}`,
        })
        .returning();
      created.pagamentos += 1;
      await db.insert(transactions).values({
        tenantId,
        type: "entrada",
        description: `${inserted.kind === "atividade" ? "Atividade" : "Trabalho"} — ${inserted.title}`,
        amountCents: amount,
        date: item.paidAt,
        category: "Trabalhos e terapias",
        paymentMethod: item.paymentMethod,
        workId: inserted.id,
        workPaymentId: wpay.id,
        reference: `work_payment:${wpay.id}`,
      });
    }
  }

  const existingTransactions = await db.select().from(transactions).where(eq(transactions.tenantId, tenantId));
  for (const [idx, item] of parsedFinanceiro.entries()) {
    const duplicate = existingTransactions.find(
      (t) =>
        !t.paymentId &&
        !t.workPaymentId &&
        t.type === item.type &&
        t.date === item.date &&
        t.amountCents === item.amountCents &&
        normalizeName(t.description) === normalizeName(item.description),
    );
    if (duplicate) {
      skipped.financeiro += 1;
      continue;
    }
    const [inserted] = await db
      .insert(transactions)
      .values({
        tenantId,
        type: item.type,
        description: item.description,
        amountCents: item.amountCents,
        date: item.date,
        category: item.category,
        paymentMethod: item.paymentMethod,
        notes: item.notes,
        reference: `sheet-tx:${tenantId}:${item.date}:${idx}:${Date.now()}`,
      })
      .returning();
    existingTransactions.push(inserted);
    created.financeiro += 1;
  }

  await recalcAllPayments(tenantId);
  await logAudit(tenantId, "importar", "planilha", null, { created, skipped });

  return Response.json({
    ok: true,
    dryRun: false,
    created,
    skipped,
    warnings: warnings.slice(0, 20),
    message: "Planilha importada com sucesso! Uma cópia de segurança automática foi salva antes da importação.",
  });
}
