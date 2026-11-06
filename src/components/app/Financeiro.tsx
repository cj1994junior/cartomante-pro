"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ConfirmDialog, EmptyState, Field, Icon, Modal, ProgressBar, SectionTitle, StatCard, cx } from "@/components/ui";
import {
  PAYMENT_METHOD_OPTIONS,
  centsToInput,
  formatDateBR,
  monthKey,
  monthLabel,
  parseMoneyToCents,
  secondsToWorkedLabel,
  todayISO,
  uid,
} from "@/lib/format";
import { WorkPaymentModal } from "@/components/app/TrabalhosMagias";
import { financeForMonth, paidFor, paidForWork } from "@/lib/metrics";
import type { Consultation, SpiritualWork } from "@/lib/types";

export function Financeiro({
  onPay,
  onOpenSpreadsheet,
}: {
  onPay: (c: Consultation) => void;
  onOpenSpreadsheet?: () => void;
}) {
  const { data, money, mutate, toast } = useApp();
  const [payWorkTarget, setPayWorkTarget] = useState<SpiritualWork | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthSel, setMonthSel] = useState<"all" | string>(`${now.getMonth() + 1}`.padStart(2, "0"));
  const [typeFilter, setTypeFilter] = useState<"todas" | "entrada" | "despesa">("todas");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [formType, setFormType] = useState<"entrada" | "despesa" | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear()]);
    for (const t of data.transactions) set.add(Number(t.date.slice(0, 4)));
    for (const c of data.consultations) set.add(Number(c.date.slice(0, 4)));
    set.add(now.getFullYear() - 1);
    set.add(now.getFullYear() + 1);
    return [...set].sort((a, b) => b - a);
  }, [data.transactions, data.consultations, now]);

  const selectedMonth = monthSel === "all" ? null : `${year}-${monthSel}`;

  const aggregate = useMemo(() => {
    if (selectedMonth) {
      const base = financeForMonth(selectedMonth, data);
      return { ...base, label: monthLabel(selectedMonth) };
    }
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    const totals = months.map((m) => financeForMonth(m, data));
    const sum = (
      key:
        | "receivedCents"
        | "expensesCents"
        | "consultationIncomeCents"
        | "realizedCount"
        | "scheduledCount"
        | "cancelledCount"
        | "noShowCount"
        | "workedSeconds"
        | "hoursMinutes",
    ) => totals.reduce((acc, item) => acc + item[key], 0);
    const goalCents = months.reduce((acc, m) => acc + (data.goals.find((g) => g.month === m)?.amountCents ?? 0), 0);
    return {
      receivedCents: sum("receivedCents"),
      expensesCents: sum("expensesCents"),
      consultationIncomeCents: sum("consultationIncomeCents"),
      otherIncomeCents: sum("receivedCents") - sum("consultationIncomeCents"),
      balanceCents: totals[0]?.balanceCents ?? 0,
      outstandingCents: totals[0]?.outstandingCents ?? 0,
      goalCents: goalCents || data.settings.monthlyGoalCents * 12,
      goalPercent: 0,
      realizedCount: sum("realizedCount"),
      scheduledCount: sum("scheduledCount"),
      cancelledCount: sum("cancelledCount"),
      noShowCount: sum("noShowCount"),
      workedSeconds: sum("workedSeconds"),
      hoursMinutes: sum("hoursMinutes"),
      entries: data.transactions.filter((t) => t.type === "entrada" && t.date.startsWith(`${year}-`)),
      expenses: data.transactions.filter((t) => t.type === "despesa" && t.date.startsWith(`${year}-`)),
      label: `Ano ${year}`,
    };
  }, [selectedMonth, year, data]);

  const goalPercent = aggregate.goalCents > 0 ? Math.round((aggregate.receivedCents / aggregate.goalCents) * 100) : 0;
  const missing = Math.max(0, aggregate.goalCents - aggregate.receivedCents);

  const rows = useMemo(() => {
    const source = selectedMonth
      ? data.transactions.filter((t) => t.date.startsWith(selectedMonth))
      : data.transactions.filter((t) => t.date.startsWith(`${year}-`));
    return source
      .filter((t) => (typeFilter === "todas" ? true : t.type === typeFilter))
      .filter((t) => (category ? t.category === category : true))
      .filter((t) => (search ? `${t.description} ${t.category} ${t.notes ?? ""}`.toLowerCase().includes(search.toLowerCase()) : true))
      .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  }, [data.transactions, selectedMonth, year, typeFilter, category, search]);

  const categories = useMemo(() => {
    const set = new Set<string>([...data.settings.incomeCategories, ...data.settings.expenseCategories]);
    for (const t of data.transactions) set.add(t.category);
    return [...set].sort();
  }, [data.settings.incomeCategories, data.settings.expenseCategories, data.transactions]);

  const pendingItems = useMemo(() => {
    const consults = data.consultations
      .filter((c) => c.status !== "cancelada" && c.status !== "nao_compareceu" && c.priceCents - paidFor(c.id, data.payments) > 0)
      .map((c) => ({
        key: `c-${c.id}`,
        kind: "consulta" as const,
        consulenteId: c.consulenteId,
        date: c.date,
        label: c.methodName,
        remaining: c.priceCents - paidFor(c.id, data.payments),
        consultation: c,
        work: null as SpiritualWork | null,
      }));
    const works = data.spiritualWorks
      .filter((w) => w.status !== "cancelado" && w.priceCents - paidForWork(w.id, data.workPayments) > 0)
      .map((w) => ({
        key: `w-${w.id}`,
        kind: "trabalho" as const,
        consulenteId: w.consulenteId,
        date: w.date,
        label: w.title,
        remaining: w.priceCents - paidForWork(w.id, data.workPayments),
        consultation: null as Consultation | null,
        work: w,
      }));
    return [...consults, ...works].sort((a, b) => b.remaining - a.remaining);
  }, [data.consultations, data.payments, data.spiritualWorks, data.workPayments]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await mutate(`/api/records/transactions/${deleteTarget}`, "DELETE");
      toast("Lançamento excluído.", "success");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="heading text-lg font-semibold">Financeiro</h2>
          <p className="muted text-xs">Entradas recebidas, despesas pagas, saldo e meta — sem misturar valores pendentes com dinheiro recebido.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setFormType("entrada")}>
            <Icon name="plus" size={14} /> Entrada
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setFormType("despesa")}>
            <Icon name="plus" size={14} /> Despesa
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setGoalOpen(true)}>
            <Icon name="star" size={14} /> Meta
          </button>
          {onOpenSpreadsheet ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={onOpenSpreadsheet}>
              <Icon name="table" size={14} /> Planilha
            </button>
          ) : null}
        </div>
      </div>

      <section className="card flex flex-wrap items-end gap-2 p-3">
        <Field label="Ano" className="w-24">
          <select
            className="select"
            value={year}
            onChange={(e) => {
              const next = Number(e.target.value);
              setYear(next);
              setMonthSel("all");
            }}
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mês" className="w-40">
          <select className="select" value={monthSel} onChange={(e) => setMonthSel(e.target.value)}>
            <option value="all">Ano inteiro</option>
            {Array.from({ length: 12 }, (_, i) => `${i + 1}`.padStart(2, "0")).map((m) => (
              <option key={m} value={m}>
                {monthLabel(`${year}-${m}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo" className="w-32">
          <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
            <option value="todas">Todas</option>
            <option value="entrada">Entradas</option>
            <option value="despesa">Despesas</option>
          </select>
        </Field>
        <Field label="Categoria" className="w-44">
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas</option>
            {categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <div className="min-w-[10rem] flex-1">
          <Field label="Buscar lançamento">
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Descrição ou observação" />
          </Field>
        </div>
        <span className="chip">Período: {aggregate.label}</span>
      </section>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Entradas recebidas" value={money(aggregate.receivedCents)} icon="coins" tone="success" hint={aggregate.label} />
        <StatCard label="Despesas pagas" value={money(aggregate.expensesCents)} icon="wallet" tone="danger" hint={aggregate.label} />
        <StatCard label="Saldo atual" value={money(aggregate.balanceCents)} icon="shield" tone="accent" hint="Inclui saldo inicial" />
        <StatCard label="A receber" value={money(aggregate.outstandingCents)} icon="clock" tone="warning" hint="Não somado ao saldo" />
        <StatCard label="Faturamento de consultas" value={money(aggregate.consultationIncomeCents)} icon="sparkles" hint="Somente pagamentos" />
        <StatCard
          label="Tempo trabalhado"
          value={secondsToWorkedLabel(aggregate.workedSeconds)}
          icon="timer"
          hint={`Cronômetro · ${aggregate.realizedCount} realizadas`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
        <section className="card p-4">
          <SectionTitle title="Meta financeira" subtitle={aggregate.label} icon="star" />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="card-muted p-2">
              <p className="muted text-[0.62rem] uppercase">Meta</p>
              <p className="text-sm font-semibold">{money(aggregate.goalCents)}</p>
            </div>
            <div className="card-muted p-2">
              <p className="muted text-[0.62rem] uppercase">Recebido</p>
              <p className="text-sm font-semibold text-emerald-600">{money(aggregate.receivedCents)}</p>
            </div>
            <div className="card-muted p-2">
              <p className="muted text-[0.62rem] uppercase">Restante</p>
              <p className="text-sm font-semibold">{money(missing)}</p>
            </div>
          </div>
          <div className="mt-3">
            <ProgressBar percent={goalPercent} label={`${goalPercent}% alcançado no período`} />
          </div>
          <button type="button" className="btn btn-outline btn-sm mt-3 w-full" onClick={() => setGoalOpen(true)}>
            Definir meta de {selectedMonth ? monthLabel(selectedMonth) : `um mês de ${year}`}
          </button>
          <p className="muted mt-2 text-[0.68rem] leading-snug">
            A meta considera apenas entradas efetivamente recebidas no período. Despesas aparecem separadamente e não são misturadas ao faturamento.
          </p>
        </section>

        <section className="card p-4">
          <SectionTitle title="Valores a receber" subtitle="Consultas, trabalhos e terapias pendentes ou parciais" icon="clock" />
          {pendingItems.length ? (
            <ul className="space-y-1.5">
              {pendingItems.slice(0, 6).map((item) => (
                <li key={item.key} className="card-muted flex flex-wrap items-center justify-between gap-2 p-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {data.consulentes.find((c) => c.id === item.consulenteId)?.name ?? "Consulente"}
                    </p>
                    <p className="muted">
                      {formatDateBR(item.date)} · {item.label} ({item.kind === "trabalho" ? "Trabalho/Terapia" : "Consulta"})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{money(item.remaining)}</span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        if (item.consultation) onPay(item.consultation);
                        else if (item.work) setPayWorkTarget(item.work);
                      }}
                    >
                      Receber
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted text-sm">Nenhum valor pendente. Todos os atendimentos e trabalhos estão quitados. ✨</p>
          )}
          <div className="mt-3 rounded-lg p-2 text-xs" style={{ background: "var(--primary-soft)" }}>
            Saldo inicial configurado: <strong>{money(data.settings.initialBalanceCents)}</strong>
            <span className="muted block text-[0.68rem]">Saldo atual = saldo inicial + entradas recebidas − despesas pagas. Pendências não entram no saldo.</span>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <SectionTitle title="Movimentações" subtitle={`${rows.length} lançamento(s) em ${aggregate.label}`} icon="chart" />
          <div className="flex gap-1.5">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setFormType("entrada")}>
              <Icon name="plus" size={13} /> Entrada
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setFormType("despesa")}>
              <Icon name="plus" size={13} /> Despesa
            </button>
          </div>
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Forma</th>
                  <th>Origem</th>
                  <th className="text-right">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDateBR(t.date)}</td>
                    <td>
                      <span className="font-medium">{t.description}</span>
                      {t.notes ? <span className="muted block text-[0.68rem]">{t.notes}</span> : null}
                    </td>
                    <td>{t.category}</td>
                    <td>{t.paymentMethod}</td>
                    <td>
                      {t.paymentId ? (
                        <span className="chip">Consulta</span>
                      ) : t.workPaymentId ? (
                        <span className="chip">Trabalho/Terapia</span>
                      ) : (
                        <span className="chip">Manual</span>
                      )}
                    </td>
                    <td className={cx("text-right font-semibold", t.type === "entrada" ? "text-emerald-600" : "text-rose-500")}>
                      {t.type === "entrada" ? "+" : "−"} {money(t.amountCents)}
                    </td>
                    <td>
                      {t.paymentId ? (
                        <span className="muted text-[0.65rem]">estorno na consulta</span>
                      ) : t.workPaymentId ? (
                        <span className="muted text-[0.65rem]">estorno no trabalho</span>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(t.id)} aria-label="Excluir lançamento">
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="wallet"
            title="Nenhum lançamento neste período"
            message="Registre uma entrada ou despesa manual, ou registre pagamentos nas consultas para gerar entradas automaticamente."
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setFormType("entrada")}>
                <Icon name="plus" size={14} /> Nova entrada
              </button>
            }
          />
        )}
      </section>

      <TransactionModal type={formType} onClose={() => setFormType(null)} />
      <GoalModal open={goalOpen} month={selectedMonth ?? monthKey()} onClose={() => setGoalOpen(false)} />
      <WorkPaymentModal work={payWorkTarget} onClose={() => setPayWorkTarget(null)} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir lançamento"
        message="Lançamentos manuais podem ser excluídos. Lançamentos vinculados a pagamentos de consultas são preservados por integridade do histórico."
        confirmLabel="Excluir"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function TransactionModal({ type, onClose }: { type: "entrada" | "despesa" | null; onClose: () => void }) {
  const { data, mutate, toast } = useApp();
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [idKey, setIdKey] = useState("");

  const baseCategories = type === "despesa" ? data.settings.expenseCategories : data.settings.incomeCategories;

  useEffect(() => {
    if (!type) return;
    setDescription("");
    setValue("");
    setDate(todayISO());
    setCategory(type === "despesa" ? baseCategories[0] ?? "Outros" : "Consultas");
    setNewCategory("");
    setPaymentMethod("Pix");
    setNotes("");
    setError(null);
    setIdKey(uid("tx"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  if (!type) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cents = parseMoneyToCents(value);
    if (description.trim().length < 2) {
      setError("Descreva o lançamento.");
      return;
    }
    if (cents <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    const finalCategory = newCategory.trim() || category;
    setSaving(true);
    try {
      await mutate("/api/records/transactions", "POST", {
        type,
        description,
        amountCents: cents,
        date,
        category: finalCategory,
        paymentMethod,
        notes,
        idempotencyKey: idKey,
      });
      if (newCategory.trim() && !baseCategories.includes(newCategory.trim())) {
        const key = type === "despesa" ? "expenseCategories" : "incomeCategories";
        await mutate("/api/settings", "PATCH", { [key]: [...baseCategories, newCategory.trim()] });
      }
      toast(`${type === "despesa" ? "Despesa" : "Entrada"} registrada no financeiro.`, "success");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(type)}
      onClose={onClose}
      title={type === "despesa" ? "Nova despesa" : "Nova entrada"}
      subtitle={type === "despesa" ? "Despesas reduzem o saldo quando registradas." : "Entradas manuais não estão vinculadas a consultas."}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="transaction-form" className="btn btn-primary" disabled={saving}>
            <Icon name="save" size={14} /> {saving ? "Salvando..." : "Registrar"}
          </button>
        </>
      }
    >
      <form id="transaction-form" className="space-y-3" onSubmit={submit}>
        {error ? <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</div> : null}
        <Field label="Descrição" required>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === "despesa" ? "Ex.: Velas e incensos" : "Ex.: Venda de baralho"} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor" required>
            <input className="input" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </Field>
          <Field label={type === "despesa" ? "Data da despesa" : "Data do recebimento"} required>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoria">
            <select className="select" value={category} onChange={(e) => { setCategory(e.target.value); setNewCategory(""); }}>
              {baseCategories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Forma de pagamento">
            <select className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {(data.settings.paymentMethods.length ? data.settings.paymentMethods : PAYMENT_METHOD_OPTIONS).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Nova categoria (opcional)" hint="Se preenchida, será criada e salva nas suas preferências.">
          <input className="input" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Ex.: Cursos" />
        </Field>
        <Field label="Observações">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function GoalModal({ open, month, onClose }: { open: boolean; month: string; onClose: () => void }) {
  const { data, mutate, toast, money } = useApp();
  const [targetMonth, setTargetMonth] = useState(month);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTargetMonth(month);
    const existing = data.goals.find((g) => g.month === month)?.amountCents ?? data.settings.monthlyGoalCents;
    setAmount(centsToInput(existing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await mutate("/api/records/goals", "POST", { month: targetMonth, amountCents: parseMoneyToCents(amount) });
      toast(`Meta de ${monthLabel(targetMonth)} definida.`, "success");
      onClose();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const history = [...data.goals].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Meta financeira mensal"
      subtitle="O progresso usa apenas entradas efetivamente recebidas no mês."
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="goal-form" className="btn btn-primary" disabled={saving}>
            <Icon name="save" size={14} /> Salvar meta
          </button>
        </>
      }
    >
      <form id="goal-form" className="space-y-3" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mês de referência" required>
            <input type="month" className="input" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
          </Field>
          <Field label="Valor da meta" required>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        {history.length ? (
          <div>
            <p className="muted mb-1 text-[0.7rem] font-bold uppercase">Metas configuradas</p>
            <ul className="space-y-1 text-xs">
              {history.map((g) => (
                <li key={g.id} className="flex justify-between">
                  <span>{monthLabel(g.month)}</span>
                  <span className="font-medium">{money(g.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
