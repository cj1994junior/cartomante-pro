"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ConsultationStopwatchInline, type FinishedSummary } from "@/components/app/StopwatchControls";
import { ConfirmDialog, EmptyState, Field, Icon, Modal, SectionTitle, StatCard, cx } from "@/components/ui";
import {
  CONSULTATION_STATUS,
  PAYMENT_STATUS,
  formatDateBR,
  formatStopwatch,
  hoursLabel,
  monthKey,
  monthLabel,
  secondsToWorkedLabel,
  timeToMinutes,
  todayISO,
} from "@/lib/format";
import { paidFor } from "@/lib/metrics";
import type { Consultation, WhatsAppTarget } from "@/lib/types";

type ViewMode = "lista" | "calendario";

export function Consultas({
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
  const { data, money, mutate, toast } = useApp();
  const [view, setView] = useState<ViewMode>("lista");
  const [search, setSearch] = useState("");
  const [day, setDay] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [methodId, setMethodId] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [detail, setDetail] = useState<Consultation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Consultation | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Consultation | null>(null);
  const [hoursMonth, setHoursMonth] = useState(monthKey());
  const [calendarMonth, setCalendarMonth] = useState(monthKey());

  const nameById = useMemo(() => new Map(data.consulentes.map((c) => [c.id, c.name])), [data.consulentes]);

  const filtered = useMemo(() => {
    return data.consultations
      .filter((c) => {
        const name = nameById.get(c.consulenteId) ?? "";
        if (search && !name.toLowerCase().includes(search.toLowerCase()) && !c.methodName.toLowerCase().includes(search.toLowerCase())) return false;
        if (day && c.date !== day) return false;
        if (from && c.date < from) return false;
        if (to && c.date > to) return false;
        if (methodId && String(c.methodId) !== methodId) return false;
        if (status && c.status !== status) return false;
        if (paymentStatus && c.paymentStatus !== paymentStatus) return false;
        return true;
      })
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
  }, [data.consultations, search, day, from, to, methodId, status, paymentStatus, nameById]);

  const hoursStats = useMemo(() => {
    const realized = data.consultations.filter((c) => c.status === "realizada" && monthKey(c.date) === hoursMonth);
    const timed = realized.filter((c) => (c.actualSeconds ?? 0) > 0);
    const totalSeconds = timed.reduce((acc, c) => acc + (c.actualSeconds ?? 0), 0);
    const estimatedMinutes = realized.reduce((acc, c) => acc + c.durationMinutes, 0);
    const byMethod = new Map<string, number>();
    for (const c of timed) byMethod.set(c.methodName, (byMethod.get(c.methodName) ?? 0) + (c.actualSeconds ?? 0));
    const avgSeconds = timed.length ? Math.round(totalSeconds / timed.length) : 0;
    return { totalSeconds, estimatedMinutes, count: realized.length, timedCount: timed.length, byMethod, avgSeconds };
  }, [data.consultations, hoursMonth]);

  const activeDetail = detail ? data.consultations.find((c) => c.id === detail.id) ?? detail : null;

  const months = useMemo(() => {
    const set = new Set<string>([monthKey()]);
    for (let i = 1; i <= 11; i += 1) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      set.add(monthKey(d));
    }
    for (const c of data.consultations) set.add(monthKey(c.date));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [data.consultations]);

  const changeStatus = async (consultation: Consultation, next: Consultation["status"]) => {
    try {
      await mutate(`/api/records/consultations/${consultation.id}`, "PATCH", { status: next });
      toast(
        next === "cancelada"
          ? "Consulta cancelada. Os lembretes desta consulta não serão enviados."
          : next === "realizada"
            ? "Atendimento registrado. Registre o pagamento para lançar a entrada financeira."
            : "Status atualizado.",
        "success",
      );
    } catch (error) {
      toast((error as Error).message, "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await mutate(`/api/records/consultations/${deleteTarget.id}`, "DELETE");
      toast("Consulta excluída e lembretes cancelados.", "success");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setDay("");
    setFrom("");
    setTo("");
    setMethodId("");
    setStatus("");
    setPaymentStatus("");
  };

  const activeFilters = Boolean(search || day || from || to || methodId || status || paymentStatus);

  const renderActions = (consultation: Consultation) => (
    <div className="flex flex-wrap items-center gap-1">
      <ConsultationStopwatchInline consultation={consultation} onFinished={onFinished} />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ color: "#1f8a4c" }}
        onClick={() => onWhatsApp({ consulenteId: consultation.consulenteId, consultation })}
        title="Enviar mensagem pré-programada no WhatsApp"
      >
        <Icon name="whatsapp" size={14} />
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(consultation)} title="Abrir detalhes">
        <Icon name="eye" size={14} />
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(consultation)} title="Editar agendamento">
        <Icon name="edit" size={14} />
      </button>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => onPay(consultation)} title="Registrar pagamento">
        <Icon name="coins" size={14} />
      </button>
      {consultation.status !== "cancelada" ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelTarget(consultation)} title="Cancelar consulta">
          <Icon name="ban" size={14} />
        </button>
      ) : null}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(consultation)} title="Excluir consulta">
        <Icon name="trash" size={14} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="heading text-lg font-semibold">Consultas</h2>
          <p className="muted text-xs">{filtered.length} de {data.consultations.length} consulta(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
            {(["lista", "calendario"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={cx("px-2.5 py-1.5 text-xs font-semibold capitalize", view === mode && "nav-link-active")}
                style={{ color: view === mode ? "var(--text)" : "var(--muted)" }}
                onClick={() => setView(mode)}
              >
                {mode === "lista" ? "Lista" : "Calendário"}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
            <Icon name="plus" size={14} /> Nova consulta
          </button>
        </div>
      </div>

      <section className="card p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Buscar consulente">
            <div className="relative">
              <input className="input pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou método" />
              <span className="absolute left-2.5 top-2.5 muted">
                <Icon name="search" size={15} />
              </span>
            </div>
          </Field>
          <Field label="Data específica">
            <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Período — de">
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Período — até">
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Método">
            <select className="select" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="">Todos</option>
              {data.methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status do atendimento">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(CONSULTATION_STATUS).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status do pagamento">
            <select className="select" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(PAYMENT_STATUS).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button type="button" className="btn btn-outline btn-sm flex-1" onClick={() => { setDay(todayISO()); setFrom(""); setTo(""); }}>
              Hoje
            </button>
            <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={clearFilters} disabled={!activeFilters}>
              Limpar
            </button>
          </div>
        </div>
      </section>

      <section className="card p-3">
        <SectionTitle
          title="Tempo trabalhado (cronômetro)"
          subtitle="Medido automaticamente ao iniciar e finalizar cada consulta"
          icon="timer"
          action={
            <select className="select w-auto py-1 text-xs" value={hoursMonth} onChange={(e) => setHoursMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          }
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard
            label="Tempo trabalhado"
            value={secondsToWorkedLabel(hoursStats.totalSeconds)}
            hint={`Previsto pelos métodos: ${hoursLabel(hoursStats.estimatedMinutes)}`}
            icon="timer"
          />
          <StatCard
            label="Consultas cronometradas"
            value={`${hoursStats.timedCount} / ${hoursStats.count}`}
            hint="Cronometradas de realizadas"
            icon="check"
            tone="success"
          />
          <StatCard
            label="Duração real média"
            value={secondsToWorkedLabel(hoursStats.avgSeconds)}
            hint="Média por leitura cronometrada"
            icon="chart"
            tone="accent"
          />
          <StatCard
            label="Método com mais tempo"
            value={[...hoursStats.byMethod.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"}
            icon="moon"
            tone="neutral"
          />
        </div>
      </section>

      {view === "lista" ? (
        <section className="card overflow-hidden">
          {filtered.length ? (
            <>
              {/* Tabela em telas maiores */}
              <div className="table-wrap hidden md:block">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Consulente</th>
                      <th>Método</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Pagamento</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => {
                      const paid = paidFor(c.id, data.payments);
                      return (
                        <tr key={c.id}>
                          <td>
                            <span className="font-semibold">{formatDateBR(c.date)}</span>
                            <span className="muted block text-[0.7rem]">
                              {c.startTime}–{`${String(Math.floor((timeToMinutes(c.startTime) + c.durationMinutes) / 60) % 24).padStart(2, "0")}:${String((timeToMinutes(c.startTime) + c.durationMinutes) % 60).padStart(2, "0")}`}
                            </span>
                          </td>
                          <td>{nameById.get(c.consulenteId) ?? "—"}</td>
                          <td>
                            {c.methodName}
                            <span className="muted block text-[0.68rem]">catálogo {money(c.methodPriceCents)}</span>
                          </td>
                          <td>
                            {money(c.priceCents)}
                            {paid > 0 && paid < c.priceCents ? <span className="muted block text-[0.68rem]">pago {money(paid)}</span> : null}
                          </td>
                          <td>
                            <span className={cx("chip", CONSULTATION_STATUS[c.status].tone)}>{CONSULTATION_STATUS[c.status].label}</span>
                          </td>
                          <td>
                            <span className={cx("chip", PAYMENT_STATUS[c.paymentStatus].tone)}>{PAYMENT_STATUS[c.paymentStatus].label}</span>
                          </td>
                          <td>{renderActions(c)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Cards no mobile */}
              <ul className="divide-y md:hidden" style={{ borderColor: "var(--border)" }}>
                {filtered.map((c) => (
                  <li key={c.id} className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{nameById.get(c.consulenteId) ?? "—"}</p>
                        <p className="muted text-xs">
                          {formatDateBR(c.date)} · {c.startTime} · {c.methodName}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">{money(c.priceCents)}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className={cx("chip", CONSULTATION_STATUS[c.status].tone)}>{CONSULTATION_STATUS[c.status].label}</span>
                      <span className={cx("chip", PAYMENT_STATUS[c.paymentStatus].tone)}>{PAYMENT_STATUS[c.paymentStatus].label}</span>
                    </div>
                    <div className="mt-2">{renderActions(c)}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              title="Nenhuma consulta encontrada"
              message={activeFilters ? "Ajuste os filtros para ver outros registros." : "Cadastre sua primeira consulta para começar a organizar sua agenda e seus recebimentos."}
              action={
                activeFilters ? (
                  <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>
                    Limpar filtros
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
                    <Icon name="plus" size={14} /> Nova consulta
                  </button>
                )
              }
            />
          )}
        </section>
      ) : (
        <CalendarView
          consultations={filtered}
          nameById={nameById}
          month={calendarMonth}
          setMonth={setCalendarMonth}
          onSelect={setDetail}
          onNew={onNew}
        />
      )}

      <Modal
        open={Boolean(activeDetail)}
        onClose={() => setDetail(null)}
        title="Detalhes da consulta"
        footer={
          activeDetail ? (
            <>
              <button
                type="button"
                className="btn btn-outline"
                style={{ borderColor: "color-mix(in srgb, #1f8a4c 40%, var(--border))", color: "#1f8a4c" }}
                onClick={() => {
                  const target = activeDetail;
                  setDetail(null);
                  onWhatsApp({ consulenteId: target.consulenteId, consultation: target });
                }}
              >
                <Icon name="whatsapp" size={14} /> WhatsApp
              </button>
              <button type="button" className="btn btn-outline" onClick={() => { onEdit(activeDetail); setDetail(null); }}>
                Editar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => { onPay(activeDetail); setDetail(null); }}>
                Registrar pagamento
              </button>
            </>
          ) : null
        }
      >
        {activeDetail ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="card-muted p-2">
                <p className="muted text-[0.65rem] uppercase">Consulente</p>
                <p className="font-semibold">{nameById.get(activeDetail.consulenteId) ?? "—"}</p>
              </div>
              <div className="card-muted p-2">
                <p className="muted text-[0.65rem] uppercase">Método</p>
                <p className="font-semibold">{activeDetail.methodName}</p>
              </div>
              <div className="card-muted p-2">
                <p className="muted text-[0.65rem] uppercase">Data e horário</p>
                <p className="font-semibold">
                  {formatDateBR(activeDetail.date)} · {activeDetail.startTime} (previsto {activeDetail.durationMinutes} min)
                </p>
              </div>
              <div className="card-muted p-2">
                <p className="muted text-[0.65rem] uppercase">Valor</p>
                <p className="font-semibold">{money(activeDetail.priceCents)}</p>
                <p className="muted text-[0.65rem]">catálogo {money(activeDetail.methodPriceCents)}</p>
              </div>
            </div>

            <div className="card-muted flex flex-wrap items-center justify-between gap-2 p-2.5">
              <div>
                <p className="muted text-[0.65rem] font-bold uppercase">Cronômetro de tempo trabalhado</p>
                <p className="text-xs font-semibold">
                  {activeDetail.actualSeconds > 0
                    ? `${secondsToWorkedLabel(activeDetail.actualSeconds)} (${formatStopwatch(activeDetail.actualSeconds)})`
                    : activeDetail.timerStartedAt
                      ? "Em contagem..."
                      : "Ainda não cronometrado"}
                </p>
              </div>
              <ConsultationStopwatchInline
                consultation={activeDetail}
                onFinished={(sum) => {
                  setDetail(null);
                  onFinished(sum);
                }}
              />
            </div>

            <div className="flex flex-wrap gap-1">
              <span className={cx("chip", CONSULTATION_STATUS[activeDetail.status].tone)}>{CONSULTATION_STATUS[activeDetail.status].label}</span>
              <span className={cx("chip", PAYMENT_STATUS[activeDetail.paymentStatus].tone)}>{PAYMENT_STATUS[activeDetail.paymentStatus].label}</span>
              {activeDetail.paymentMethod ? <span className="chip">{activeDetail.paymentMethod}</span> : null}
            </div>
            {activeDetail.notes ? <p className="card-muted whitespace-pre-wrap p-2 text-xs">{activeDetail.notes}</p> : null}
            <div>
              <p className="muted mb-1 text-[0.7rem] font-semibold uppercase">Pagamentos vinculados</p>
              {data.payments.filter((p) => p.consultationId === activeDetail.id).length ? (
                <ul className="space-y-1 text-xs">
                  {data.payments
                    .filter((p) => p.consultationId === activeDetail.id)
                    .map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span>
                          {formatDateBR(p.paidAt)} · {p.method} {p.kind === "estorno" ? "(estorno)" : ""}
                        </span>
                        <span className="font-medium">{money(p.amountCents)}</span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="muted text-xs">Nenhum pagamento registrado.</p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir consulta"
        message="Esta ação remove a consulta e cancela seus lembretes. Consultas com pagamentos registrados não podem ser excluídas — cancele-as para preservar o histórico financeiro."
        confirmLabel="Excluir definitivamente"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancelar consulta"
        message="Ao cancelar, os lembretes deixam de ser enviados e a consulta não entra nos indicadores de atendimentos realizados. Pagamentos já recebidos permanecem registrados."
        confirmLabel="Cancelar consulta"
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) void changeStatus(cancelTarget, "cancelada");
          setCancelTarget(null);
        }}
      />
    </div>
  );
}

function CalendarView({
  consultations,
  nameById,
  month,
  setMonth,
  onSelect,
  onNew,
}: {
  consultations: Consultation[];
  nameById: Map<number, string>;
  month: string;
  setMonth: (value: string) => void;
  onSelect: (c: Consultation) => void;
  onNew: () => void;
}) {
  const { money } = useApp();
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const byDate = new Map<string, Consultation[]>();
  for (const c of consultations) {
    const list = byDate.get(c.date) ?? [];
    list.push(c);
    byDate.set(c.date, list);
  }
  const move = (delta: number) => {
    const d = new Date(year, monthNumber - 1 + delta, 1);
    setMonth(monthKey(d));
  };

  return (
    <section className="card p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => move(-1)} aria-label="Mês anterior">
            <Icon name="left" size={14} />
          </button>
          <p className="min-w-[8.5rem] text-center text-sm font-semibold">{monthLabel(month)}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => move(1)} aria-label="Próximo mês">
            <Icon name="right" size={14} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonth(monthKey())}>
            Hoje
          </button>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
          <Icon name="plus" size={14} /> Nova consulta
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label) => (
          <div key={label} className="muted pb-1 text-[0.65rem] font-bold uppercase">
            {label}
          </div>
        ))}
        {cells.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} className="min-h-[4.3rem] rounded-lg" />;
          const items = (byDate.get(date) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime));
          const isToday = date === todayISO();
          return (
            <div
              key={date}
              className="min-h-[4.3rem] rounded-lg border p-1 text-left"
              style={{
                borderColor: isToday ? "var(--primary)" : "var(--border)",
                background: isToday ? "var(--primary-soft)" : "color-mix(in srgb, var(--raised) 55%, transparent)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[0.68rem] font-bold">{Number(date.slice(-2))}</span>
                {items.length ? <span className="muted text-[0.6rem]">{items.length}</span> : null}
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item)}
                    className="block w-full truncate rounded px-1 py-0.5 text-left text-[0.6rem] font-medium"
                    style={{
                      background: item.status === "cancelada" ? "rgba(180,35,27,0.15)" : "color-mix(in srgb, var(--primary) 20%, transparent)",
                      textDecoration: item.status === "cancelada" ? "line-through" : "none",
                    }}
                    title={`${item.startTime} ${nameById.get(item.consulenteId) ?? ""} · ${money(item.priceCents)}`}
                  >
                    {item.startTime} {nameById.get(item.consulenteId) ?? ""}
                  </button>
                ))}
                {items.length > 3 ? <p className="muted text-[0.58rem]">+{items.length - 3}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
