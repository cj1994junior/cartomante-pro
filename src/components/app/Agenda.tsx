"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { buildReminders } from "@/components/app/reminders";
import { ConsultationStopwatchInline, type FinishedSummary } from "@/components/app/StopwatchControls";
import { EmptyState, Icon, SectionTitle, cx } from "@/components/ui";
import { CONSULTATION_STATUS, addDaysISO, formatDateBR, monthKey, monthLabel, toISO, todayISO } from "@/lib/format";
import type { Consultation, WhatsAppTarget } from "@/lib/types";

type AgendaView = "dia" | "semana" | "mes";

export function Agenda({
  onNew,
  onEdit,
  onPay,
  onWhatsApp,
  onFinished,
}: {
  onNew: () => void;
  onEdit: (c: Consultation) => void;
  onPay: (c: Consultation) => void;
  onWhatsApp: (target: WhatsAppTarget) => void;
  onFinished: (summary: FinishedSummary) => void;
}) {
  const { data, money } = useApp();
  const [view, setView] = useState<AgendaView>("semana");
  const [date, setDate] = useState(todayISO());
  const [month, setMonth] = useState(monthKey());
  const nameById = useMemo(() => new Map(data.consulentes.map((c) => [c.id, c.name])), [data.consulentes]);
  const byDate = useMemo(() => {
    const map = new Map<string, Consultation[]>();
    for (const c of data.consultations) {
      const list = map.get(c.date) ?? [];
      list.push(c);
      map.set(c.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [data.consultations]);

  const reminders = useMemo(() => buildReminders(data), [data]);
  const nextReminders = reminders.filter((r) => r.fireAt.getTime() > Date.now()).slice(0, 10);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );

  const requestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const navigate = (delta: number) => {
    if (view === "dia") setDate(addDaysISO(date, delta));
    else if (view === "semana") setDate(addDaysISO(date, delta * 7));
    else {
      const [y, m] = month.split("-").map(Number);
      setMonth(monthKey(new Date(y, m - 1 + delta, 1)));
    }
  };

  const weekStart = (() => {
    const d = new Date(`${date}T12:00:00`);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return toISO(start);
  })();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));

  const renderItem = (consultation: Consultation) => (
    <li key={consultation.id} className="card-muted p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{nameById.get(consultation.consulenteId) ?? "Consulente"}</p>
          <p className="muted text-[0.72rem]">
            {consultation.startTime} · {consultation.methodName} · {consultation.durationMinutes} min
          </p>
        </div>
        <div className="text-right">
          <span className={cx("chip", CONSULTATION_STATUS[consultation.status].tone)}>{CONSULTATION_STATUS[consultation.status].label}</span>
          <p className="mt-1 text-xs font-semibold">{money(consultation.priceCents)}</p>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <ConsultationStopwatchInline consultation={consultation} onFinished={onFinished} />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ borderColor: "color-mix(in srgb, #1f8a4c 40%, var(--border))", color: "#1f8a4c" }}
          onClick={() => onWhatsApp({ consulenteId: consultation.consulenteId, consultation, preferredCategory: "lembrete" })}
        >
          <Icon name="whatsapp" size={12} /> WhatsApp
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(consultation)}>
          <Icon name="edit" size={12} /> Editar
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onPay(consultation)}>
          <Icon name="coins" size={12} /> Pagamento
        </button>
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="heading text-lg font-semibold">Agenda</h2>
          <p className="muted text-xs">Integrada às consultas — cada alteração de data ou horário reprograma os lembretes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
            {(["dia", "semana", "mes"] as AgendaView[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cx("px-2.5 py-1.5 text-xs font-semibold capitalize", view === mode && "nav-link-active")}
                style={{ color: view === mode ? "var(--text)" : "var(--muted)" }}
              >
                {mode === "mes" ? "Mês" : mode === "dia" ? "Dia" : "Semana"}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
            <Icon name="plus" size={14} /> Agendar
          </button>
        </div>
      </div>

      <section className="card p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(-1)} aria-label="Anterior">
              <Icon name="left" size={14} />
            </button>
            <p className="min-w-[9rem] text-center text-sm font-semibold">
              {view === "mes" ? monthLabel(month) : view === "dia" ? formatDateBR(date) : `${formatDateBR(weekStart)} – ${formatDateBR(addDaysISO(weekStart, 6))}`}
            </p>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(1)} aria-label="Próximo">
              <Icon name="right" size={14} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDate(todayISO());
                setMonth(monthKey());
              }}
            >
              Hoje
            </button>
          </div>
          <span className="chip">
            {data.consultations.filter((c) => (view === "dia" ? c.date === date : view === "semana" ? weekDays.includes(c.date) : monthKey(c.date) === month)).length} consulta(s)
          </span>
        </div>

        {view === "dia" ? (
          <div className="space-y-2">
            <p className="muted text-xs">{formatDateBR(date)}</p>
            {(byDate.get(date) ?? []).length ? (
              <ul className="space-y-2">{(byDate.get(date) ?? []).map(renderItem)}</ul>
            ) : (
              <EmptyState icon="calendar" title="Dia livre" message="Nenhuma consulta agendada para este dia." action={<button type="button" className="btn btn-primary btn-sm" onClick={onNew}>Agendar consulta</button>} />
            )}
          </div>
        ) : null}

        {view === "semana" ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {weekDays.map((day) => {
              const items = byDate.get(day) ?? [];
              const isToday = day === todayISO();
              return (
                <div
                  key={day}
                  className="rounded-xl border p-2"
                  style={{ borderColor: isToday ? "var(--primary)" : "var(--border)", background: isToday ? "var(--primary-soft)" : "transparent" }}
                >
                  <p className="mb-1 text-[0.68rem] font-bold uppercase" style={{ color: isToday ? "var(--text)" : "var(--muted)" }}>
                    {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" })} {day.slice(-2)}/{day.slice(5, 7)}
                  </p>
                  {items.length ? (
                    <ul className="space-y-1.5">
                      {items.map((item) => (
                        <li key={item.id}>
                          <button type="button" className="w-full rounded-lg p-1.5 text-left text-[0.68rem]" style={{ background: "color-mix(in srgb, var(--raised) 75%, transparent)" }} onClick={() => onEdit(item)}>
                            <span className="font-semibold">{item.startTime}</span> {nameById.get(item.consulenteId) ?? ""}
                            <span className="muted block truncate">{item.methodName}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted text-[0.62rem]">Livre</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        {view === "mes" ? <MonthGrid month={month} byDate={byDate} onSelect={onEdit} /> : null}
      </section>

      <section className="card p-4">
        <SectionTitle title="Lembretes automáticos" subtitle="24 horas antes · 1 hora antes · no dia da consulta" icon="bell" />
        <div className="grid gap-3 sm:grid-cols-[1fr_1.1fr]">
          <div className="space-y-2 text-xs">
            <p className="card-muted p-2">
              <strong>Status das notificações:</strong>{" "}
              {permission === "granted"
                ? "permitidas neste dispositivo."
                : permission === "denied"
                  ? "bloqueadas pelo navegador — reative nas permissões do site."
                  : permission === "unsupported"
                    ? "este navegador não suporta notificações do sistema."
                    : "ainda não solicitadas."}
            </p>
            {permission !== "granted" && permission !== "unsupported" ? (
              <button type="button" className="btn btn-primary btn-sm w-full" onClick={() => void requestPermission()}>
                <Icon name="bell" size={14} /> Permitir notificações
              </button>
            ) : null}
            <p className="muted leading-snug">
              Os lembretes são locais: o app calcula os horários a partir desta agenda e exibe a notificação quando o app/navegador estiver aberto
              (ou instalado e permitido pela plataforma). Navegadores móveis não enviam notificações com o app totalmente fechado — use o painel de
              lembretes e a agenda como apoio. Cancelamentos removem avisos e reagendamentos geram novos horários; não há duplicidade.
            </p>
            <p className="muted leading-snug">
              Horário do lembrete do dia: <strong>{data.settings.reminderDayTime}</strong> (ajustável em Configurações). Se a consulta for antes
              desse horário, o aviso é antecipado.
            </p>
          </div>
          <div>
            <p className="muted mb-1 text-[0.7rem] font-semibold uppercase">Próximos lembretes</p>
            {nextReminders.length ? (
              <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {nextReminders.map((reminder) => (
                  <li key={reminder.key} className="card-muted flex flex-wrap items-center justify-between gap-2 p-2 text-xs">
                    <div>
                      <p className="font-semibold">{reminder.consulenteName}</p>
                      <p className="muted">
                        {formatDateBR(reminder.date)} · {reminder.startTime} · {reminder.methodName}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="chip">{reminder.label}</span>
                      <p className="muted mt-0.5 text-[0.65rem]">
                        {reminder.fireAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-xs">Nenhum lembrete programado. Lembretes só são criados para consultas agendadas ou confirmadas.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MonthGrid({ month, byDate, onSelect }: { month: string; byDate: Map<string, Consultation[]>; onSelect: (c: Consultation) => void }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const cells: (string | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: new Date(year, monthNumber, 0).getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  return (
    <div className="grid grid-cols-7 gap-1">
      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
        <div key={d} className="muted pb-1 text-center text-[0.62rem] font-bold uppercase">
          {d}
        </div>
      ))}
      {cells.map((date, index) => {
        if (!date) return <div key={`e${index}`} className="min-h-[3.6rem] rounded-lg" />;
        const items = byDate.get(date) ?? [];
        const isToday = date === todayISO();
        return (
          <div
            key={date}
            className="min-h-[3.6rem] rounded-lg border p-1"
            style={{ borderColor: isToday ? "var(--primary)" : "var(--border)", background: isToday ? "var(--primary-soft)" : "transparent" }}
          >
            <p className="text-[0.65rem] font-bold">{Number(date.slice(-2))}</p>
            <div className="space-y-0.5">
              {items.slice(0, 2).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="block w-full truncate rounded px-0.5 text-left text-[0.58rem]"
                  style={{ background: "color-mix(in srgb, var(--primary) 18%, transparent)" }}
                  onClick={() => onSelect(item)}
                >
                  {item.startTime}
                </button>
              ))}
              {items.length > 2 ? <p className="muted text-[0.55rem]">+{items.length - 2}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
