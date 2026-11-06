"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Field, Icon, Modal } from "@/components/ui";
import { formatDateBR, formatStopwatch, liveElapsedSeconds, secondsToWorkedLabel } from "@/lib/format";
import { paidFor } from "@/lib/metrics";
import type { Consultation, WhatsAppTarget } from "@/lib/types";

export function useLiveClock(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

export type FinishedSummary = {
  consultation: Consultation;
  actualSeconds: number;
};

export function ActiveStopwatchBanner({
  onPay,
  onWhatsApp,
  onFinished,
}: {
  onPay: (c: Consultation) => void;
  onWhatsApp: (t: WhatsAppTarget) => void;
  onFinished: (summary: FinishedSummary) => void;
}) {
  const { data, mutate, toast } = useApp();
  const [busy, setBusy] = useState(false);

  const active =
    data.consultations.find((c) => c.timerStartedAt !== null) ??
    data.consultations.find((c) => c.status === "em_atendimento") ??
    null;

  const isRunning = Boolean(active?.timerStartedAt);
  const now = useLiveClock(isRunning);

  if (!active) return null;

  const consulenteName = data.consulentes.find((c) => c.id === active.consulenteId)?.name ?? "Consulente";
  const elapsed = liveElapsedSeconds(active.actualSeconds, active.timerStartedAt, now);

  const runAction = async (action: "start" | "pause" | "finish") => {
    setBusy(true);
    try {
      const res = await mutate(`/api/consultations/${active.id}/timer`, "POST", { action });
      if (action === "pause") {
        toast(`Cronômetro pausado em ${formatStopwatch(elapsed)}.`, "info");
      } else if (action === "start") {
        toast("Cronômetro retomado.", "success");
      } else if (action === "finish") {
        const finalSec = Number(res.actualSeconds ?? elapsed);
        toast(`Consulta finalizada! Tempo trabalhado: ${secondsToWorkedLabel(finalSec)}.`, "success");
        onFinished({ consultation: { ...active, status: "realizada", actualSeconds: finalSec, timerStartedAt: null }, actualSeconds: finalSec });
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="no-print border-b px-3 py-2.5 sm:px-5"
      style={{
        borderColor: "color-mix(in srgb, var(--primary) 45%, var(--border))",
        background: "linear-gradient(120deg, var(--primary-soft), color-mix(in srgb, var(--accent-soft) 75%, var(--surface)))",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: isRunning ? "#1f8a5b" : "#b7791f", color: "#fff" }}
          >
            <Icon name="timer" size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: isRunning ? "#1f8a5b" : "#b7791f" }}>
                {isRunning ? "● Consulta em andamento" : "❚❚ Cronômetro pausado"}
              </span>
              <span className="muted text-xs">· previsto {active.durationMinutes} min</span>
            </div>
            <p className="truncate text-sm font-semibold">
              {consulenteName} <span className="muted font-normal">— {active.methodName}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span
            className="rounded-xl border px-3 py-1.5 font-mono text-base font-bold tabular-nums sm:text-lg"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            aria-live="off"
          >
            {formatStopwatch(elapsed)}
          </span>

          {isRunning ? (
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void runAction("pause")}>
              <Icon name="pause" size={13} /> Pausar
            </button>
          ) : (
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void runAction("start")}>
              <Icon name="play" size={13} /> Retomar
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onWhatsApp({ consulenteId: active.consulenteId, consultation: active, preferredCategory: "inicio" })}
            title="Enviar mensagem no WhatsApp"
          >
            <Icon name="whatsapp" size={14} /> <span className="hidden sm:inline">WhatsApp</span>
          </button>

          <button
            type="button"
            className="btn btn-outline btn-sm hidden md:inline-flex"
            onClick={() => onPay(active)}
            title="Registrar pagamento"
          >
            <Icon name="coins" size={13} /> Pagamento
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void runAction("finish")}
          >
            <Icon name="stop" size={13} /> Finalizar consulta
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConsultationStopwatchInline({
  consultation,
  onFinished,
}: {
  consultation: Consultation;
  onFinished: (summary: FinishedSummary) => void;
}) {
  const { mutate, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const isRunning = Boolean(consultation.timerStartedAt);
  const isPaused = !isRunning && consultation.status === "em_atendimento";
  const now = useLiveClock(isRunning);
  const elapsed = liveElapsedSeconds(consultation.actualSeconds, consultation.timerStartedAt, now);

  if (consultation.status === "cancelada" || consultation.status === "nao_compareceu") {
    return null;
  }

  const runAction = async (action: "start" | "pause" | "finish") => {
    setBusy(true);
    try {
      const res = await mutate(`/api/consultations/${consultation.id}/timer`, "POST", { action });
      if (action === "start") {
        toast("Cronômetro iniciado! Bom atendimento ✨", "success");
      } else if (action === "pause") {
        toast(`Cronômetro pausado em ${formatStopwatch(elapsed)}.`, "info");
      } else if (action === "finish") {
        const finalSec = Number(res.actualSeconds ?? elapsed);
        toast(`Consulta finalizada! Tempo trabalhado: ${secondsToWorkedLabel(finalSec)}.`, "success");
        onFinished({
          consultation: { ...consultation, status: "realizada", actualSeconds: finalSec, timerStartedAt: null },
          actualSeconds: finalSec,
        });
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (isRunning) {
    return (
      <div className="inline-flex flex-wrap items-center gap-1">
        <span className="chip border-emerald-500/40 bg-emerald-500/15 font-mono font-bold tabular-nums text-emerald-600">
          ● {formatStopwatch(elapsed)}
        </span>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void runAction("pause")} title="Pausar cronômetro">
          <Icon name="pause" size={12} />
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void runAction("finish")} title="Finalizar consulta">
          <Icon name="stop" size={12} /> Finalizar
        </button>
      </div>
    );
  }

  if (isPaused) {
    return (
      <div className="inline-flex flex-wrap items-center gap-1">
        <span className="chip border-amber-500/40 bg-amber-500/15 font-mono font-bold tabular-nums text-amber-600">
          ❚❚ {formatStopwatch(elapsed)}
        </span>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void runAction("start")} title="Retomar cronômetro">
          <Icon name="play" size={12} /> Retomar
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void runAction("finish")} title="Finalizar consulta">
          <Icon name="stop" size={12} /> Finalizar
        </button>
      </div>
    );
  }

  if (consultation.status === "realizada") {
    return consultation.actualSeconds > 0 ? (
      <span className="chip" title={`Cronometrado: ${formatStopwatch(consultation.actualSeconds)}`}>
        <Icon name="timer" size={12} /> {secondsToWorkedLabel(consultation.actualSeconds)}
      </span>
    ) : null;
  }

  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      style={{ borderColor: "color-mix(in srgb, #1f8a5b 45%, var(--border))", color: "#1f8a5b" }}
      disabled={busy}
      onClick={() => void runAction("start")}
      title="Iniciar consulta com cronômetro"
    >
      <Icon name="play" size={12} /> Iniciar
    </button>
  );
}

export function FinishedConsultationModal({
  summary,
  onClose,
  onPay,
  onWhatsApp,
}: {
  summary: FinishedSummary | null;
  onClose: () => void;
  onPay: (c: Consultation) => void;
  onWhatsApp: (t: WhatsAppTarget) => void;
}) {
  const { data, money, mutate, toast } = useApp();
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!summary) return;
    setNotes(summary.consultation.notes ?? "");
  }, [summary]);

  if (!summary) return null;

  const current = data.consultations.find((c) => c.id === summary.consultation.id) ?? summary.consultation;
  const consulenteName = data.consulentes.find((c) => c.id === current.consulenteId)?.name ?? "Consulente";
  const paid = paidFor(current.id, data.payments);
  const remaining = Math.max(0, current.priceCents - paid);

  const saveNotesIfChanged = async () => {
    if (notes === (current.notes ?? "")) return;
    setSavingNotes(true);
    try {
      await mutate(`/api/records/consultations/${current.id}`, "PATCH", { notes });
      toast("Anotações da consulta salvas.", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <Modal
      open={Boolean(summary)}
      onClose={() => {
        void saveNotesIfChanged();
        onClose();
      }}
      title="Consulta finalizada ✨"
      subtitle={`${consulenteName} · ${current.methodName} · ${formatDateBR(current.date)}`}
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              void saveNotesIfChanged();
              onClose();
              onWhatsApp({ consulenteId: current.consulenteId, consultation: current, preferredCategory: "pos_consulta" });
            }}
          >
            <Icon name="whatsapp" size={14} /> Enviar pós-consulta no WhatsApp
          </button>
          {remaining > 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void saveNotesIfChanged();
                onClose();
                onPay(current);
              }}
            >
              <Icon name="coins" size={14} /> Registrar pagamento ({money(remaining)})
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-outline"
            disabled={savingNotes}
            onClick={async () => {
              await saveNotesIfChanged();
              onClose();
            }}
          >
            Concluir
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="card-muted flex items-center justify-between gap-3 p-3.5">
          <div>
            <p className="muted text-[0.68rem] font-bold uppercase tracking-wider">Tempo real trabalhado</p>
            <p className="mt-0.5 text-2xl font-bold">{secondsToWorkedLabel(summary.actualSeconds)}</p>
            <p className="muted text-xs">
              Cronômetro: <span className="font-mono">{formatStopwatch(summary.actualSeconds)}</span> · previsto pelo método:{" "}
              {current.durationMinutes} min
            </p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
            <Icon name="timer" size={24} />
          </span>
        </div>

        <p className="muted text-xs leading-snug">
          Este tempo já foi somado automaticamente ao seu indicador de <strong>Horas trabalhadas no mês</strong>. Seguindo as regras de
          integridade, nenhuma entrada financeira foi lançada automaticamente.
        </p>

        <Field label="Anotações da tiragem / observações finais (opcional)">
          <textarea
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Registre cartas principais, conselhos ou pontos importantes desta leitura..."
          />
        </Field>
      </div>
    </Modal>
  );
}
