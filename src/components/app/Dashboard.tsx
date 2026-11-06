"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { MoodCheckIn } from "@/components/app/MoodCheckIn";
import type { TabKey } from "@/components/app/AppShell";
import { ConsultationStopwatchInline, type FinishedSummary } from "@/components/app/StopwatchControls";
import { Icon, ProgressBar, SectionTitle, StatCard, cx } from "@/components/ui";
import {
  CONSULTATION_STATUS,
  PAYMENT_STATUS,
  formatDateBR,
  hoursLabel,
  monthKey,
  monthLabel,
  secondsToWorkedLabel,
  todayISO,
} from "@/lib/format";
import { financeForMonth, upcomingConsultations } from "@/lib/metrics";
import type { Consultation, WhatsAppTarget } from "@/lib/types";

export function Dashboard({
  onNavigate,
  onEdit,
  onPay,
  onWhatsApp,
  onFinished,
  onOpenImageEditor,
}: {
  onNavigate: (tab: TabKey) => void;
  onEdit: (consultation: Consultation) => void;
  onPay: (consultation: Consultation) => void;
  onWhatsApp: (target: WhatsAppTarget) => void;
  onFinished: (summary: FinishedSummary) => void;
  onOpenImageEditor: () => void;
}) {
  const { data, money } = useApp();
  const [month, setMonth] = useState(monthKey());
  const today = todayISO();

  const months = useMemo(() => {
    const set = new Set<string>([monthKey()]);
    for (let i = 1; i <= 11; i += 1) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      set.add(monthKey(d));
    }
    for (const c of data.consultations) set.add(monthKey(c.date));
    for (const w of data.spiritualWorks) set.add(monthKey(w.date));
    for (const t of data.transactions) set.add(monthKey(t.date));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [data.consultations, data.spiritualWorks, data.transactions]);

  const finance = useMemo(
    () =>
      financeForMonth(month, {
        transactions: data.transactions,
        payments: data.payments,
        consultations: data.consultations,
        spiritualWorks: data.spiritualWorks,
        workPayments: data.workPayments,
        goals: data.goals,
        settings: data.settings,
      }),
    [month, data],
  );

  const todayConsultations = data.consultations.filter((c) => c.date === today);
  const scheduledTodayConsultations = todayConsultations.filter((c) => c.status === "agendada" || c.status === "confirmada");
  const scheduledTodayWorks = data.spiritualWorks.filter((work) => work.date === today && work.status === "planejado");
  const scheduledTodayCount = scheduledTodayConsultations.length + scheduledTodayWorks.length;
  const upcoming = useMemo(
    () => upcomingConsultations(data.consultations, data.consulentes, data.payments, 6),
    [data.consultations, data.consulentes, data.payments],
  );

  const hoursByMonth = new Map<string, { seconds: number; estimatedMinutes: number; timedCount: number; count: number }>();
  for (const c of data.consultations) {
    if (c.status !== "realizada") continue;
    const key = monthKey(c.date);
    const entry = hoursByMonth.get(key) ?? { seconds: 0, estimatedMinutes: 0, timedCount: 0, count: 0 };
    entry.seconds += c.actualSeconds ?? 0;
    entry.estimatedMinutes += c.durationMinutes;
    if ((c.actualSeconds ?? 0) > 0) entry.timedCount += 1;
    entry.count += 1;
    hoursByMonth.set(key, entry);
  }
  const hours = hoursByMonth.get(month) ?? { seconds: 0, estimatedMinutes: 0, timedCount: 0, count: 0 };
  const goalCents = finance.goalCents;
  const missing = Math.max(0, goalCents - finance.receivedCents);
  const isEmpty =
    data.consultations.length === 0 && data.consulentes.length === 0 && data.methods.length === 0 && data.transactions.length === 0;

  const coverImage = data.settings.coverImage || data.settings.profileImage;

  return (
    <div className="space-y-4">
      <section className="card relative overflow-hidden">
        <div className="grid gap-0 sm:grid-cols-[1.35fr_1fr]">
          <div className="order-2 p-4 sm:order-1 sm:p-5">
            <p className="muted text-[0.7rem] font-bold uppercase tracking-[0.14em]">{monthLabel(month)}</p>
            <h2 className="heading mt-1 text-xl font-semibold sm:text-2xl">
              Olá, {data.settings.professionalName || data.tenant.ownerName || "cartomante"} 🌙
            </h2>
            <p className="muted mt-1 max-w-md text-sm">
              {scheduledTodayCount > 0
                ? `Você tem ${scheduledTodayCount} ${scheduledTodayCount === 1 ? "atendimento agendado" : "atendimentos agendados"} para hoje.`
                : "Você não tem atendimentos agendados para hoje."}
            </p>
            <MoodCheckIn />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="muted text-[0.7rem] font-semibold uppercase" htmlFor="dash-month">
                Período
              </label>
              <select id="dash-month" className="select w-auto py-1 text-xs" value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((option) => (
                  <option key={option} value={option}>
                    {monthLabel(option)}
                  </option>
                ))}
              </select>
              <span className="chip">{data.tenant.isDemo ? "Demonstração" : "Conta ativa"}</span>
            </div>
          </div>
          <div className="relative order-1 h-40 sm:order-2 sm:h-auto sm:min-h-[12rem]">
            {coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverImage} alt="Imagem personalizada do ateliê" className="h-full w-full object-cover" />
            ) : (
              <div className="starfield h-full w-full" style={{ background: "linear-gradient(140deg, var(--primary-soft), var(--accent-soft))" }} />
            )}
            <div className="pointer-events-none absolute inset-0 hidden sm:block" style={{ background: "linear-gradient(90deg, var(--surface) 0%, transparent 42%)" }} />
            <button
              type="button"
              onClick={onOpenImageEditor}
              className="glass absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition hover:opacity-95"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              <Icon name="camera" size={13} /> Editar imagem
            </button>
          </div>
        </div>
      </section>

      {isEmpty ? (
        <section className="card p-4">
          <SectionTitle title="Primeiros passos" subtitle="Configure o essencial antes de começar a usar o app." icon="sparkles" />
          <ol className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              ["Cadastre seus métodos de tiragem e preços", "metodos"],
              ["Defina saldo inicial e meta financeira", "configuracoes"],
              ["Cadastre suas consulentes", "consulentes"],
              ["Agende a primeira consulta", "consultas"],
            ].map(([label, tab], index) => (
              <li key={label}>
                <button type="button" className="card-muted flex w-full items-center gap-2 p-2.5 text-left" onClick={() => onNavigate(tab as TabKey)}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--primary-soft)" }}>
                    {index + 1}
                  </span>
                  <span className="flex-1">{label}</span>
                  <Icon name="right" size={14} />
                </button>
              </li>
            ))}
          </ol>
          <p className="muted mt-2 text-[0.7rem]">
            Você pode completar esses passos no seu ritmo e importar seus registros em Configurações e backup.
          </p>
        </section>
      ) : null}

      <section>
        <SectionTitle title="Indicadores" subtitle={`Atualizados automaticamente · ${monthLabel(month)}`} icon="chart" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Consultas hoje" value={scheduledTodayConsultations.length} hint="Agendadas e confirmadas" icon="calendar" />
          <StatCard
            label="Próximas consultas"
            value={upcoming.length}
            hint="A partir de agora"
            icon="clock"
            tone="accent"
          />
          <StatCard label="Realizadas no mês" value={finance.realizedCount} hint="Somente status realizada" icon="check" tone="success" />
          <StatCard label="Canceladas" value={finance.cancelledCount} hint={`${finance.noShowCount} falta(s)`} icon="ban" tone="danger" />
          <StatCard label="Recebido no mês" value={money(finance.receivedCents)} hint="Entradas efetivamente recebidas" icon="coins" tone="success" />
          <StatCard label="Valores pendentes" value={money(finance.outstandingCents)} hint="A receber de consultas" icon="clock" tone="warning" />
          <StatCard label="Despesas do mês" value={money(finance.expensesCents)} hint="Pagas no período" icon="wallet" tone="danger" />
          <StatCard label="Saldo atual" value={money(finance.balanceCents)} hint="Saldo inicial + entradas − despesas" icon="shield" tone="accent" />
          <StatCard label="Meta do mês" value={money(goalCents)} hint={`${finance.goalPercent}% alcançado`} icon="star" />
          <StatCard
            label="Tempo trabalhado"
            value={secondsToWorkedLabel(hours.seconds)}
            hint={`Cronômetro · ${hours.timedCount} consulta(s) (previsto ${hoursLabel(hours.estimatedMinutes)})`}
            icon="timer"
            tone="accent"
          />
          <StatCard label="Faturamento de consultas" value={money(finance.consultationIncomeCents)} hint="Pagamentos de consultas" icon="sparkles" />
          <StatCard
            label="Trabalhos e terapias"
            value={`${finance.worksActiveCount} ativos`}
            hint={`${finance.worksCompletedCount} concluído(s) · ${money(finance.workIncomeCents)}`}
            icon="flame"
            tone="accent"
          />
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <section className="card p-4">
          <SectionTitle
            title="Próximos atendimentos"
            subtitle="Ações rápidas sem sair do painel"
            icon="calendar"
            action={
              <button type="button" className="btn btn-outline btn-sm" onClick={() => onNavigate("consultas")}>
                Ver todas
              </button>
            }
          />
          {upcoming.length ? (
            <ul className="space-y-2">
              {upcoming.map(({ consultation, consulenteName, remainingCents }) => (
                <li key={consultation.id} className="card-muted p-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{consulenteName}</p>
                      <p className="muted text-xs">
                        {formatDateBR(consultation.date)} · {consultation.startTime} · {consultation.methodName}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className={cx("chip", CONSULTATION_STATUS[consultation.status].tone)}>{CONSULTATION_STATUS[consultation.status].label}</span>
                        <span className={cx("chip", PAYMENT_STATUS[consultation.paymentStatus].tone)}>
                          {remainingCents > 0 ? `A receber ${money(remainingCents)}` : "Pago"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{money(consultation.priceCents)}</p>
                      <p className="muted text-[0.68rem]">{consultation.durationMinutes} min</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ConsultationStopwatchInline consultation={consultation} onFinished={onFinished} />
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ borderColor: "color-mix(in srgb, #1f8a4c 40%, var(--border))", color: "#1f8a4c" }}
                      onClick={() => onWhatsApp({ consulenteId: consultation.consulenteId, consultation })}
                    >
                      <Icon name="whatsapp" size={13} /> WhatsApp
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(consultation)}>
                      <Icon name="edit" size={13} /> Editar
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onPay(consultation)}>
                      <Icon name="coins" size={13} /> Pagamento
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted py-6 text-center text-sm">
              Nenhuma consulta futura. <button type="button" className="underline" onClick={() => onNavigate("consultas")}>Agendar agora</button>
            </p>
          )}
        </section>

        <div className="space-y-3">
          <section className="card p-4">
            <SectionTitle title="Meta financeira" subtitle={monthLabel(month)} icon="star" />
            <p className="text-2xl font-semibold">{money(finance.receivedCents)}</p>
            <p className="muted text-xs">de {money(goalCents)} de meta</p>
            <div className="mt-3">
              <ProgressBar percent={finance.goalPercent} label={`${finance.goalPercent}% alcançado · faltam ${money(missing)}`} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="card-muted p-2">
                <p className="muted">Recebido</p>
                <p className="font-semibold text-emerald-600">{money(finance.receivedCents)}</p>
              </div>
              <div className="card-muted p-2">
                <p className="muted">Restante</p>
                <p className="font-semibold">{money(missing)}</p>
              </div>
            </div>
            <button type="button" className="btn btn-outline btn-sm mt-3 w-full" onClick={() => onNavigate("financeiro")}>
              Ajustar meta e lançamentos
            </button>
          </section>

          <section className="card p-4">
            <SectionTitle
              title="Tempo trabalhado (cronômetro)"
              subtitle={`${hours.timedCount} consulta(s) cronometrada(s) em ${monthLabel(month)}`}
              icon="timer"
            />
            <p className="text-2xl font-semibold">{secondsToWorkedLabel(hours.seconds)}</p>
            <p className="muted text-[0.7rem]">Inicie e finalize o cronômetro da consulta para registrar o tempo real trabalhado.</p>
            <div className="mt-2 space-y-1">
              {[...hoursByMonth.entries()]
                .sort(([a], [b]) => b.localeCompare(a))
                .slice(0, 4)
                .map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="muted">{monthLabel(key)}</span>
                    <span className="font-medium">
                      {secondsToWorkedLabel(value.seconds)} · {value.timedCount} cronom.
                    </span>
                  </div>
                ))}
              {!hoursByMonth.size ? (
                <p className="muted text-xs">Inicie o cronômetro quando começar uma consulta para medir suas horas.</p>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <section className="card p-4">
        <SectionTitle title="Consulta de hoje" subtitle={formatDateBR(today)} icon="sun" />
        {todayConsultations.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Consulente</th>
                  <th>Método</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Cronômetro & WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {todayConsultations
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((c) => (
                    <tr key={c.id}>
                      <td className="font-semibold">{c.startTime}</td>
                      <td>{data.consulentes.find((x) => x.id === c.consulenteId)?.name ?? "—"}</td>
                      <td>{c.methodName}</td>
                      <td>{money(c.priceCents)}</td>
                      <td>
                        <span className={cx("chip", CONSULTATION_STATUS[c.status].tone)}>{CONSULTATION_STATUS[c.status].label}</span>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          <ConsultationStopwatchInline consultation={c} onFinished={onFinished} />
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: "#1f8a4c" }}
                            onClick={() => onWhatsApp({ consulenteId: c.consulenteId, consultation: c })}
                            title="Enviar mensagem no WhatsApp"
                          >
                            <Icon name="whatsapp" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted text-sm">Nenhuma consulta hoje. Bom momento para divulgar seus atendimentos.</p>
        )}
      </section>
    </div>
  );
}
