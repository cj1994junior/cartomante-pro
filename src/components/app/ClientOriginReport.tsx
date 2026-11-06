"use client";

import { Icon, SectionTitle, cx } from "@/components/ui";
import type { OriginReport } from "@/lib/client-origins";

export type OriginReportScope = "todas" | "periodo";

function percentLabel(value: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function ClientOriginReport({
  summary,
  scope,
  onScopeChange,
  periodLabel,
  selectedName,
}: {
  summary: OriginReport;
  scope: OriginReportScope;
  onScopeChange: (scope: OriginReportScope) => void;
  periodLabel: string;
  selectedName?: string;
}) {
  const knownRows = summary.rows.filter((row) => row.value !== "nao_informado").sort((a, b) => b.count - a.count);
  const unknown = summary.rows.find((row) => row.value === "nao_informado");
  const rows = unknown ? [...knownRows, unknown] : knownRows;
  const leaderNames = summary.leaders.map((leader) => leader.label).join(" e ");
  const leaderCount = summary.leaders[0]?.count ?? 0;
  const subtitle = scope === "todas" ? "Toda a carteira" : `Cadastros de ${periodLabel}`;

  return (
    <section className="card p-4" aria-label="Relatório de origem das consulentes">
      <SectionTitle
        title="De onde vêm suas consulentes"
        subtitle={selectedName ? `${subtitle} · ${selectedName}` : subtitle}
        icon="users"
        action={
          <div className="no-print flex flex-wrap gap-1" role="group" aria-label="Período da origem das consulentes">
            <button type="button" className={cx("chip", scope === "todas" && "chip-active")} aria-pressed={scope === "todas"} onClick={() => onScopeChange("todas")}>
              Toda a carteira
            </button>
            <button type="button" className={cx("chip", scope === "periodo" && "chip-active")} aria-pressed={scope === "periodo"} onClick={() => onScopeChange("periodo")}>
              Período do relatório
            </button>
          </div>
        }
      />

      {summary.total === 0 ? (
        <div className="card-muted flex flex-col items-center gap-2 px-4 py-8 text-center">
          <Icon name="users" size={22} className="muted" />
          <p className="text-sm font-semibold">Nenhuma consulente neste recorte</p>
          <p className="muted max-w-md text-xs">Cadastre uma consulente ou escolha outro período para acompanhar a origem dos seus contatos.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div
            className="rounded-xl border p-4"
            style={{
              borderColor: "color-mix(in srgb, var(--primary) 35%, var(--border))",
              background: "linear-gradient(140deg, var(--primary-soft), var(--surface))",
            }}
          >
            <p className="muted text-[0.67rem] font-bold uppercase tracking-[0.1em]">Origem mais frequente</p>
            {summary.leaders.length ? (
              <>
                <h3 className="mt-2 text-xl font-semibold leading-tight">{summary.leaders.length > 1 ? `Empate: ${leaderNames}` : leaderNames}</h3>
                <p className="muted mt-1 text-xs">
                  {leaderCount} {leaderCount === 1 ? "consulente" : "consulentes"} {summary.leaders.length > 1 ? "em cada origem" : "nesta origem"}.
                </p>
              </>
            ) : (
              <>
                <h3 className="mt-2 text-xl font-semibold">Ainda não informada</h3>
                <p className="muted mt-1 text-xs">Edite os cadastros para descobrir qual canal traz mais consulentes.</p>
              </>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="card-muted p-2.5">
                <p className="muted text-[0.65rem] uppercase tracking-wide">Total de cadastros</p>
                <p className="text-lg font-semibold">{summary.total}</p>
              </div>
              <div className="card-muted p-2.5">
                <p className="muted text-[0.65rem] uppercase tracking-wide">Sem origem</p>
                <p className="text-lg font-semibold">{summary.uninformed}</p>
              </div>
            </div>
            <p className="muted mt-3 text-[0.7rem] leading-relaxed">
              O destaque considera apenas origens informadas. Cada consulente é contada uma vez, inclusive cadastros arquivados.
            </p>
          </div>

          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.value}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
                    {row.label}
                  </span>
                  <span className="muted shrink-0">{row.count} · {percentLabel(row.percentage)}</span>
                </div>
                <div
                  className="mt-1 h-2 overflow-hidden rounded-full"
                  style={{ background: "color-mix(in srgb, var(--border) 75%, transparent)" }}
                  role="progressbar"
                  aria-label={`${row.label}: ${row.count} de ${summary.total} consulentes`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(row.percentage)}
                >
                  <div className="h-full rounded-full" style={{ width: `${row.percentage}%`, background: row.color }} />
                </div>
              </div>
            ))}
            <p className="muted text-[0.7rem] leading-relaxed">
              Percentuais calculados sobre {summary.total} {summary.total === 1 ? "cadastro" : "cadastros"}, incluindo os não informados.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
