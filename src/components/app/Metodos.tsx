"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ConfirmDialog, EmptyState, Field, Icon, Modal, Toggle, cx } from "@/components/ui";
import { centsToInput, formatDateBR, parseMoneyToCents } from "@/lib/format";
import { methodStats } from "@/lib/metrics";
import type { Method } from "@/lib/types";

export function Metodos() {
  const { data, money, mutate, toast } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "ativos" | "inativos" | "arquivados">("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Method | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Method | null>(null);

  const stats = useMemo(() => methodStats(data.methods, data.consultations, data.payments), [data]);

  const filtered = stats.filter(({ method }) => {
    if (filter === "ativos" && (!method.active || method.archived)) return false;
    if (filter === "inativos" && (method.active || method.archived)) return false;
    if (filter === "arquivados" && !method.archived) return false;
    if (!search) return true;
    return method.name.toLowerCase().includes(search.toLowerCase()) || (method.description ?? "").toLowerCase().includes(search.toLowerCase());
  });

  const toggleActive = async (method: Method) => {
    try {
      await mutate(`/api/records/methods/${method.id}`, "PATCH", { active: !method.active });
      toast(method.active ? "Método desativado — não pode ser escolhido em novos agendamentos." : "Método reativado.", "success");
    } catch (error) {
      toast((error as Error).message, "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await mutate(`/api/records/methods/${deleteTarget.id}`, "DELETE");
      toast(String(result.message ?? "Método excluído."), "success");
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
          <h2 className="heading text-lg font-semibold">Métodos de tiragem</h2>
          <p className="muted text-xs">Preços atuais e faturamento histórico calculado pelas consultas realizadas.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Icon name="plus" size={14} /> Novo método
        </button>
      </div>

      <div className="card flex flex-wrap items-end gap-2 p-3">
        <div className="min-w-[12rem] flex-1">
          <Field label="Pesquisar método">
            <div className="relative">
              <input className="input pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: Cruz Celta" />
              <span className="absolute left-2.5 top-2.5 muted">
                <Icon name="search" size={15} />
              </span>
            </div>
          </Field>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["todos", "ativos", "inativos", "arquivados"] as const).map((option) => (
            <button key={option} type="button" className={cx("chip capitalize", filter === option && "chip-active")} onClick={() => setFilter(option)}>
              {option}
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {filtered.map(({ method, realized, scheduled, revenueCents }) => (
            <div key={method.id} className="card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{method.name}</p>
                  <p className="muted line-clamp-2 text-xs">{method.description || "Sem descrição"}</p>
                </div>
                <span className={cx("chip", method.active && !method.archived ? "chip-active" : "")}>
                  {method.archived ? "Arquivado" : method.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                <div className="card-muted p-1.5">
                  <p className="muted text-[0.62rem] uppercase">Valor</p>
                  <p className="font-semibold">{money(method.priceCents)}</p>
                </div>
                <div className="card-muted p-1.5">
                  <p className="muted text-[0.62rem] uppercase">Duração</p>
                  <p className="font-semibold">{method.durationMinutes} min</p>
                </div>
                <div className="card-muted p-1.5">
                  <p className="muted text-[0.62rem] uppercase">Realizadas</p>
                  <p className="font-semibold">{realized}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                <p className="muted text-[0.68rem]">
                  Faturamento histórico: <strong style={{ color: "var(--text)" }}>{money(revenueCents)}</strong> · {scheduled} agendada(s)
                </p>
                <div className="flex gap-1">
                  <button type="button" className={cx("btn btn-ghost btn-sm", method.active && "text-emerald-600")} onClick={() => void toggleActive(method)}>
                    <Icon name={method.active ? "ban" : "check"} size={13} /> {method.active ? "Desativar" : "Ativar"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(method); setFormOpen(true); }}>
                    <Icon name="edit" size={13} />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(method)}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
              <p className="muted mt-1 text-[0.65rem]">
                Criado em {formatDateBR(method.createdAt)} · atualizado em {formatDateBR(method.updatedAt)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <section className="card">
          <EmptyState
            icon="moon"
            title="Cadastre seus métodos de tiragem"
            message="Cada método tem valor e duração próprios. O valor é copiado para a consulta no momento do agendamento e não muda depois."
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Icon name="plus" size={14} /> Criar método
              </button>
            }
          />
        </section>
      )}

      <MethodFormModal open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir método"
        message="Métodos já usados em consultas não são apagados: eles são desativados e arquivados para preservar o histórico e os valores originais."
        confirmLabel="Excluir/arquivar"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function MethodFormModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Method | null }) {
  const { mutate, toast } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setPrice(centsToInput(editing?.priceCents ?? 0));
    setDuration(String(editing?.durationMinutes ?? 60));
    setActive(editing?.active ?? true);
    setError(null);
  }, [open, editing]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Informe o nome do método.");
      return;
    }
    setSaving(true);
    try {
      const payload = { name, description, priceCents: parseMoneyToCents(price), durationMinutes: Number(duration) || 60, active };
      if (editing) await mutate(`/api/records/methods/${editing.id}`, "PATCH", payload);
      else await mutate("/api/records/methods", "POST", payload);
      toast(editing ? "Método atualizado. Consultas antigas mantêm o valor original." : "Método criado.", "success");
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
      title={editing ? "Editar método" : "Novo método"}
      subtitle="O preço cadastrado aqui é usado apenas em novos agendamentos."
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="method-form" className="btn btn-primary" disabled={saving}>
            <Icon name="save" size={14} /> {saving ? "Salvando..." : "Salvar método"}
          </button>
        </>
      }
    >
      <form id="method-form" className="space-y-3" onSubmit={submit}>
        {error ? <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</div> : null}
        <Field label="Nome do método" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Cruz Celta" />
        </Field>
        <Field label="Descrição">
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Como funciona, o que inclui..." />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor padrão" required hint="Em reais, sem símbolo. Ex.: 220,00">
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Duração estimada (min)" required>
            <input type="number" min={5} max={600} className="input" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
        </div>
        <Toggle checked={active} onChange={setActive} label="Método ativo" hint="Inativos não aparecem para novos agendamentos." />
      </form>
    </Modal>
  );
}
