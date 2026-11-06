import type { ClientOrigin, Consulente } from "./types";

export const CLIENT_ORIGIN_OPTIONS: { value: ClientOrigin; label: string; color: string }[] = [
  { value: "nao_informado", label: "Não informado", color: "var(--muted)" },
  { value: "indicacao", label: "Indicação", color: "#b58935" },
  { value: "whatsapp", label: "WhatsApp", color: "#278b62" },
  { value: "instagram", label: "Instagram", color: "#b55888" },
  { value: "facebook", label: "Facebook", color: "#5682cb" },
  { value: "outro", label: "Outro", color: "#8970b7" },
];

export function isClientOrigin(value: unknown): value is ClientOrigin {
  return typeof value === "string" && CLIENT_ORIGIN_OPTIONS.some((option) => option.value === value);
}

export function clientOriginLabel(value: unknown): string {
  return CLIENT_ORIGIN_OPTIONS.find((option) => option.value === value)?.label ?? "Não informado";
}

/** Interpreta os rótulos da planilha sem transformar ausência de origem em informação fictícia. */
export function parseClientOrigin(value: unknown): ClientOrigin {
  if (typeof value !== "string" || !value.trim()) return "nao_informado";
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized || ["nao informado", "nao informada", "nao sei", "desconhecido"].includes(normalized)) return "nao_informado";
  if (["indicacao", "indicado", "indicada", "recomendacao"].includes(normalized)) return "indicacao";
  if (["whatsapp", "whats app", "whats", "wpp", "zap"].includes(normalized)) return "whatsapp";
  if (["instagram", "insta"].includes(normalized)) return "instagram";
  if (["facebook", "face", "fb"].includes(normalized)) return "facebook";
  return "outro";
}

export type OriginReport = {
  total: number;
  informed: number;
  uninformed: number;
  rows: { value: ClientOrigin; label: string; color: string; count: number; percentage: number }[];
  leaders: { value: ClientOrigin; label: string; count: number }[];
};

/** Cada cadastro é contado uma única vez; origem desconhecida nunca vence como canal. */
export function summarizeClientOrigins(consulentes: ReadonlyArray<Pick<Consulente, "origin">>): OriginReport {
  const counts = new Map<ClientOrigin, number>(CLIENT_ORIGIN_OPTIONS.map((option) => [option.value, 0]));
  for (const consulente of consulentes) {
    const origin = isClientOrigin(consulente.origin) ? consulente.origin : "nao_informado";
    counts.set(origin, (counts.get(origin) ?? 0) + 1);
  }
  const total = consulentes.length;
  const uninformed = counts.get("nao_informado") ?? 0;
  const rows = CLIENT_ORIGIN_OPTIONS.map((option) => {
    const count = counts.get(option.value) ?? 0;
    return { ...option, count, percentage: total ? (count / total) * 100 : 0 };
  });
  const knownRows = rows.filter((row) => row.value !== "nao_informado");
  const maxCount = Math.max(0, ...knownRows.map((row) => row.count));
  const leaders = maxCount > 0
    ? knownRows.filter((row) => row.count === maxCount).map(({ value, label, count }) => ({ value, label, count }))
    : [];
  return { total, informed: total - uninformed, uninformed, rows, leaders };
}
