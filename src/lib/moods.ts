import type { Mood } from "@/lib/types";

/** Opções de humor disponíveis no check-in diário. */
export const MOOD_OPTIONS: { value: Mood; emoji: string; label: string }[] = [
  { value: "triste", emoji: "😢", label: "Triste" },
  { value: "alegre", emoji: "😊", label: "Alegre" },
  { value: "cansado_desanimado", emoji: "😮‍💨", label: "Cansado/desanimado" },
  { value: "radiante", emoji: "🤩", label: "Radiante" },
  { value: "doente", emoji: "🤒", label: "Doente" },
];

export function isMood(value: unknown): value is Mood {
  return typeof value === "string" && MOOD_OPTIONS.some((option) => option.value === value);
}
