"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ClientOriginReport, type OriginReportScope } from "@/components/app/ClientOriginReport";
import { Field, Icon, SectionTitle, StatCard, cx } from "@/components/ui";
import { summarizeClientOrigins } from "@/lib/client-origins";
import { formatDateBR, hoursLabel, monthLabel, periodRangeFromMonthsAgo, secondsToWorkedLabel, todayISO, toISO } from "@/lib/format";
import { consulenteStats, periodReport } from "@/lib/metrics";
import type { WhatsAppTarget } from "@/lib/types";

type Preset = "1" | "2" | "3" | "custom";

export function Relatorios({ onWhatsApp }: { onWhatsApp?: (target: WhatsAppTarget) => void }) {
  const { data, money } = useApp();
  const [preset, setPreset] = useState<Preset>("3");
  const [start, setStart] = useState(periodRangeFromMonthsAgo(3).start);
  const [end, setEnd] = useState(periodRangeFromMonthsAgo(3).end);
  const [consulenteId, setConsulenteId] = useState("");
  const [originScope, setOriginScope] = useState<OriginReportScope>("todas");
  const [inactiveDays, setInactiveDays] = useState("90");

  const range = useMemo(() => {
    if (preset === "custom") return { start, end };
    return periodRangeFromMonthsAgo(Number(preset));
  }, [preset, start, end]);

  const rangeLabel = `${formatDateBR(range.start)} a ${formatDateBR(range.end)}`;

  const originSummary = useMemo(() => {
    const relevant = data.consulentes.filter((consulente) => {
      if (consulenteId && consulente.id !== Number(consulenteId)) return false;
      if (originScope === "todas") return true;
      const registered = new Date(consulente.createdAt);
      if (Number.isNaN(registered.getTime())) return false;
      const date = toISO(registered);
      return date >= range.start && date <= range.end;
    });
    return summarizeClientOrigins(relevant);
  }, [data.consulentes, consulenteId, originScope, range.start, range.end]);

  const report = useMemo(
    () =>
      periodReport(range.start, range.end, {
        consultations: data.consultations,
        payments: data.payments,
        transactions: data.transactions,
        consulenteId: consulenteId ? Number(consulenteId) : null,
      }),
    [range, data, consulenteId],
  );

  const allStats = useMemo(
    () => data.consulentes.map((c) => consulenteStats(c, data.consultations, data.payments)),
    [data.consulentes, data.consultations, data.payments],
  );

  const topConsulentes = useMemo(() => {
    return allStats
      .map((stat) => {
        const inPeriod = data.consultations.filter(
          (c) => c.consulenteId === stat.consulente.id && c.date >= range.start && c.date <= range.end,
        );
        const realized = inPeriod.filter((c) => c.status === "realizada");
        const paid = data.payments
          .filter((p) => realized.some((c) => c.id === p.consultationId) && p.paidAt >= range.start && p.paidAt <= range.end)
          .reduce((acc, p) => acc + p.amountCents, 0);
        return { ...stat, periodRealized: realized.length, periodPaid: paid };
      })
      .filter((stat) => stat.periodRealized > 0 || stat.periodPaid > 0)
      .sort((a, b) => b.periodRealized - a.periodRealized || b.periodPaid - a.periodPaid)
      .slice(0, 8);
  }, [allStats, data.consultations, data.payments, range]);

  const inactive = useMemo(() => {
    const days = Math.max(1, Number(inactiveDays) || 90);
    const cutoff = todayISO().slice(0, 10);
    return allStats
      .filter((stat) => {
        if (!stat.lastRealized) return false;
        const diff = (new Date(cutoff).getTime() - new Date(stat.lastRealized).getTime()) / 86400000;
        return diff >= days;
      })
      .sort((a, b) => (a.lastRealized ?? "").localeCompare(b.lastRealized ?? ""))
      .slice(0, 10);
  }, [allStats, inactiveDays]);

  const individual = consulenteId ? allStats.find((stat) => stat.consulente.id === Number(consulenteId)) : null;

  const downloadCSV = () => {
    const lines: string[][] = [];
    lines.push(["Cartomante Pro — relatório", rangeLabel]);
    lines.push([]);
    lines.push(["Indicadores"]);
    lines.push(["Consulta(s) realizada(s)", String(report.realized.length)]);
    lines.push(["Consulta(s) agendada(s)", String(report.scheduled.length)]);
    lines.push(["Cancelamento(s)", String(report.cancelled.length)]);
    lines.push(["Falta(s)", String(report.noShow.length)]);
    lines.push(["Recebido", (report.receivedCents / 100).toFixed(2).replace(".", ",")]);
    lines.push(["Pendente", (report.pendingCents / 100).toFixed(2).replace(".", ",")]);
    lines.push(["Tempo trabalhado (cronômetro)", secondsToWorkedLabel(report.workedSeconds)]);
    lines.push(["Tempo previsto (métodos)", hoursLabel(report.estimatedMinutes)]);
    lines.push([]);
    lines.push(["Origem das consulentes", originScope === "todas" ? "Toda a carteira" : rangeLabel]);
    lines.push(["Origem", "Cadastros", "Percentual sobre o total"]);
    for (const row of originSummary.rows) {
      lines.push([row.label, String(row.count), `${row.percentage.toFixed(1).replace(".", ",")}%`]);
    }
    lines.push(["Total de cadastros", String(originSummary.total)]);
    lines.push([]);
    lines.push(["Métodos", "Utilizações", "Recebido"]);
    for (const method of report.methodUsage) {
      lines.push([method.name, String(method.count), (method.revenueCents / 100).toFixed(2).replace(".", ",")]);
    }
    lines.push([]);
    lines.push(["Mês", "Atendimentos", "Recebido", "Despesas"]);
    for (const month of report.monthly) {
      lines.push([
        monthLabel(month.month),
        String(month.consultations),
        (month.paymentsCents / 100).toFixed(2).replace(".", ","),
        (month.expensesCents / 100).toFixed(2).replace(".", ","),
      ]);
    }
    lines.push([]);
    lines.push(["Consulentes (geral)", "Realizadas no período", "Recebido no período"]);
    for (const stat of topConsulentes) {
      lines.push([stat.consulente.name, String(stat.periodRealized), (stat.periodPaid / 100).toFixed(2).replace(".", ",")]);
    }
    const csv = `\uFEFF${lines.map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-cartomante-${range.start}-a-${range.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="heading text-lg font-semibold">Relatórios</h2>
          <p className="muted text-xs">Períodos com datas reais de calendário · valores calculados a partir dos pagamentos registrados.</p>
        </div>
        <div className="no-print flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-outline btn-sm" onClick={downloadCSV}>
            <Icon name="download" size={14} /> Exportar CSV
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}>
            <Icon name="printer" size={14} /> Imprimir
          </button>
        </div>
      </div>

      <section className="card grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Período">
          <select className="select" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            <option value="1">Último mês</option>
            <option value="2">Últimos 2 meses</option>
            <option value="3">Últimos 3 meses</option>
            <option value="custom">Período personalizado</option>
          </select>
        </Field>
        <Field label="De">
          <input type="date" className="input" value={range.start} disabled={preset !== "custom"} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Até">
          <input type="date" className="input" value={range.end} disabled={preset !== "custom"} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Consulente">
          <select className="select" value={consulenteId} onChange={(e) => setConsulenteId(e.target.value)}>
            <option value="">Toda a carteira</option>
            {data.consulentes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <ClientOriginReport
        summary={originSummary}
        scope={originScope}
        onScopeChange={setOriginScope}
        periodLabel={rangeLabel}
        selectedName={consulenteId ? data.consulentes.find((consulente) => consulente.id === Number(consulenteId))?.name : undefined}
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Realizadas" value={report.realized.length} hint={rangeLabel} icon="check" tone="success" />
        <StatCard label="Agendadas" value={report.scheduled.length} icon="calendar" tone="accent" />
        <StatCard label="Cancelamentos" value={report.cancelled.length} icon="ban" tone="danger" />
        <StatCard label="Faltas" value={report.noShow.length} icon="alert" tone="warning" />
        <StatCard
          label="Tempo trabalhado"
          value={secondsToWorkedLabel(report.workedSeconds)}
          hint={`Previsto: ${hoursLabel(report.estimatedMinutes)}`}
          icon="timer"
          tone="accent"
        />
        <StatCard label="Recebido" value={money(report.receivedCents)} icon="coins" tone="success" />
        <StatCard label="Pendente" value={money(report.pendingCents)} icon="clock" tone="warning" />
      </div>

      {individual ? (
        <section className="card p-4">
          <SectionTitle title={`Relatório individual — ${individual.consulente.name}`} subtitle={`Período: ${rangeLabel}`} icon="users" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Consultas realizadas" value={report.realized.length} icon="check" tone="success" />
            <StatCard label="Método mais utilizado" value={report.methodUsage[0]?.name ?? "—"} icon="moon" />
            <StatCard label="Total recebido no período" value={money(report.receivedCents)} icon="coins" tone="success" />
            <StatCard label="Última consulta" value={formatDateBR(individual.lastRealized)} icon="calendar" tone="accent" />
          </div>
          <p className="muted mt-2 text-[0.7rem]">
            Consultas canceladas: {individual.cancelada} · Faltas: {individual.falta} · Pendente total: {money(individual.pendingCents)}. Todos os números
            são calculados automaticamente a partir dos registros reais do aplicativo.
          </p>
        </section>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card p-4">
          <SectionTitle title="Métodos mais utilizados" subtitle="Considera apenas consultas realizadas" icon="moon" />
          {report.methodUsage.length ? (
            <div className="space-y-2">
              {report.methodUsage.map((method) => {
                const max = Math.max(...report.methodUsage.map((m) => m.count), 1);
                return (
                  <div key={method.name}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium">{method.name}</span>
                      <span className="muted">{method.count}x · {money(method.revenueCents)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full" style={{ background: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(method.count / max) * 100}%`, background: "var(--primary)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted text-sm">Nenhuma consulta realizada no período selecionado.</p>
          )}
        </section>

        <section className="card p-4">
          <SectionTitle title="Consulentes que mais consultaram" subtitle={rangeLabel} icon="users" />
          {topConsulentes.length ? (
            <ul className="space-y-1.5">
              {topConsulentes.map((stat) => (
                <li key={stat.consulente.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">{stat.consulente.name}</span>
                  <span className="muted">
                    {stat.periodRealized} realizada(s) · {money(stat.periodPaid)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted text-sm">Nenhum atendimento no período.</p>
          )}
        </section>
      </div>

      <section className="card p-4">
        <SectionTitle title="Faturamento e atendimentos por mês" subtitle="Faturamento = pagamentos recebidos · despesas separadas" icon="chart" />
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Atendimentos realizados</th>
                <th>Recebido</th>
                <th>Despesas</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {report.monthly.map((month) => (
                <tr key={month.month}>
                  <td className="font-medium">{monthLabel(month.month)}</td>
                  <td>{month.consultations}</td>
                  <td className="text-emerald-600">{money(month.paymentsCents)}</td>
                  <td className="text-rose-500">{money(month.expensesCents)}</td>
                  <td className={cx("font-semibold", month.paymentsCents - month.expensesCents >= 0 ? "text-emerald-600" : "text-rose-500")}>
                    {money(month.paymentsCents - month.expensesCents)}
                  </td>
                </tr>
              ))}
              {!report.monthly.length ? (
                <tr>
                  <td colSpan={5} className="muted py-4 text-center">Nenhum dado no período.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4">
        <SectionTitle
          title="Consulentes sem retorno"
          subtitle="Quem não consulta há um determinado período"
          icon="clock"
          action={
            <div className="flex items-center gap-1.5">
              <input className="input w-20 py-1 text-xs" value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} inputMode="numeric" />
              <span className="muted text-xs">dias</span>
            </div>
          }
        />
        {inactive.length ? (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {inactive.map((stat) => (
              <li key={stat.consulente.id} className="card-muted flex flex-wrap items-center justify-between gap-2 p-2 text-xs">
                <div>
                  <span className="font-medium">{stat.consulente.name}</span>
                  <span className="muted block text-[0.68rem]">última: {formatDateBR(stat.lastRealized)}</span>
                </div>
                {onWhatsApp ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ borderColor: "color-mix(in srgb, #1f8a4c 40%, var(--border))", color: "#1f8a4c" }}
                    onClick={() => onWhatsApp({ consulenteId: stat.consulente.id, preferredCategory: "retorno" })}
                  >
                    <Icon name="whatsapp" size={12} /> Chamar no WhatsApp
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-sm">Nenhuma consulente nesse critério. 👏</p>
        )}
        <p className="muted mt-2 text-[0.68rem]">
          Relatório gerado em {formatDateBR(todayISO())} com dados reais do app · exportação em CSV e impressão compatíveis com o dispositivo.
        </p>
      </section>
    </div>
  );
}
