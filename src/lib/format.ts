import type { ConsultationStatus, CurrencyCode, PaymentStatus, Plan, WorkKind, WorkStatus } from "./types";

export const CURRENCIES: Record<CurrencyCode, { code: CurrencyCode; label: string; symbol: string; locale: string }> = {
  BRL: { code: "BRL", label: "Real brasileiro (R$)", symbol: "R$", locale: "pt-BR" },
  EUR: { code: "EUR", label: "Euro (€)", symbol: "€", locale: "pt-PT" },
  USD: { code: "USD", label: "Dólar americano (US$)", symbol: "US$", locale: "en-US" },
};

export const CURRENCY_OPTIONS: CurrencyCode[] = ["BRL", "EUR", "USD"];

export function formatMoney(cents: number, currency: CurrencyCode = "BRL"): string {
  const meta = CURRENCIES[currency] ?? CURRENCIES.BRL;
  const value = (Number.isFinite(cents) ? cents : 0) / 100;
  try {
    return new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency: meta.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${meta.symbol} ${value.toFixed(2)}`;
  }
}

export function currencySymbol(currency: CurrencyCode = "BRL"): string {
  return CURRENCIES[currency]?.symbol ?? "R$";
}

/** Converte texto digitado (ex.: "1.250,50", "1250.5", "R$ 80") em centavos. */
export function parseMoneyToCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = input
    .toString()
    .replace(/[^\d,.-]/g, "")
    .trim();
  if (!cleaned) return 0;
  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = cleaned.split(".");
    if (parts.length > 2) normalized = parts.join("");
  }
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Texto editável para inputs (sem símbolo). */
export function centsToInput(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return value.toFixed(2).replace(".", ",");
}

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDaysISO(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function addMonthsISO(iso: string, months: number): string {
  const d = fromISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toISO(d);
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const clean = iso.slice(0, 10);
  const [y, m, d] = clean.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatDateTimeBR(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return formatDateBR(value);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(
    d.getHours(),
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function monthKey(isoOrDate: string | Date = new Date()): string {
  if (typeof isoOrDate === "string") return isoOrDate.slice(0, 7);
  return `${isoOrDate.getFullYear()}-${`${isoOrDate.getMonth() + 1}`.padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function monthLabel(key: string): string {
  if (!key || key.length < 7) return key;
  const [y, m] = key.split("-");
  const idx = Number(m) - 1;
  return `${MONTH_NAMES[idx] ?? m}/${y}`;
}

export function monthShort(key: string): string {
  if (!key || key.length < 7) return key;
  const [, m] = key.split("-");
  const idx = Number(m) - 1;
  return (MONTH_NAMES[idx] ?? m).slice(0, 3);
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toISO(start), end: toISO(end) };
}

export function periodRangeFromMonthsAgo(months: number, base = new Date()): { start: string; end: string; label: string } {
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const start = new Date(base.getFullYear(), base.getMonth() - (months - 1), 1);
  return {
    start: toISO(start),
    end: toISO(end),
    label: `${formatDateBR(toISO(start))} a ${formatDateBR(toISO(end))}`,
  };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function hoursLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}h${m ? ` ${String(m).padStart(2, "0")}min` : ""}`;
}

export function liveElapsedSeconds(
  actualSeconds: number | null | undefined,
  timerStartedAt: string | null | undefined,
  nowMs = Date.now(),
): number {
  const base = Math.max(0, Math.trunc(actualSeconds ?? 0));
  if (!timerStartedAt) return base;
  const startedMs = Date.parse(timerStartedAt);
  if (Number.isNaN(startedMs)) return base;
  return base + Math.max(0, Math.floor((nowMs - startedMs) / 1000));
}

export function formatStopwatch(totalSeconds: number): string {
  const safe = Math.max(0, Math.trunc(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function secondsToWorkedLabel(totalSeconds: number): string {
  const safe = Math.max(0, Math.trunc(totalSeconds));
  if (safe === 0) return "0min";
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h${m > 0 ? ` ${String(m).padStart(2, "0")}min` : ""}`;
  if (m > 0) return `${m}min${s > 0 ? ` ${String(s).padStart(2, "0")}s` : ""}`;
  return `${s}s`;
}

export function uid(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export const CONSULTATION_STATUS: Record<ConsultationStatus, { label: string; tone: string }> = {
  agendada: { label: "Agendada", tone: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  confirmada: { label: "Confirmada", tone: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" },
  em_atendimento: { label: "Em atendimento", tone: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  realizada: { label: "Realizada", tone: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  cancelada: { label: "Cancelada", tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  nao_compareceu: { label: "Não compareceu", tone: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
};

export const WORK_KIND: Record<WorkKind, { label: string; short: string; tone: string }> = {
  magia: { label: "Trabalho espiritual / Magia", short: "Magia / Trabalho", tone: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  atividade: { label: "Atividade / Terapia", short: "Atividade / Terapia", tone: "bg-teal-500/15 text-teal-600 border-teal-500/30" },
};

export const WORK_STATUS: Record<WorkStatus, { label: string; tone: string }> = {
  planejado: { label: "Planejado", tone: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  em_andamento: { label: "Em andamento", tone: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  concluido: { label: "Concluído", tone: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  cancelado: { label: "Cancelado", tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

export const APP_IMAGE_PRESETS = [
  { src: "/images/tarot-hero.jpg", label: "Mesa ritual" },
  { src: "/images/tarot-cards.jpg", label: "Cartas douradas" },
  { src: "/images/tarot-crystal.jpg", label: "Cristal e lua" },
  { src: "/images/spiritual-works.jpg", label: "Velas e magias" },
  { src: "/images/holistic-therapy.jpg", label: "Reiki e terapias" },
] as const;

export function parseDateFlexible(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return toISO(raw);
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 20000 && raw < 90000) {
    // Número serial de data do Excel (base 1899-12-30)
    const utcMs = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(utcMs);
    const y = d.getUTCFullYear();
    const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${d.getUTCDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const text = String(raw).trim();
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const candidate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const dt = new Date(`${candidate}T12:00:00`);
    return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === candidate ? candidate : null;
  }
  const brMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (brMatch) {
    const [, d, m, yRaw] = brMatch;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const candidate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const dt = new Date(`${candidate}T12:00:00`);
    return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === candidate ? candidate : null;
  }
  return null;
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: string }> = {
  pendente: { label: "Pendente", tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  parcial: { label: "Parcial", tone: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  pago: { label: "Pago", tone: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
};

export const PLAN_LABEL: Record<Plan, string> = {
  monthly: "Mensal",
  annual: "Anual",
  lifetime: "Vitalício",
};

export const PAYMENT_METHOD_OPTIONS = ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Transferência", "Outro"];

export const REMINDER_LABEL = {
  d24: "24 horas antes",
  h1: "1 hora antes",
  day: "No dia da consulta",
} as const;

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function daysBetween(fromISOdate: string, toISOdate: string): number {
  const a = fromISO(fromISOdate).getTime();
  const b = fromISO(toISOdate).getTime();
  return Math.round((b - a) / 86400000);
}
