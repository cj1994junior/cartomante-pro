"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ClientOriginField } from "@/components/app/ClientOriginField";
import { ConfirmDialog, EmptyState, Field, Icon, Modal, StatCard, cx } from "@/components/ui";
import { CLIENT_ORIGIN_OPTIONS, clientOriginLabel, isClientOrigin } from "@/lib/client-origins";
import { CONSULTATION_STATUS, PAYMENT_STATUS, WORK_KIND, WORK_STATUS, formatDateBR, todayISO } from "@/lib/format";
import { consulenteStats, paidFor, paidForWork } from "@/lib/metrics";
import type { ClientOrigin, Consulente, WhatsAppTarget } from "@/lib/types";

export function Consulentes({
  onOpenSpreadsheet,
  onWhatsApp,
}: {
  onOpenSpreadsheet?: () => void;
  onWhatsApp?: (target: WhatsAppTarget) => void;
}) {
  const { data, money, mutate, toast } = useApp();
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<ClientOrigin | "">("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Consulente | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Consulente | null>(null);

  const stats = useMemo(
    () =>
      data.consulentes.map((c) =>
        consulenteStats(c, data.consultations, data.payments, data.spiritualWorks, data.workPayments),
      ),
    [data.consulentes, data.consultations, data.payments, data.spiritualWorks, data.workPayments],
  );

  const filtered = stats.filter((s) => {
    if (!showArchived && s.consulente.archived) return false;
    if (showArchived && !s.consulente.archived) return false;
    const origin = isClientOrigin(s.consulente.origin) ? s.consulente.origin : "nao_informado";
    if (originFilter && origin !== originFilter) return false;
    const term = search.toLowerCase();
    if (!term) return true;
    return s.consulente.name.toLowerCase().includes(term) || (s.consulente.phone ?? "").includes(term);
  });

  const profile = profileId ? stats.find((s) => s.consulente.id === profileId) : null;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await mutate(`/api/records/consulentes/${deleteTarget.id}`, "DELETE");
      toast(String(result.message ?? "Cadastro excluído."), "success");
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
          <h2 className="heading text-lg font-semibold">Consulentes</h2>
          <p className="muted text-xs">Perfis completos com histórico calculado a partir das consultas e pagamentos reais.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {onOpenSpreadsheet ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={onOpenSpreadsheet}>
              <Icon name="table" size={14} /> Planilha padrão
            </button>
          ) : null}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Icon name="userPlus" size={14} /> Nova consulente
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-2 p-3">
        <div className="min-w-[12rem] flex-1">
          <Field label="Buscar por nome ou telefone">
            <div className="relative">
              <input className="input pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: Maria" />
              <span className="absolute left-2.5 top-2.5 muted">
                <Icon name="search" size={15} />
              </span>
            </div>
          </Field>
        </div>
        <Field label="Origem" className="w-40">
          <select className="select" value={originFilter} onChange={(event) => setOriginFilter(event.target.value as ClientOrigin | "")}>
            <option value="">Todas as origens</option>
            {CLIENT_ORIGIN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <button type="button" className={cx("btn btn-outline btn-sm", showArchived && "nav-link-active")} onClick={() => setShowArchived((v) => !v)}>
          <Icon name={showArchived ? "users" : "ban"} size={14} /> {showArchived ? "Ver ativas" : "Ver arquivadas"}
        </button>
        <span className="chip">{filtered.length} cadastro(s)</span>
      </div>

      {filtered.length ? (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((stat) => (
            <div key={stat.consulente.id} className="card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{stat.consulente.name}</p>
                  <p className="muted text-xs">{stat.consulente.phone ?? "Sem telefone"}</p>
                  <p className="muted mt-0.5 text-[0.7rem]">Origem: {clientOriginLabel(stat.consulente.origin)}</p>
                </div>
                <span className="chip">{stat.realizada} realizada(s)</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[0.7rem]">
                <p className="muted">Última consulta: <span className="font-medium" style={{ color: "var(--text)" }}>{formatDateBR(stat.lastRealized)}</span></p>
                <p className="muted">Futuras: <span className="font-medium" style={{ color: "var(--text)" }}>{stat.futura}</span></p>
                <p className="muted">Total pago: <span className="font-medium" style={{ color: "var(--text)" }}>{money(stat.paidCents)}</span></p>
                <p className="muted">Pendente: <span className="font-medium" style={{ color: stat.pendingCents ? "var(--accent)" : "var(--text)" }}>{money(stat.pendingCents)}</span></p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setProfileId(stat.consulente.id)}>
                  <Icon name="eye" size={13} /> Perfil
                </button>
                {onWhatsApp ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ borderColor: "color-mix(in srgb, #1f8a4c 40%, var(--border))", color: "#1f8a4c" }}
                    onClick={() => onWhatsApp({ consulenteId: stat.consulente.id })}
                    title="Enviar mensagem pré-programada no WhatsApp"
                  >
                    <Icon name="whatsapp" size={13} /> WhatsApp
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(stat.consulente); setFormOpen(true); }}>
                  <Icon name="edit" size={13} /> Editar
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(stat.consulente)}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <section className="card">
          <EmptyState
            icon="users"
            title={search || originFilter ? "Nenhuma consulente encontrada" : showArchived ? "Nenhum cadastro arquivado" : "Cadastre sua primeira consulente"}
            message={
              search || originFilter
                ? "Tente outro nome, telefone ou origem."
                : "Cadastre nome, telefone e origem. O histórico e os valores são calculados automaticamente."
            }
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Icon name="userPlus" size={14} /> Cadastrar consulente
              </button>
            }
          />
        </section>
      )}

      <ConsulenteFormModal open={formOpen} onClose={() => setFormOpen(false)} editing={editing} onOpenProfile={(id) => setProfileId(id)} />

      <Modal
        open={Boolean(profile)}
        onClose={() => setProfileId(null)}
        title={profile?.consulente.name ?? "Perfil"}
        subtitle={profile?.consulente.phone ?? "Sem telefone cadastrado"}
        wide
        footer={
          profile ? (
            <>
              {onWhatsApp ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ borderColor: "color-mix(in srgb, #1f8a4c 40%, var(--border))", color: "#1f8a4c" }}
                  onClick={() => {
                    const id = profile.consulente.id;
                    setProfileId(null);
                    onWhatsApp({ consulenteId: id });
                  }}
                >
                  <Icon name="whatsapp" size={14} /> Enviar WhatsApp
                </button>
              ) : null}
              <button type="button" className="btn btn-outline" onClick={() => { setEditing(profile.consulente); setProfileId(null); setFormOpen(true); }}>
                <Icon name="edit" size={14} /> Editar cadastro
              </button>
              <button type="button" className="btn btn-danger" onClick={() => { setDeleteTarget(profile.consulente); setProfileId(null); }}>
                <Icon name="trash" size={14} /> Excluir
              </button>
            </>
          ) : null
        }
      >
        {profile ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Total de consultas" value={profile.total} icon="calendar" />
              <StatCard label="Realizadas" value={profile.realizada} tone="success" icon="check" />
              <StatCard label="Futuras" value={profile.futura} tone="accent" icon="clock" />
              <StatCard label="Canceladas" value={profile.cancelada} tone="danger" icon="ban" />
              <StatCard label="Faltas" value={profile.falta} tone="warning" icon="alert" />
              <StatCard label="Total pago" value={money(profile.paidCents)} tone="success" icon="coins" />
              <StatCard label="Pendente" value={money(profile.pendingCents)} tone="warning" icon="wallet" />
              <StatCard label="Método favorito" value={profile.favoriteMethod ?? "—"} icon="moon" tone="accent" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Histórico por método</p>
                {profile.methodUsage.length ? (
                  <ul className="space-y-1 text-xs">
                    {profile.methodUsage.map((item) => (
                      <li key={item.name} className="flex items-center justify-between gap-2">
                        <span>{item.name}</span>
                        <span className="chip">{item.count} utilização(ões)</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted text-xs">Nenhuma consulta registrada.</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Dados do cadastro</p>
                <ul className="muted space-y-1 text-xs">
                  <li>Cadastro em: {formatDateBR(profile.consulente.createdAt.slice(0, 10))}</li>
                  <li>Primeira consulta: {formatDateBR(profile.first)}</li>
                  <li>Última consulta realizada: {formatDateBR(profile.lastRealized)}</li>
                  <li>Telefone: {profile.consulente.phone ?? "não informado"}</li>
                  <li>Origem: {clientOriginLabel(profile.consulente.origin)}</li>
                  <li>Observações: {profile.consulente.notes ?? "—"}</li>
                </ul>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Histórico completo de atendimentos</p>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Método</th>
                      <th>Valor</th>
                      <th>Pago</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.consultations
                      .filter((c) => c.consulenteId === profile.consulente.id)
                      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))
                      .map((c) => (
                        <tr key={c.id}>
                          <td>{formatDateBR(c.date)} {c.startTime}</td>
                          <td>{c.methodName}</td>
                          <td>{money(c.priceCents)}</td>
                          <td>{money(paidFor(c.id, data.payments))}</td>
                          <td>
                            <span className={cx("chip", CONSULTATION_STATUS[c.status].tone)}>{CONSULTATION_STATUS[c.status].label}</span>
                            <span className={cx("chip ml-1", PAYMENT_STATUS[c.paymentStatus].tone)}>{PAYMENT_STATUS[c.paymentStatus].label}</span>
                          </td>
                        </tr>
                      ))}
                    {!data.consultations.some((c) => c.consulenteId === profile.consulente.id) ? (
                      <tr>
                        <td colSpan={5} className="muted py-4 text-center">Nenhuma consulta registrada.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {data.spiritualWorks.some((w) => w.consulenteId === profile.consulente.id) ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Histórico de trabalhos, magias e terapias ({profile.worksTotal})
                </p>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Trabalho / Atividade</th>
                        <th>Valor</th>
                        <th>Pago</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.spiritualWorks
                        .filter((w) => w.consulenteId === profile.consulente.id)
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((w) => (
                          <tr key={w.id}>
                            <td>{formatDateBR(w.date)}</td>
                            <td>
                              <span className={cx("chip", WORK_KIND[w.kind].tone)}>{WORK_KIND[w.kind].short}</span>
                            </td>
                            <td>{w.title}</td>
                            <td>{money(w.priceCents)}</td>
                            <td>{money(paidForWork(w.id, data.workPayments))}</td>
                            <td>
                              <span className={cx("chip", WORK_STATUS[w.status].tone)}>{WORK_STATUS[w.status].label}</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            <p className="muted text-[0.68rem]">
              Números calculados automaticamente a partir dos registros reais. Consultas canceladas e faltas não entram como realizadas nem como
              dinheiro recebido. Perfil atualizado em {formatDateBR(todayISO())}.
            </p>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir consulente"
        message="A exclusão é definitiva apenas quando não existem consultas. Se houver histórico, o cadastro será arquivado para preservar os registros."
        confirmLabel="Excluir/arquivar"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function ConsulenteFormModal({
  open,
  onClose,
  editing,
  onOpenProfile,
}: {
  open: boolean;
  onClose: () => void;
  editing: Consulente | null;
  onOpenProfile: (id: number) => void;
}) {
  const { mutate, toast } = useApp();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [origin, setOrigin] = useState<ClientOrigin>("nao_informado");
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ id: number; name: string; phone: string | null }[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(editing?.name ?? "");
    setPhone(editing?.phone ?? "");
    setNotes(editing?.notes ?? "");
    setOrigin(isClientOrigin(editing?.origin) ? editing.origin : "nao_informado");
    setError(null);
    setDuplicates([]);
  };

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setPhone(editing?.phone ?? "");
    setNotes(editing?.notes ?? "");
    setOrigin(isClientOrigin(editing?.origin) ? editing.origin : "nao_informado");
    setError(null);
    setDuplicates([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const submit = async (event: React.FormEvent, force = false) => {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Informe o nome completo.");
      return;
    }
    setSaving(true);
    try {
      if (editing) await mutate(`/api/records/consulentes/${editing.id}`, "PATCH", { name, phone, notes, origin });
      else await mutate("/api/records/consulentes", "POST", { name, phone, notes, origin, force });
      toast(editing ? "Cadastro atualizado." : "Consulente cadastrada.", "success");
      reset();
      onClose();
    } catch (err) {
      const extra = (err as Error & { extra?: { duplicates?: { id: number; name: string; phone: string | null }[] } }).extra;
      setDuplicates(extra?.duplicates ?? []);
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={editing ? "Editar consulente" : "Nova consulente"}
      subtitle="O telefone é opcional. Antes de salvar verificamos cadastros parecidos para evitar duplicidade."
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={() => { reset(); onClose(); }}>
            Cancelar
          </button>
          <button type="submit" form="consulente-form" className="btn btn-primary" disabled={saving}>
            <Icon name="save" size={14} /> {saving ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form id="consulente-form" className="space-y-3" onSubmit={(e) => void submit(e)}>
        {error ? <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-2 text-xs">{error}</div> : null}
        {duplicates.length ? (
          <div className="space-y-2 rounded-lg border p-2 text-xs" style={{ borderColor: "var(--border)" }}>
            <p className="font-semibold">Possível duplicidade encontrada:</p>
            {duplicates.map((dup) => (
              <div key={dup.id} className="flex items-center justify-between gap-2">
                <span>{dup.name} {dup.phone ? `· ${dup.phone}` : ""}</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { onOpenProfile(dup.id); onClose(); }}>
                  Usar este cadastro
                </button>
              </div>
            ))}
            {!editing ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={(e) => void submit(e as unknown as React.FormEvent, true)}>
                Criar novo mesmo assim
              </button>
            ) : null}
          </div>
        ) : null}
        <Field label="Nome completo" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Maria Silva" />
        </Field>
        <Field label="Telefone com DDD" hint="Opcional. Usado apenas para contato e busca.">
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 90000-0000" />
        </Field>
        <ClientOriginField value={origin} onChange={setOrigin} />
        <Field label="Observações">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Preferências, indicações, combinados..." />
        </Field>
      </form>
    </Modal>
  );
}
