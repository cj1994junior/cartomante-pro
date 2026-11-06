"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ClientOriginField } from "@/components/app/ClientOriginField";
import { ConfirmDialog, Field, Icon, Modal } from "@/components/ui";
import {
  CONSULTATION_STATUS,
  PAYMENT_METHOD_OPTIONS,
  centsToInput,
  formatDateBR,
  formatStopwatch,
  minutesToTime,
  parseMoneyToCents,
  secondsToWorkedLabel,
  timeToMinutes,
  todayISO,
  uid,
} from "@/lib/format";
import type { ClientOrigin, Consultation } from "@/lib/types";

const STATUS_OPTIONS = Object.entries(CONSULTATION_STATUS) as [Consultation["status"], { label: string }][];

export function ConsultationFormModal({
  open,
  onClose,
  consultation,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  consultation?: Consultation | null;
  defaultDate?: string;
}) {
  const { data, mutate, toast, money } = useApp();
  const activeMethods = data.methods.filter((m) => !m.archived);
  const consulentes = data.consulentes.filter((c) => !c.archived);
  const [consulenteId, setConsulenteId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [date, setDate] = useState(defaultDate ?? todayISO());
  const [startTime, setStartTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [manualWorkedMinutes, setManualWorkedMinutes] = useState("");
  const [workedTouched, setWorkedTouched] = useState(false);
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<Consultation["status"]>("agendada");
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickOrigin, setQuickOrigin] = useState<ClientOrigin>("nao_informado");
  const [duplicates, setDuplicates] = useState<{ id: number; name: string; phone: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedMethod = useMemo(() => data.methods.find((m) => m.id === Number(methodId)) ?? null, [data.methods, methodId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setQuickOpen(false);
    setQuickOrigin("nao_informado");
    setDuplicates([]);
    setWorkedTouched(false);
    if (consultation) {
      setConsulenteId(String(consultation.consulenteId));
      setMethodId(consultation.methodId ? String(consultation.methodId) : "");
      setDate(consultation.date);
      setStartTime(consultation.startTime);
      setDuration(String(consultation.durationMinutes));
      setManualWorkedMinutes(consultation.actualSeconds > 0 ? String(Math.round(consultation.actualSeconds / 60)) : "");
      setPrice(centsToInput(consultation.priceCents));
      setStatus(consultation.status);
      setPaymentMethod(consultation.paymentMethod ?? "Pix");
      setNotes(consultation.notes ?? "");
    } else {
      const firstMethod = activeMethods[0];
      setConsulenteId(consulentes[0] ? String(consulentes[0].id) : "");
      setMethodId(firstMethod ? String(firstMethod.id) : "");
      setDate(defaultDate ?? todayISO());
      setStartTime("10:00");
      setDuration(firstMethod ? String(firstMethod.durationMinutes) : "60");
      setManualWorkedMinutes("");
      setPrice(firstMethod ? centsToInput(firstMethod.priceCents) : "");
      setStatus("agendada");
      setPaymentMethod("Pix");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, consultation?.id, defaultDate]);

  const changeMethod = (value: string) => {
    setMethodId(value);
    const method = data.methods.find((m) => m.id === Number(value));
    if (method) {
      setPrice(centsToInput(method.priceCents));
      setDuration(String(method.durationMinutes));
    }
  };

  const endTime = minutesToTime(timeToMinutes(startTime || "00:00") + Math.max(5, Number(duration) || 60));

  const createQuickConsulente = async (force = false) => {
    if (quickName.trim().length < 2) {
      setError("Informe o nome da consulente.");
      return;
    }
    try {
      const result = await mutate("/api/records/consulentes", "POST", { name: quickName, phone: quickPhone, origin: quickOrigin, force });
      const record = result.record as { id: number };
      setConsulenteId(String(record.id));
      setQuickOpen(false);
      setQuickName("");
      setQuickPhone("");
      setQuickOrigin("nao_informado");
      setDuplicates([]);
      toast("Consulente cadastrada.", "success");
    } catch (err) {
      const extra = (err as Error & { extra?: { duplicates?: { id: number; name: string; phone: string | null }[] } }).extra;
      if (extra?.duplicates?.length) setDuplicates(extra.duplicates);
      setError((err as Error).message);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!consulenteId) {
      setError("Selecione ou cadastre uma consulente.");
      return;
    }
    if (!methodId) {
      setError("Selecione o método de tiragem.");
      return;
    }
    if (!date) {
      setError("Informe a data da consulta.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        consulenteId: Number(consulenteId),
        methodId: Number(methodId),
        date,
        startTime,
        durationMinutes: Number(duration) || 60,
        priceCents: parseMoneyToCents(price),
        status,
        paymentMethod,
        notes,
      };
      if (workedTouched) {
        const mins = Math.max(0, Number(manualWorkedMinutes) || 0);
        payload.actualSeconds = Math.round(mins * 60);
      }
      if (consultation) await mutate(`/api/records/consultations/${consultation.id}`, "PATCH", payload);
      else await mutate("/api/records/consultations", "POST", payload);
      toast(consultation ? "Consulta atualizada e lembretes reprogramados." : "Consulta agendada com sucesso.", "success");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={consultation ? "Editar consulta" : "Nova consulta"}
      subtitle="Os lembretes são recalculados automaticamente ao salvar data e horário."
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="consultation-form" className="btn btn-primary" disabled={saving}>
            <Icon name="save" size={15} /> {saving ? "Salvando..." : consultation ? "Salvar alterações" : "Agendar consulta"}
          </button>
        </>
      }
    >
      <form id="consultation-form" className="space-y-3" onSubmit={submit}>
        {error ? (
          <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</div>
        ) : null}
        {!consulentes.length && !quickOpen ? (
          <div className="rounded-lg border p-2 text-xs" style={{ borderColor: "var(--border)" }}>
            Nenhuma consulente cadastrada ainda. Use o botão abaixo para cadastrar a primeira sem sair do formulário.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Field label="Consulente" required>
              <select className="select" value={consulenteId} onChange={(e) => setConsulenteId(e.target.value)}>
                <option value="">Selecione...</option>
                {consulentes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-1"
              onClick={() => setQuickOpen((v) => !v)}
            >
              <Icon name="userPlus" size={14} /> Cadastrar nova consulente
            </button>
          </div>
          <Field label="Método de tiragem" required hint={selectedMethod ? `Duração padrão: ${selectedMethod.durationMinutes} min · catálogo ${money(selectedMethod.priceCents)}` : "Cadastre métodos na aba Métodos."}>
            <select className="select" value={methodId} onChange={(e) => changeMethod(e.target.value)}>
              <option value="">Selecione...</option>
              {data.methods.map((m) => (
                <option key={m.id} value={m.id} disabled={(m.archived || !m.active) && consultation?.methodId !== m.id}>
                  {m.name} {m.archived ? "(arquivado)" : !m.active ? "(inativo)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {quickOpen ? (
          <div className="card-muted space-y-2 p-3">
            <p className="text-xs font-semibold">Cadastro rápido de consulente</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Nome completo" required>
                <input className="input" value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Ex.: Maria Silva" />
              </Field>
              <Field label="Telefone (opcional)">
                <input className="input" value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} placeholder="(11) 90000-0000" />
              </Field>
            </div>
            <ClientOriginField value={quickOrigin} onChange={setQuickOrigin} />
            {duplicates.length ? (
              <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-2 text-xs">
                <p className="font-semibold">Cadastro parecido encontrado:</p>
                <ul className="mt-1 space-y-1">
                  {duplicates.map((d) => (
                    <li key={d.id}>
                      {d.name} {d.phone ? `· ${d.phone}` : ""}
                      <button type="button" className="btn btn-outline btn-sm ml-2" onClick={() => { setConsulenteId(String(d.id)); setQuickOpen(false); setDuplicates([]); }}>
                        Usar esta
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => void createQuickConsulente(true)}>
                  Criar nova mesmo assim
                </button>
              </div>
            ) : null}
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void createQuickConsulente(false)}>
                Salvar consulente
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuickOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Data" required>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Início" required>
            <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Duração estimada (min)" hint={`Término previsto: ${endTime}`}>
            <input type="number" min={5} max={600} className="input" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
          <Field
            label="Tempo trabalhado (min)"
            hint={
              consultation && consultation.actualSeconds > 0
                ? `Cronômetro: ${secondsToWorkedLabel(consultation.actualSeconds)} (${formatStopwatch(consultation.actualSeconds)})`
                : "Medido pelo cronômetro ao iniciar"
            }
          >
            <input
              type="number"
              min={0}
              max={600}
              className="input"
              value={manualWorkedMinutes}
              placeholder="Automático"
              onChange={(e) => {
                setManualWorkedMinutes(e.target.value);
                setWorkedTouched(true);
              }}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Valor da consulta"
            hint={selectedMethod ? `Valor de catálogo registrado: ${money(selectedMethod.priceCents)}` : "Preenchido pelo método escolhido"}
          >
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </Field>
          <Field label="Status do atendimento">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as Consultation["status"])}>
              {STATUS_OPTIONS.map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Forma de pagamento prevista">
            <select className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Observações">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Preferências, perguntas trazidas, combinados..." />
        </Field>

        <p className="muted text-[0.7rem] leading-snug">
          O valor do catálogo fica registrado no histórico desta consulta. Alterações futuras no preço do método não modificam consultas antigas.
          Consultas realizadas não geram entrada financeira automaticamente — use “Registrar pagamento”.
        </p>
      </form>
    </Modal>
  );
}

export function PaymentModal({ consultation, onClose }: { consultation: Consultation | null; onClose: () => void }) {
  const { data, mutate, toast, money } = useApp();
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [method, setMethod] = useState("Pix");
  const [notes, setNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<{ id: number; amountCents: number } | null>(null);

  const payments = consultation ? data.payments.filter((p) => p.consultationId === consultation.id) : [];
  const paid = payments.reduce((a, p) => a + p.amountCents, 0);
  const remaining = consultation ? Math.max(0, consultation.priceCents - paid) : 0;
  const consulenteName = consultation ? data.consulentes.find((c) => c.id === consultation.consulenteId)?.name ?? "Consulente" : "";

  useEffect(() => {
    if (!consultation) return;
    setAmount(centsToInput(Math.max(0, consultation.priceCents - paid)));
    setPaidAt(todayISO());
    setMethod(consultation.paymentMethod ?? "Pix");
    setNotes("");
    setIdempotencyKey(uid("pay"));
    setError(null);
    setRefundTarget(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultation?.id]);

  if (!consultation) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cents = parseMoneyToCents(amount);
    if (cents <= 0) {
      setError("Informe o valor recebido.");
      return;
    }
    if (cents > remaining) {
      setError(`O valor excede o saldo restante de ${money(remaining)}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await mutate("/api/records/payments", "POST", {
        consultationId: consultation.id,
        amountCents: cents,
        paidAt,
        method,
        notes,
        idempotencyKey,
        paymentMethodLabel: method,
        kind: "pagamento",
      });
      toast(result.duplicate ? "Este pagamento já estava registrado — nenhum lançamento duplicado foi criado." : "Pagamento registrado e entrada financeira criada.", result.duplicate ? "info" : "success");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const refund = async () => {
    if (!refundTarget) return;
    try {
      await mutate("/api/records/payments", "POST", {
        consultationId: consultation.id,
        amountCents: refundTarget.amountCents,
        kind: "estorno",
        paidAt: todayISO(),
        method,
        notes: "Estorno solicitado a partir do painel de pagamentos.",
        idempotencyKey: uid("refund"),
      });
      toast("Estorno registrado com histórico preservado.", "success");
      setRefundTarget(null);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setRefundTarget(null);
    }
  };

  return (
    <Modal
      open={Boolean(consultation)}
      onClose={onClose}
      title="Registrar pagamento"
      subtitle={`${consulenteName} · ${formatDateBR(consultation.date)} às ${consultation.startTime} · ${consultation.methodName}`}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fechar
          </button>
          <button type="submit" form="payment-form" className="btn btn-primary" disabled={saving || remaining === 0}>
            <Icon name="coins" size={15} /> {saving ? "Registrando..." : "Registrar pagamento"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card-muted p-2">
          <p className="muted text-[0.65rem] uppercase">Valor</p>
          <p className="text-sm font-semibold">{money(consultation.priceCents)}</p>
        </div>
        <div className="card-muted p-2">
          <p className="muted text-[0.65rem] uppercase">Pago</p>
          <p className="text-sm font-semibold text-emerald-600">{money(paid)}</p>
        </div>
        <div className="card-muted p-2">
          <p className="muted text-[0.65rem] uppercase">Restante</p>
          <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{money(remaining)}</p>
        </div>
      </div>

      <form id="payment-form" className="mt-3 space-y-3" onSubmit={submit}>
        {error ? <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</div> : null}
        {remaining === 0 ? (
          <p className="rounded-lg border border-emerald-400/50 bg-emerald-500/10 p-2 text-xs text-emerald-700">
            Esta consulta está totalmente paga. Use o estorno abaixo se precisar corrigir um valor.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor recebido" required hint="Aceita pagamento integral ou parcial.">
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Data do recebimento" required>
            <input type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Forma de pagamento">
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
              {(data.settings.paymentMethods.length ? data.settings.paymentMethods : PAYMENT_METHOD_OPTIONS).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Observação">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: restante combinado para dia 20" />
          </Field>
        </div>
        <p className="muted text-[0.7rem] leading-snug">
          Cada pagamento possui um identificador próprio e gera <strong>uma única</strong> entrada financeira. Se você registrar novamente o mesmo
          pagamento, o app avisa e não duplica o lançamento.
        </p>
      </form>

      <div className="mt-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Pagamentos registrados
        </p>
        {payments.length ? (
          <ul className="space-y-1.5">
            {payments.map((payment) => (
              <li key={payment.id} className="card-muted flex items-center justify-between gap-2 p-2 text-xs">
                <div>
                  <p className="font-semibold">
                    {payment.kind === "estorno" ? "Estorno" : "Pagamento"} de {money(Math.abs(payment.amountCents))}
                  </p>
                  <p className="muted">
                    {formatDateBR(payment.paidAt)} · {payment.method}
                    {payment.notes ? ` · ${payment.notes}` : ""}
                  </p>
                </div>
                {payment.kind === "pagamento" ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefundTarget({ id: payment.id, amountCents: Math.abs(payment.amountCents) })}>
                    Estornar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-xs">Nenhum pagamento registrado ainda.</p>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(refundTarget)}
        title="Registrar estorno"
        message={`O estorno de ${money(refundTarget?.amountCents ?? 0)} cria um lançamento compensatório e preserva o histórico do pagamento original. Deseja continuar?`}
        confirmLabel="Registrar estorno"
        onClose={() => setRefundTarget(null)}
        onConfirm={() => void refund()}
      />
    </Modal>
  );
}
