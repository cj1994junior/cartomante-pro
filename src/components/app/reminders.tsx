"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Icon, cx } from "@/components/ui";
import { formatDateBR, timeToMinutes, todayISO } from "@/lib/format";
import type { DataBundle } from "@/lib/types";

export type ReminderKind = "d24" | "h1" | "day";

export type Reminder = {
  key: string;
  consultationId: number;
  kind: ReminderKind;
  label: string;
  consulenteName: string;
  methodName: string;
  date: string;
  startTime: string;
  fireAt: Date;
};

const KIND_LABEL: Record<ReminderKind, string> = {
  d24: "24 horas antes",
  h1: "1 hora antes",
  day: "No dia da consulta",
};

function consultationDate(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const minutes = timeToMinutes(time);
  return new Date(y, (m ?? 1) - 1, d ?? 1, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

/** Calcula os lembretes reais de cada consulta a partir das configurações da profissional. */
export function buildReminders(data: DataBundle): Reminder[] {
  const { settings, consultations, consulentes } = data;
  const names = new Map(consulentes.map((c) => [c.id, c.name]));
  const now = Date.now();
  const list: Reminder[] = [];

  for (const consultation of consultations) {
    if (consultation.status !== "agendada" && consultation.status !== "confirmada") continue;
    const start = consultationDate(consultation.date, consultation.startTime);
    if (Number.isNaN(start.getTime())) continue;
    const base = {
      consultationId: consultation.id,
      consulenteName: names.get(consultation.consulenteId) ?? "Consulente",
      methodName: consultation.methodName,
      date: consultation.date,
      startTime: consultation.startTime,
    };

    if (settings.reminder24h) {
      const fireAt = new Date(start.getTime() - 24 * 3600000);
      list.push({ ...base, key: `c${consultation.id}-${consultation.date}-${consultation.startTime}-d24`, kind: "d24", label: KIND_LABEL.d24, fireAt });
    }
    if (settings.reminder1h) {
      const fireAt = new Date(start.getTime() - 3600000);
      list.push({ ...base, key: `c${consultation.id}-${consultation.date}-${consultation.startTime}-h1`, kind: "h1", label: KIND_LABEL.h1, fireAt });
    }
    if (settings.reminderDay) {
      const [h, m] = settings.reminderDayTime.split(":").map(Number);
      const configured = (h || 8) * 60 + (m || 0);
      const startMinutes = timeToMinutes(consultation.startTime);
      const dayMinutes = Math.min(configured, Math.max(0, startMinutes - 90));
      const fireAt = new Date(start.getFullYear(), start.getMonth(), start.getDate(), Math.floor(dayMinutes / 60), dayMinutes % 60);
      list.push({ ...base, key: `c${consultation.id}-${consultation.date}-${consultation.startTime}-day`, kind: "day", label: KIND_LABEL.day, fireAt });
    }
  }

  return list
    .filter((item) => item.fireAt.getTime() > now - 7 * 24 * 3600000)
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

const FIRED_KEY = "cartomante-pro:reminders-fired:v1";

function readFired(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(FIRED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeFired(map: Record<string, number>) {
  try {
    const cutoff = Date.now() - 30 * 86400000;
    const pruned = Object.fromEntries(Object.entries(map).filter(([, ts]) => ts > cutoff));
    window.localStorage.setItem(FIRED_KEY, JSON.stringify(pruned));
  } catch {
    /* ignora falha de armazenamento */
  }
}

export function useReminderEngine() {
  const { data, toast } = useApp();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [fired, setFired] = useState<Record<string, number>>({});
  const [supported, setSupported] = useState(true);
  const timer = useRef<number | null>(null);

  const reminders = useMemo(() => buildReminders(data), [data]);
  const today = todayISO();
  const pending = reminders.filter((r) => r.fireAt.getTime() > Date.now()).slice(0, 8);
  const dueToday = reminders.filter((r) => r.fireAt.getTime() <= Date.now() && r.fireAt.getTime() > Date.now() - 86400000);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setSupported(false);
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    setFired(readFired());
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast("Este navegador não oferece notificações locais. Use o painel de lembretes dentro do app.", "error");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        new Notification("Cartomante Pro", { body: "Lembretes locais ativados neste dispositivo.", icon: "/icon.svg" });
        toast("Notificações locais ativadas.", "success");
      } else {
        toast("Permissão não concedida. Os lembretes continuam visíveis na Agenda.", "info");
      }
    } catch {
      toast("Não foi possível solicitar permissão neste navegador.", "error");
    }
  }, [toast]);

  const fire = useCallback(() => {
    const now = Date.now();
    const map = readFired();
    let changed = false;
    const fresh = buildReminders(data).filter((reminder) => {
      const diff = now - reminder.fireAt.getTime();
      return diff >= 0 && diff < 15 * 60000 && !map[reminder.key];
    });
    for (const reminder of fresh) {
      if (supported && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(`${reminder.label} — consulta`, {
            body: `${reminder.consulenteName} · ${formatDateBR(reminder.date)} às ${reminder.startTime} · ${reminder.methodName}`,
            icon: "/icon.svg",
            tag: reminder.key,
          });
        } catch {
          /* alguns navegadores móveis exigem service worker — o lembrete continua no app */
        }
      }
      map[reminder.key] = now;
      changed = true;
    }
    if (changed) {
      writeFired(map);
      setFired({ ...map });
    }
  }, [data, supported]);

  useEffect(() => {
    fire();
    timer.current = window.setInterval(fire, 30000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [fire]);

  return { permission, requestPermission, pending, dueToday, reminders, supported, fired, today };
}

export function ReminderBell() {
  const engine = useReminderEngine();
  const [open, setOpen] = useState(false);
  const soon = engine.reminders.filter(
    (r) => r.fireAt.getTime() > Date.now() - 12 * 3600000 && r.fireAt.getTime() < Date.now() + 2 * 86400000,
  );

  return (
    <div className="relative">
      <button
        type="button"
        className="btn btn-outline btn-sm relative"
        onClick={() => setOpen((v) => !v)}
        aria-label="Lembretes de consultas"
      >
        <Icon name="bell" size={16} />
        <span>Lembretes</span>
        {soon.length ? (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-bold"
            style={{ background: "var(--primary)", color: "var(--primary-ink)" }}
          >
            {soon.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="card absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] p-3"
          style={{ background: "var(--surface)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Lembretes locais</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Fechar">
              <Icon name="x" size={15} />
            </button>
          </div>
          <p className="muted mt-1 text-[0.7rem] leading-snug">
            {engine.permission === "granted"
              ? "Notificações do sistema permitidas neste dispositivo."
              : engine.permission === "unsupported"
                ? "Este navegador não suporta notificações do sistema. Os lembretes ficam nesta lista e na Agenda."
                : "Permita notificações para receber os avisos de 24h, 1h e no dia."}
          </p>
          {engine.permission !== "granted" && engine.supported ? (
            <button type="button" className="btn btn-primary btn-sm mt-2 w-full" onClick={() => void engine.requestPermission()}>
              <Icon name="bell" size={14} /> Ativar notificações
            </button>
          ) : null}
          <div className="divider my-2" />
          {soon.length ? (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {soon.map((reminder) => (
                <li key={reminder.key} className="card-muted p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{reminder.consulenteName}</span>
                    <span className="chip">{reminder.label}</span>
                  </div>
                  <p className="muted mt-1">
                    {formatDateBR(reminder.date)} às {reminder.startTime} · {reminder.methodName}
                  </p>
                  <p className="muted mt-0.5 text-[0.68rem]">
                    Aviso programado para {reminder.fireAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted py-3 text-center text-xs">Nenhum lembrete nos próximos dias.</p>
          )}
          <p className="muted mt-2 border-t pt-2 text-[0.66rem] leading-snug" style={{ borderColor: "var(--border)" }}>
            Notificações são geradas pelo próprio dispositivo e exigem o app/navegador aberto ou instalado. Consultas canceladas não geram
            avisos e o reagendamento cria novos horários automaticamente.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ReminderSettingsPreview({ className }: { className?: string }) {
  const { data } = useApp();
  const reminders = useMemo(() => buildReminders(data), [data]);
  const next = reminders.filter((r) => r.fireAt.getTime() > Date.now()).slice(0, 5);
  return (
    <div className={cx("space-y-2", className)}>
      {next.length ? (
        next.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium">{r.consulenteName}</span>
            <span className="muted">
              {r.label} · {formatDateBR(r.date)} {r.startTime}
            </span>
          </div>
        ))
      ) : (
        <p className="muted text-xs">Nenhum lembrete programado. Crie uma consulta agendada para testar.</p>
      )}
    </div>
  );
}
