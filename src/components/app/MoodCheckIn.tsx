"use client";

import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Icon, Modal } from "@/components/ui";
import { formatDateBR, todayISO } from "@/lib/format";
import { MOOD_OPTIONS } from "@/lib/moods";
import type { Mood } from "@/lib/types";

/** Um registro por dia, persistido nas configurações privadas da conta. */
export function MoodCheckIn() {
  const { data, mutate, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Mood | null>(null);
  const [saving, setSaving] = useState(false);
  const today = todayISO();
  const savedEntry = data.settings.dailyMood;
  const savedMood = savedEntry?.date === today ? savedEntry.mood : null;
  const savedOption = MOOD_OPTIONS.find((option) => option.value === savedMood);

  const openCheckIn = () => {
    const entry = data.settings.dailyMood;
    setSelected(entry?.date === todayISO() ? entry.mood : null);
    setOpen(true);
  };

  const saveMood = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await mutate("/api/settings", "PATCH", {
        dailyMood: { date: todayISO(), mood: selected },
      });
      setOpen(false);
      toast("Seu humor de hoje foi salvo.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível salvar seu humor. Tente novamente.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={openCheckIn}
        aria-haspopup="dialog"
        className="group inline-flex max-w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:brightness-105"
        style={{
          borderColor: "color-mix(in srgb, var(--primary) 45%, var(--border))",
          background: "color-mix(in srgb, var(--primary-soft) 60%, var(--surface))",
          color: "var(--text)",
        }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--surface)", color: "var(--primary)" }}
        >
          <Icon name="heart" size={17} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Como você está hoje?</span>
          <span className="muted block text-[0.7rem]">
            {savedOption ? `Hoje: ${savedOption.label} · toque para alterar` : "Um momento para cuidar de você"}
          </span>
        </span>
        {savedOption ? <span className="ml-1 text-xl" aria-hidden="true">{savedOption.emoji}</span> : null}
        <Icon name="right" size={15} className="muted ml-1 shrink-0" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Como você está hoje?"
        subtitle={`Escolha o emoji que mais representa seu humor em ${formatDateBR(today)}.`}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void saveMood()} disabled={!selected || saving}>
              <Icon name="check" size={15} /> {saving ? "Salvando..." : "Salvar humor"}
            </button>
          </>
        }
      >
        <p className="muted mb-4 text-sm leading-relaxed">
          Reserve um instante para você. Não existe resposta certa: escolha como está se sentindo agora.
        </p>
        <fieldset>
          <legend className="sr-only">Selecione seu humor de hoje</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {MOOD_OPTIONS.map((option) => {
              const isSelected = selected === option.value;
              return (
                <label
                  key={option.value}
                  className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center transition hover:brightness-105 focus-within:outline-2 focus-within:outline-offset-2"
                  style={{
                    borderColor: isSelected ? "var(--primary)" : "var(--border)",
                    background: isSelected ? "var(--primary-soft)" : "var(--raised)",
                    outlineColor: "var(--primary)",
                  }}
                >
                  <input
                    type="radio"
                    name="daily-mood"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => setSelected(option.value)}
                    className="sr-only"
                  />
                  {isSelected ? (
                    <span
                      className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ background: "var(--primary)", color: "var(--primary-ink)" }}
                    >
                      <Icon name="check" size={12} />
                    </span>
                  ) : null}
                  <span aria-hidden="true" className="text-3xl leading-none">{option.emoji}</span>
                  <span className="text-xs font-semibold leading-tight">{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <p className="muted mt-4 text-xs leading-relaxed">
          Sua escolha fica salva na sua conta. Você pode alterá-la ao longo do dia.
        </p>
      </Modal>
    </div>
  );
}
