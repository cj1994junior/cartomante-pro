"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ClientOriginField } from "@/components/app/ClientOriginField";
import { ImagePickerField } from "@/components/app/ImagePicker";
import { ConfirmDialog, EmptyState, Field, Icon, Modal, StatCard, Toggle, cx } from "@/components/ui";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS,
  WORK_KIND,
  WORK_STATUS,
  addDaysISO,
  centsToInput,
  formatDateBR,
  parseMoneyToCents,
  todayISO,
  uid,
} from "@/lib/format";
import { paidForWork, workCatalogStats } from "@/lib/metrics";
import type { ClientOrigin, SpiritualWork, WhatsAppTarget, WorkCatalogItem, WorkKind, WorkStatus } from "@/lib/types";

type SubView = "registros" | "catalogo";

export function TrabalhosMagias({
  onOpenSpreadsheet,
  onWhatsApp,
}: {
  onOpenSpreadsheet: () => void;
  onWhatsApp?: (target: WhatsAppTarget) => void;
}) {
  const { data, money, mutate, toast } = useApp();
  const [subView, setSubView] = useState<SubView>("registros");
  const [kindFilter, setKindFilter] = useState<"" | WorkKind>("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [search, setSearch] = useState("");

  const [workForm, setWorkForm] = useState<{ open: boolean; editing: SpiritualWork | null; defaultKind: WorkKind }>({
    open: false,
    editing: null,
    defaultKind: "magia",
  });
  const [catalogForm, setCatalogForm] = useState<{ open: boolean; editing: WorkCatalogItem | null; defaultKind: WorkKind }>({
    open: false,
    editing: null,
    defaultKind: "magia",
  });
  const [payTarget, setPayTarget] = useState<SpiritualWork | null>(null);
  const [detailTarget, setDetailTarget] = useState<SpiritualWork | null>(null);
  const [deleteWorkTarget, setDeleteWorkTarget] = useState<SpiritualWork | null>(null);
  const [deleteCatalogTarget, setDeleteCatalogTarget] = useState<WorkCatalogItem | null>(null);

  const nameById = useMemo(() => new Map(data.consulentes.map((c) => [c.id, c.name])), [data.consulentes]);

  const filteredWorks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.spiritualWorks
      .filter((w) => {
        if (kindFilter && w.kind !== kindFilter) return false;
        if (statusFilter && w.status !== statusFilter) return false;
        if (paymentFilter && w.paymentStatus !== paymentFilter) return false;
        if (!term) return true;
        const cName = (nameById.get(w.consulenteId) ?? "").toLowerCase();
        return (
          cName.includes(term) ||
          w.title.toLowerCase().includes(term) ||
          (w.intention ?? "").toLowerCase().includes(term) ||
          (w.materials ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => (b.date + (b.startTime ?? "")).localeCompare(a.date + (a.startTime ?? "")));
  }, [data.spiritualWorks, kindFilter, statusFilter, paymentFilter, search, nameById]);

  const catalogStats = useMemo(
    () => workCatalogStats(data.workCatalog, data.spiritualWorks, data.workPayments),
    [data.workCatalog, data.spiritualWorks, data.workPayments],
  );

  const filteredCatalog = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalogStats.filter(({ item }) => {
      if (item.archived) return false;
      if (kindFilter && item.kind !== kindFilter) return false;
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        (item.description ?? "").toLowerCase().includes(term) ||
        (item.materials ?? "").toLowerCase().includes(term)
      );
    });
  }, [catalogStats, kindFilter, search]);

  const summary = useMemo(() => {
    const active = data.spiritualWorks.filter((w) => w.status === "em_andamento" || w.status === "planejado").length;
    const completed = data.spiritualWorks.filter((w) => w.status === "concluido").length;
    const magias = data.spiritualWorks.filter((w) => w.kind === "magia" && w.status !== "cancelado").length;
    const atividades = data.spiritualWorks.filter((w) => w.kind === "atividade" && w.status !== "cancelado").length;
    const received = data.workPayments.reduce((acc, p) => acc + p.amountCents, 0);
    const pending = data.spiritualWorks
      .filter((w) => w.status !== "cancelado")
      .reduce((acc, w) => acc + Math.max(0, w.priceCents - paidForWork(w.id, data.workPayments)), 0);
    return { active, completed, magias, atividades, received, pending };
  }, [data.spiritualWorks, data.workPayments]);

  const changeWorkStatus = async (work: SpiritualWork, next: WorkStatus) => {
    try {
      await mutate(`/api/records/spiritual_works/${work.id}`, "PATCH", { status: next });
      toast(
        next === "concluido"
          ? `${work.kind === "atividade" ? "Atividade concluída" : "Trabalho concluído"}. Use Registrar pagamento para lançar o recebimento.`
          : next === "cancelado"
            ? "Registro cancelado."
            : "Status atualizado.",
        "success",
      );
    } catch (error) {
      toast((error as Error).message, "error");
    }
  };

  const toggleCatalogActive = async (item: WorkCatalogItem) => {
    try {
      await mutate(`/api/records/work_catalog/${item.id}`, "PATCH", { active: !item.active });
      toast(item.active ? "Item desativado para novos cadastros." : "Item reativado no catálogo.", "success");
    } catch (error) {
      toast((error as Error).message, "error");
    }
  };

  const confirmDeleteWork = async () => {
    if (!deleteWorkTarget) return;
    try {
      await mutate(`/api/records/spiritual_works/${deleteWorkTarget.id}`, "DELETE");
      toast("Registro excluído.", "success");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setDeleteWorkTarget(null);
    }
  };

  const confirmDeleteCatalog = async () => {
    if (!deleteCatalogTarget) return;
    try {
      const res = await mutate(`/api/records/work_catalog/${deleteCatalogTarget.id}`, "DELETE");
      toast(String(res.message ?? "Item removido do catálogo."), "success");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setDeleteCatalogTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="heading text-lg font-semibold">Trabalhos, magias e atividades</h2>
          <p className="muted text-xs">
            Gerencie trabalhos espirituais (Abertura de caminhos, Vira pensamento, Adoçamento) e terapias (Reiki, Aromaterapia, Acupuntura).
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setWorkForm({ open: true, editing: null, defaultKind: "magia" })}
          >
            <Icon name="flame" size={14} /> Agendar trabalho/magia
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setWorkForm({ open: true, editing: null, defaultKind: "atividade" })}
          >
            <Icon name="leaf" size={14} /> Agendar atividade/terapia
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onOpenSpreadsheet}>
            <Icon name="table" size={14} /> Planilha padrão
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Em andamento" value={summary.active} hint="Firmados ou agendados" icon="flame" tone="warning" />
        <StatCard label="Concluídos" value={summary.completed} hint="Entregues / realizados" icon="check" tone="success" />
        <StatCard label="Magias e trabalhos" value={summary.magias} hint="Abertura, adoçamento..." icon="sparkles" tone="accent" />
        <StatCard label="Atividades / terapias" value={summary.atividades} hint="Reiki, aromaterapia..." icon="leaf" />
        <StatCard label="Recebido" value={money(summary.received)} hint="Integrado ao financeiro" icon="coins" tone="success" />
        <StatCard label="A receber" value={money(summary.pending)} hint="Saldo restante" icon="clock" tone="warning" />
      </div>

      <section className="card space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <button
              type="button"
              onClick={() => setSubView("registros")}
              className={cx("px-3 py-1.5 text-xs font-semibold", subView === "registros" && "nav-link-active")}
              style={{ color: subView === "registros" ? "var(--text)" : "var(--muted)" }}
            >
              Atendimentos e rituais ({data.spiritualWorks.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView("catalogo")}
              className={cx("px-3 py-1.5 text-xs font-semibold", subView === "catalogo" && "nav-link-active")}
              style={{ color: subView === "catalogo" ? "var(--text)" : "var(--muted)" }}
            >
              Catálogo de magias e atividades ({data.workCatalog.filter((c) => !c.archived).length})
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            {([
              ["", "Todos os tipos"],
              ["magia", "Trabalhos e magias"],
              ["atividade", "Atividades e terapias"],
            ] as const).map(([val, label]) => (
              <button
                key={label}
                type="button"
                className={cx("chip", kindFilter === val && "chip-active")}
                onClick={() => setKindFilter(val)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Pesquisar" className={subView === "catalogo" ? "sm:col-span-2 lg:col-span-3" : "lg:col-span-2"}>
            <div className="relative">
              <input
                className="input pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  subView === "registros"
                    ? "Consulente, abertura de caminhos, reiki, intenção..."
                    : "Abertura de caminhos, adoçamento, reiki, acupuntura..."
                }
              />
              <span className="muted absolute left-2.5 top-2.5">
                <Icon name="search" size={15} />
              </span>
            </div>
          </Field>

          {subView === "registros" ? (
            <>
              <Field label="Status do trabalho">
                <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Todos</option>
                  {Object.entries(WORK_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pagamento">
                <select className="select" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                  <option value="">Todos</option>
                  {Object.entries(PAYMENT_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <div className="flex items-end">
              <button
                type="button"
                className="btn btn-primary btn-sm w-full"
                onClick={() => setCatalogForm({ open: true, editing: null, defaultKind: kindFilter || "magia" })}
              >
                <Icon name="plus" size={14} /> Cadastrar no catálogo
              </button>
            </div>
          )}
        </div>
      </section>

      {subView === "registros" ? (
        filteredWorks.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredWorks.map((work) => {
              const paid = paidForWork(work.id, data.workPayments);
              const remaining = work.status === "cancelado" ? 0 : Math.max(0, work.priceCents - paid);
              const consulenteName = nameById.get(work.consulenteId) ?? "Consulente";

              return (
                <article key={work.id} className="card overflow-hidden">
                  <div className="flex flex-col sm:flex-row">
                    <div
                      className="relative h-36 w-full shrink-0 sm:h-auto sm:w-36"
                      style={{ background: "linear-gradient(145deg, var(--primary-soft), var(--accent-soft))" }}
                    >
                      {work.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={work.imageUrl} alt={work.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Icon name={work.kind === "atividade" ? "leaf" : "flame"} size={28} />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setWorkForm({ open: true, editing: work, defaultKind: work.kind })}
                        className="glass absolute bottom-2 right-2 flex items-center gap-1 rounded-full border px-2 py-1 text-[0.65rem] font-semibold"
                        style={{ borderColor: "var(--border)", color: "var(--text)" }}
                        title="Trocar foto deste trabalho/atividade"
                      >
                        <Icon name="camera" size={11} /> Foto
                      </button>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-3.5">
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{work.title}</p>
                            <p className="muted truncate text-xs">{consulenteName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{money(work.priceCents)}</p>
                            {remaining > 0 ? (
                              <p className="muted text-[0.68rem]">falta {money(remaining)}</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <span className={cx("chip", WORK_KIND[work.kind].tone)}>{WORK_KIND[work.kind].short}</span>
                          <span className={cx("chip", WORK_STATUS[work.status].tone)}>{WORK_STATUS[work.status].label}</span>
                          <span className={cx("chip", PAYMENT_STATUS[work.paymentStatus].tone)}>
                            {PAYMENT_STATUS[work.paymentStatus].label}
                          </span>
                        </div>

                        <p className="muted mt-2 text-xs">
                          Início: <strong>{formatDateBR(work.date)}</strong>
                          {work.startTime ? ` às ${work.startTime}` : ""}
                          {work.endDate && work.endDate !== work.date ? ` · Conclusão: ${formatDateBR(work.endDate)}` : ""}
                        </p>
                        {work.intention ? (
                          <p className="muted mt-1 line-clamp-2 text-xs">
                            <strong>Intenção/foco:</strong> {work.intention}
                          </p>
                        ) : null}
                        {work.materials ? (
                          <p className="muted mt-0.5 line-clamp-1 text-[0.7rem]">
                            <strong>Elementos:</strong> {work.materials}
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailTarget(work)} title="Ver detalhes">
                          <Icon name="eye" size={13} />
                        </button>
                        {onWhatsApp ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ borderColor: "color-mix(in srgb, #1f8a4c 40%, var(--border))", color: "#1f8a4c" }}
                            onClick={() => onWhatsApp({ consulenteId: work.consulenteId, work, preferredCategory: "trabalho" })}
                            title="Enviar atualização no WhatsApp"
                          >
                            <Icon name="whatsapp" size={13} /> WhatsApp
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setWorkForm({ open: true, editing: work, defaultKind: work.kind })}
                        >
                          <Icon name="edit" size={13} /> Editar
                        </button>
                        {work.status !== "concluido" && work.status !== "cancelado" ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => void changeWorkStatus(work, "concluido")}
                          >
                            <Icon name="check" size={13} /> Concluir
                          </button>
                        ) : null}
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setPayTarget(work)}>
                          <Icon name="coins" size={13} /> Pagamento
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDeleteWorkTarget(work)}
                          title="Excluir registro"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="card">
            <EmptyState
              icon="flame"
              title="Nenhum trabalho ou atividade encontrado"
              message="Registre trabalhos espirituais (Abertura de caminhos, Vira pensamento, Adoçamento) ou sessões terapêuticas (Reiki, Aromaterapia, Acupuntura) com foto, materiais e controle financeiro."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setWorkForm({ open: true, editing: null, defaultKind: "magia" })}
                  >
                    <Icon name="flame" size={14} /> Agendar trabalho/magia
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setWorkForm({ open: true, editing: null, defaultKind: "atividade" })}
                  >
                    <Icon name="leaf" size={14} /> Agendar atividade/terapia
                  </button>
                </div>
              }
            />
          </section>
        )
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCatalog.map(({ item, completed, activeCount, revenueCents }) => (
              <div key={item.id} className="card overflow-hidden">
                <div className="relative h-32 w-full" style={{ background: "var(--raised)" }}>
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Icon name={item.kind === "atividade" ? "leaf" : "flame"} size={26} />
                    </div>
                  )}
                  <span className={cx("chip absolute left-2 top-2", WORK_KIND[item.kind].tone)}>{WORK_KIND[item.kind].short}</span>
                  <button
                    type="button"
                    onClick={() => setCatalogForm({ open: true, editing: item, defaultKind: item.kind })}
                    className="glass absolute right-2 top-2 rounded-full border p-1.5"
                    style={{ borderColor: "var(--border)" }}
                    title="Editar item e imagem"
                  >
                    <Icon name="camera" size={13} />
                  </button>
                </div>
                <div className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p className="muted line-clamp-2 text-xs">{item.description || "Sem descrição"}</p>
                    </div>
                    <span className={cx("chip", item.active ? "chip-active" : "")}>{item.active ? "Ativo" : "Inativo"}</span>
                  </div>

                  {item.materials ? (
                    <p className="muted mt-1.5 line-clamp-1 text-[0.7rem]">
                      <strong>Materiais:</strong> {item.materials}
                    </p>
                  ) : null}

                  <div className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
                    <div className="card-muted p-1.5">
                      <p className="muted text-[0.6rem] uppercase">Valor</p>
                      <p className="font-semibold">{money(item.priceCents)}</p>
                    </div>
                    <div className="card-muted p-1.5">
                      <p className="muted text-[0.6rem] uppercase">{item.kind === "magia" ? "Ciclo" : "Duração"}</p>
                      <p className="font-semibold">
                        {item.kind === "magia" ? `${item.cycleDays} dia(s)` : `${item.durationMinutes} min`}
                      </p>
                    </div>
                    <div className="card-muted p-1.5">
                      <p className="muted text-[0.6rem] uppercase">Concluídos</p>
                      <p className="font-semibold">{completed}</p>
                    </div>
                  </div>

                  <p className="muted mt-2 text-[0.68rem]">
                    Faturamento histórico: <strong style={{ color: "var(--text)" }}>{money(revenueCents)}</strong> · {activeCount} em andamento
                  </p>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!item.active}
                      onClick={() => {
                        setSubView("registros");
                        setWorkForm({ open: true, editing: null, defaultKind: item.kind });
                      }}
                    >
                      <Icon name="plus" size={12} /> Lançar
                    </button>
                    <div className="flex gap-1">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggleCatalogActive(item)}>
                        {item.active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setCatalogForm({ open: true, editing: item, defaultKind: item.kind })}
                      >
                        <Icon name="edit" size={13} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteCatalogTarget(item)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!filteredCatalog.length ? (
            <section className="card">
              <EmptyState
                icon="sparkles"
                title="Catálogo vazio para este filtro"
                message="Cadastre trabalhos como Abertura de caminhos, Vira pensamento e Adoçamento, ou atividades como Reiki, Aromaterapia e Acupuntura."
                action={
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setCatalogForm({ open: true, editing: null, defaultKind: "magia" })}
                  >
                    <Icon name="plus" size={14} /> Novo item no catálogo
                  </button>
                }
              />
            </section>
          ) : null}
        </div>
      )}

      <WorkFormModal
        open={workForm.open}
        editing={workForm.editing}
        defaultKind={workForm.defaultKind}
        onClose={() => setWorkForm((prev) => ({ ...prev, open: false, editing: null }))}
      />

      <WorkCatalogFormModal
        open={catalogForm.open}
        editing={catalogForm.editing}
        defaultKind={catalogForm.defaultKind}
        onClose={() => setCatalogForm((prev) => ({ ...prev, open: false, editing: null }))}
      />

      <WorkPaymentModal work={payTarget} onClose={() => setPayTarget(null)} />

      <Modal
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.title ?? "Detalhes"}
        subtitle={detailTarget ? `${nameById.get(detailTarget.consulenteId) ?? "Consulente"} · ${WORK_KIND[detailTarget.kind].label}` : undefined}
        wide
        footer={
          detailTarget ? (
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  const target = detailTarget;
                  setDetailTarget(null);
                  setWorkForm({ open: true, editing: target, defaultKind: target.kind });
                }}
              >
                <Icon name="edit" size={14} /> Editar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const target = detailTarget;
                  setDetailTarget(null);
                  setPayTarget(target);
                }}
              >
                <Icon name="coins" size={14} /> Registrar pagamento
              </button>
            </>
          ) : null
        }
      >
        {detailTarget ? (
          <div className="space-y-3 text-sm">
            {detailTarget.imageUrl ? (
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detailTarget.imageUrl} alt={detailTarget.title} className="max-h-56 w-full object-cover" />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="card-muted p-2">
                <p className="muted text-[0.65rem] uppercase">Início</p>
                <p className="font-semibold">
                  {formatDateBR(detailTarget.date)} {detailTarget.startTime ?? ""}
                </p>
              </div>
              <div className="card-muted p-2">
                <p className="muted text-[0.65rem] uppercase">Conclusão</p>
                <p className="font-semibold">{formatDateBR(detailTarget.endDate)}</p>
              </div>
              <div className="card-muted p-2">
                <p className="muted text-[0.65rem] uppercase">Valor cobrado</p>
                <p className="font-semibold">{money(detailTarget.priceCents)}</p>
                <p className="muted text-[0.62rem]">catálogo {money(detailTarget.catalogPriceCents)}</p>
              </div>
              <div className="card-muted p-2">
                <p className="muted text-[0.65rem] uppercase">Total pago</p>
                <p className="font-semibold text-emerald-600">{money(paidForWork(detailTarget.id, data.workPayments))}</p>
              </div>
            </div>
            {detailTarget.intention ? (
              <div className="card-muted p-2.5 text-xs">
                <p className="font-semibold">Intenção / foco terapêutico</p>
                <p className="muted mt-0.5 whitespace-pre-wrap">{detailTarget.intention}</p>
              </div>
            ) : null}
            {detailTarget.materials ? (
              <div className="card-muted p-2.5 text-xs">
                <p className="font-semibold">Materiais e elementos utilizados</p>
                <p className="muted mt-0.5 whitespace-pre-wrap">{detailTarget.materials}</p>
              </div>
            ) : null}
            {detailTarget.notes ? (
              <div className="card-muted p-2.5 text-xs">
                <p className="font-semibold">Observações</p>
                <p className="muted mt-0.5 whitespace-pre-wrap">{detailTarget.notes}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteWorkTarget)}
        title="Excluir trabalho ou atividade"
        message="Registros sem pagamentos são removidos definitivamente. Se já houver pagamentos vinculados, o app solicita cancelar o registro para preservar o histórico financeiro."
        confirmLabel="Excluir"
        onClose={() => setDeleteWorkTarget(null)}
        onConfirm={() => void confirmDeleteWork()}
      />

      <ConfirmDialog
        open={Boolean(deleteCatalogTarget)}
        title="Remover do catálogo"
        message="Se este item já tiver sido utilizado em atendimentos anteriores, ele será arquivado e desativado para preservar os valores históricos."
        confirmLabel="Remover / arquivar"
        onClose={() => setDeleteCatalogTarget(null)}
        onConfirm={() => void confirmDeleteCatalog()}
      />
    </div>
  );
}

function WorkFormModal({
  open,
  editing,
  defaultKind,
  onClose,
}: {
  open: boolean;
  editing: SpiritualWork | null;
  defaultKind: WorkKind;
  onClose: () => void;
}) {
  const { data, mutate, toast, money } = useApp();
  const consulentes = data.consulentes.filter((c) => !c.archived);
  const [kind, setKind] = useState<WorkKind>(defaultKind);
  const [catalogId, setCatalogId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [consulenteId, setConsulenteId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState("20:00");
  const [cycleDays, setCycleDays] = useState("7");
  const [endDate, setEndDate] = useState("");
  const [price, setPrice] = useState("");
  const [materialCost, setMaterialCost] = useState("0,00");
  const [registerMaterialExpense, setRegisterMaterialExpense] = useState(false);
  const [status, setStatus] = useState<WorkStatus>("em_andamento");
  const [paymentMethod, setPaymentMethod] = useState("Pix");
  const [intention, setIntention] = useState("");
  const [materials, setMaterials] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickOrigin, setQuickOrigin] = useState<ClientOrigin>("nao_informado");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogByKind = useMemo(
    () => data.workCatalog.filter((c) => !c.archived && c.kind === kind),
    [data.workCatalog, kind],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setQuickOpen(false);
    setQuickOrigin("nao_informado");
    setRegisterMaterialExpense(false);

    if (editing) {
      setKind(editing.kind);
      setCatalogId(editing.catalogId ? String(editing.catalogId) : "");
      setCustomTitle(editing.title);
      setConsulenteId(String(editing.consulenteId));
      setDate(editing.date);
      setStartTime(editing.startTime ?? "");
      setCycleDays(String(editing.cycleDays));
      setEndDate(editing.endDate ?? "");
      setPrice(centsToInput(editing.priceCents));
      setMaterialCost(centsToInput(editing.materialCostCents));
      setStatus(editing.status);
      setPaymentMethod(editing.paymentMethod ?? "Pix");
      setIntention(editing.intention ?? "");
      setMaterials(editing.materials ?? "");
      setImageUrl(editing.imageUrl ?? "");
      setNotes(editing.notes ?? "");
    } else {
      const items = data.workCatalog.filter((c) => !c.archived && c.active && c.kind === defaultKind);
      const first = items[0] ?? null;
      const today = todayISO();
      setKind(defaultKind);
      setCatalogId(first ? String(first.id) : "");
      setCustomTitle(first ? first.name : "");
      setConsulenteId(consulentes[0] ? String(consulentes[0].id) : "");
      setDate(today);
      setStartTime(defaultKind === "atividade" ? "15:00" : "20:00");
      const cyc = first ? first.cycleDays : defaultKind === "magia" ? 7 : 1;
      setCycleDays(String(cyc));
      setEndDate(cyc > 1 ? addDaysISO(today, cyc) : today);
      setPrice(first ? centsToInput(first.priceCents) : "0,00");
      setMaterialCost("0,00");
      setStatus("planejado");
      setPaymentMethod("Pix");
      setIntention("");
      setMaterials(first?.materials ?? "");
      setImageUrl(first?.imageUrl ?? (defaultKind === "atividade" ? "/images/holistic-therapy.jpg" : "/images/spiritual-works.jpg"));
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, defaultKind]);

  const selectKind = (nextKind: WorkKind) => {
    setKind(nextKind);
    const items = data.workCatalog.filter((c) => !c.archived && c.active && c.kind === nextKind);
    const first = items[0] ?? null;
    setCatalogId(first ? String(first.id) : "");
    setCustomTitle(first ? first.name : "");
    if (first) {
      setPrice(centsToInput(first.priceCents));
      setCycleDays(String(first.cycleDays));
      setEndDate(first.cycleDays > 1 ? addDaysISO(date, first.cycleDays) : date);
      setMaterials(first.materials ?? "");
      setImageUrl(first.imageUrl ?? "");
    }
  };

  const selectCatalogItem = (val: string) => {
    setCatalogId(val);
    const found = data.workCatalog.find((c) => c.id === Number(val));
    if (found) {
      setCustomTitle(found.name);
      setPrice(centsToInput(found.priceCents));
      setCycleDays(String(found.cycleDays));
      setEndDate(found.cycleDays > 1 ? addDaysISO(date, found.cycleDays) : date);
      setMaterials(found.materials ?? "");
      if (found.imageUrl) setImageUrl(found.imageUrl);
    }
  };

  const createQuickConsulente = async () => {
    if (quickName.trim().length < 2) {
      setError("Informe o nome da consulente.");
      return;
    }
    try {
      const res = await mutate("/api/records/consulentes", "POST", { name: quickName, phone: quickPhone, origin: quickOrigin, force: true });
      const rec = res.record as { id: number };
      setConsulenteId(String(rec.id));
      setQuickOpen(false);
      setQuickName("");
      setQuickPhone("");
      setQuickOrigin("nao_informado");
      toast("Consulente cadastrada.", "success");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!consulenteId) {
      setError("Selecione ou cadastre a consulente.");
      return;
    }
    if (!customTitle.trim() && !catalogId) {
      setError("Selecione um item do catálogo ou digite o nome do trabalho/atividade.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        consulenteId: Number(consulenteId),
        catalogId: catalogId ? Number(catalogId) : null,
        kind,
        title: customTitle.trim(),
        date,
        startTime: startTime || null,
        cycleDays: Number(cycleDays) || 1,
        endDate: endDate || null,
        priceCents: parseMoneyToCents(price),
        materialCostCents: parseMoneyToCents(materialCost),
        registerMaterialExpense: !editing && registerMaterialExpense,
        status,
        paymentMethod,
        intention,
        materials,
        imageUrl,
        notes,
      };
      if (editing) await mutate(`/api/records/spiritual_works/${editing.id}`, "PATCH", payload);
      else await mutate("/api/records/spiritual_works", "POST", payload);
      toast(editing ? "Registro atualizado." : "Trabalho / atividade cadastrado com sucesso.", "success");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const selectedCatalog = data.workCatalog.find((c) => c.id === Number(catalogId));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar trabalho ou atividade" : kind === "atividade" ? "Agendar atividade/terapia" : "Agendar trabalho/magia"}
      subtitle="Preços antigos ficam preservados no histórico mesmo se o catálogo mudar depois."
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="spiritual-work-form" className="btn btn-primary" disabled={saving}>
            <Icon name="save" size={14} /> {saving ? "Salvando..." : editing ? "Salvar alterações" : "Agendar"}
          </button>
        </>
      }
    >
      <form id="spiritual-work-form" className="space-y-3" onSubmit={submit}>
        {error ? <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</div> : null}

        <div className="flex rounded-xl border p-1" style={{ borderColor: "var(--border)" }}>
          {([
            ["magia", "Trabalho espiritual / Magia", "flame"],
            ["atividade", "Atividade / Terapia (Reiki, Aroma, Acupuntura)", "leaf"],
          ] as const).map(([val, label, icon]) => (
            <button
              key={val}
              type="button"
              onClick={() => selectKind(val)}
              className={cx("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold", kind === val && "nav-link-active")}
              style={{ color: kind === val ? "var(--text)" : "var(--muted)" }}
            >
              <Icon name={icon} size={14} /> {label}
            </button>
          ))}
        </div>

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
            <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => setQuickOpen((v) => !v)}>
              <Icon name="userPlus" size={13} /> Cadastrar nova consulente
            </button>
          </div>

          <Field
            label={kind === "magia" ? "Trabalho / Magia do catálogo" : "Atividade / Terapia do catálogo"}
            hint={selectedCatalog ? `Valor padrão no catálogo: ${money(selectedCatalog.priceCents)}` : "Ou personalize o título abaixo"}
          >
            <select className="select" value={catalogId} onChange={(e) => selectCatalogItem(e.target.value)}>
              <option value="">Personalizado (digitar abaixo)</option>
              {catalogByKind.map((item) => (
                <option key={item.id} value={item.id} disabled={!item.active && editing?.catalogId !== item.id}>
                  {item.name} {!item.active ? "(inativo)" : ""}
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
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void createQuickConsulente()}>
                Salvar consulente
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuickOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome exibido do trabalho / atividade" required>
            <input
              className="input"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={kind === "magia" ? "Ex.: Abertura de caminhos / Adoçamento" : "Ex.: Reiki / Aromaterapia / Acupuntura"}
            />
          </Field>
          <Field label="Status">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as WorkStatus)}>
              {Object.entries(WORK_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Data de início" required>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                const cyc = Number(cycleDays) || 1;
                if (e.target.value) setEndDate(cyc > 1 ? addDaysISO(e.target.value, cyc) : e.target.value);
              }}
            />
          </Field>
          <Field label="Horário (24h)">
            <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Ciclo (dias)">
            <input
              type="number"
              min={1}
              max={365}
              className="input"
              value={cycleDays}
              onChange={(e) => {
                setCycleDays(e.target.value);
                const cyc = Math.max(1, Number(e.target.value) || 1);
                if (date) setEndDate(cyc > 1 ? addDaysISO(date, cyc) : date);
              }}
            />
          </Field>
          <Field label="Data de conclusão">
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Valor cobrado" required>
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Custo de materiais (opcional)">
            <input className="input" value={materialCost} onChange={(e) => setMaterialCost(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Forma de pagamento prevista">
            <select className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {!editing && parseMoneyToCents(materialCost) > 0 ? (
          <Toggle
            checked={registerMaterialExpense}
            onChange={setRegisterMaterialExpense}
            label="Lançar custo dos materiais automaticamente nas despesas do Financeiro"
            hint="Cria uma despesa na categoria Materiais de trabalho com a data de início."
          />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={kind === "magia" ? "Intenção / pedido espiritual" : "Foco terapêutico / queixa"}>
            <textarea
              className="textarea"
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              placeholder={kind === "magia" ? "Ex.: Destravar caminhos financeiros e harmonia..." : "Ex.: Alívio de estresse, equilíbrio dos chakras, pontos trabalhados..."}
            />
          </Field>
          <Field label={kind === "magia" ? "Materiais utilizados (velas, ervas, mel...)" : "Recursos utilizados (óleos, cristais, agulhas...)"}>
            <textarea
              className="textarea"
              value={materials}
              onChange={(e) => setMaterials(e.target.value)}
              placeholder="Liste os elementos utilizados..."
            />
          </Field>
        </div>

        <ImagePickerField
          label="Imagem editável do trabalho, altar ou sessão"
          value={imageUrl}
          onChange={setImageUrl}
          hint="Envie uma foto tirada do celular/tablet (ex.: foto da firmeza, altar ou sessão) ou escolha na galeria."
        />

        <Field label="Observações adicionais">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function WorkCatalogFormModal({
  open,
  editing,
  defaultKind,
  onClose,
}: {
  open: boolean;
  editing: WorkCatalogItem | null;
  defaultKind: WorkKind;
  onClose: () => void;
}) {
  const { mutate, toast } = useApp();
  const [kind, setKind] = useState<WorkKind>(defaultKind);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("150,00");
  const [cycleDays, setCycleDays] = useState("7");
  const [duration, setDuration] = useState("60");
  const [materials, setMaterials] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setKind(editing.kind);
      setName(editing.name);
      setPrice(centsToInput(editing.priceCents));
      setCycleDays(String(editing.cycleDays));
      setDuration(String(editing.durationMinutes));
      setMaterials(editing.materials ?? "");
      setDescription(editing.description ?? "");
      setImageUrl(editing.imageUrl ?? "");
      setActive(editing.active);
    } else {
      setKind(defaultKind);
      setName("");
      setPrice(defaultKind === "magia" ? "350,00" : "150,00");
      setCycleDays(defaultKind === "magia" ? "7" : "1");
      setDuration("60");
      setMaterials("");
      setDescription("");
      setImageUrl(defaultKind === "atividade" ? "/images/holistic-therapy.jpg" : "/images/spiritual-works.jpg");
      setActive(true);
    }
  }, [open, editing, defaultKind]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Informe o nome do trabalho, magia ou atividade.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        kind,
        name: name.trim(),
        priceCents: parseMoneyToCents(price),
        cycleDays: Number(cycleDays) || 1,
        durationMinutes: Number(duration) || 60,
        materials,
        description,
        imageUrl,
        active,
      };
      if (editing) await mutate(`/api/records/work_catalog/${editing.id}`, "PATCH", payload);
      else await mutate("/api/records/work_catalog", "POST", payload);
      toast(editing ? "Catálogo atualizado. Registros antigos preservam o preço original." : "Novo item adicionado ao catálogo.", "success");
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
      title={editing ? "Editar item do catálogo" : "Novo trabalho, magia ou atividade"}
      subtitle="Configure preço padrão, materiais, ciclo e imagem."
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form="work-catalog-form" className="btn btn-primary" disabled={saving}>
            <Icon name="save" size={14} /> {saving ? "Salvando..." : "Salvar no catálogo"}
          </button>
        </>
      }
    >
      <form id="work-catalog-form" className="space-y-3" onSubmit={submit}>
        {error ? <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoria" required>
            <select
              className="select"
              value={kind}
              onChange={(e) => {
                const next = e.target.value as WorkKind;
                setKind(next);
                if (!editing) {
                  setCycleDays(next === "magia" ? "7" : "1");
                  setImageUrl(next === "atividade" ? "/images/holistic-therapy.jpg" : "/images/spiritual-works.jpg");
                }
              }}
            >
              <option value="magia">Trabalho espiritual / Magia</option>
              <option value="atividade">Atividade / Terapia integrativa</option>
            </select>
          </Field>
          <Field label="Nome" required>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "magia" ? "Ex.: Abertura de caminhos, Vira pensamento, Adoçamento" : "Ex.: Reiki, Aromaterapia, Acupuntura"}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Valor padrão" required>
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Ciclo padrão (dias)" hint="Ex.: 7 dias para firmeza, 1 dia para sessão">
            <input type="number" min={1} max={365} className="input" value={cycleDays} onChange={(e) => setCycleDays(e.target.value)} />
          </Field>
          <Field label="Duração da sessão (min)">
            <input type="number" min={5} max={600} className="input" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
        </div>

        <Field label="Materiais / recursos habituais">
          <input
            className="input"
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
            placeholder={kind === "magia" ? "Ex.: Velas, mel, canela, ervas..." : "Ex.: Óleos essenciais, cristais, agulhas..."}
          />
        </Field>

        <Field label="Descrição">
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <ImagePickerField label="Imagem representativa (editável)" value={imageUrl} onChange={setImageUrl} />

        <Toggle checked={active} onChange={setActive} label="Item ativo para novos atendimentos" />
      </form>
    </Modal>
  );
}

export function WorkPaymentModal({ work, onClose }: { work: SpiritualWork | null; onClose: () => void }) {
  const { data, mutate, toast, money } = useApp();
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [method, setMethod] = useState("Pix");
  const [notes, setNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<{ id: number; amountCents: number } | null>(null);

  const payments = work ? data.workPayments.filter((p) => p.workId === work.id) : [];
  const paid = payments.reduce((a, p) => a + p.amountCents, 0);
  const remaining = work ? Math.max(0, work.priceCents - paid) : 0;
  const consulenteName = work ? data.consulentes.find((c) => c.id === work.consulenteId)?.name ?? "Consulente" : "";

  useEffect(() => {
    if (!work) return;
    setAmount(centsToInput(Math.max(0, work.priceCents - paid)));
    setPaidAt(todayISO());
    setMethod(work.paymentMethod ?? "Pix");
    setNotes("");
    setIdempotencyKey(uid("wpay"));
    setError(null);
    setRefundTarget(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work?.id]);

  if (!work) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const res = await mutate("/api/records/work_payments", "POST", {
        workId: work.id,
        amountCents: cents,
        paidAt,
        method,
        notes,
        idempotencyKey,
        paymentMethodLabel: method,
        kind: "pagamento",
      });
      toast(
        res.duplicate ? "Este pagamento já estava registrado." : "Pagamento registrado e lançado no Financeiro.",
        res.duplicate ? "info" : "success",
      );
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
      await mutate("/api/records/work_payments", "POST", {
        workId: work.id,
        amountCents: refundTarget.amountCents,
        kind: "estorno",
        paidAt: todayISO(),
        method,
        notes: "Estorno solicitado no módulo de trabalhos e atividades.",
        idempotencyKey: uid("wrefund"),
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
      open={Boolean(work)}
      onClose={onClose}
      title="Registrar pagamento"
      subtitle={`${consulenteName} · ${work.title} · ${formatDateBR(work.date)}`}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fechar
          </button>
          <button type="submit" form="work-payment-form" className="btn btn-primary" disabled={saving || remaining === 0}>
            <Icon name="coins" size={14} /> {saving ? "Registrando..." : "Registrar pagamento"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card-muted p-2">
          <p className="muted text-[0.65rem] uppercase">Valor</p>
          <p className="text-sm font-semibold">{money(work.priceCents)}</p>
        </div>
        <div className="card-muted p-2">
          <p className="muted text-[0.65rem] uppercase">Pago</p>
          <p className="text-sm font-semibold text-emerald-600">{money(paid)}</p>
        </div>
        <div className="card-muted p-2">
          <p className="muted text-[0.65rem] uppercase">Restante</p>
          <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
            {money(remaining)}
          </p>
        </div>
      </div>

      <form id="work-payment-form" className="mt-3 space-y-3" onSubmit={submit}>
        {error ? <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</div> : null}
        {remaining === 0 ? (
          <p className="rounded-lg border border-emerald-400/50 bg-emerald-500/10 p-2 text-xs text-emerald-700">
            Este registro está quitado. Use o botão Estornar abaixo caso precise registrar uma devolução/ajuste.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor recebido" required hint="Aceita entrada parcial (ex.: 50%) ou integral.">
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Data do recebimento" required>
            <input type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Forma de pagamento">
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
              {(data.settings.paymentMethods.length ? data.settings.paymentMethods : PAYMENT_METHOD_OPTIONS).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Observação">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: 50% na firmeza, 50% na entrega" />
          </Field>
        </div>
      </form>

      <div className="mt-4">
        <p className="muted mb-1 text-xs font-semibold uppercase tracking-wide">Pagamentos registrados</p>
        {payments.length ? (
          <ul className="space-y-1.5">
            {payments.map((p) => (
              <li key={p.id} className="card-muted flex items-center justify-between gap-2 p-2 text-xs">
                <div>
                  <p className="font-semibold">
                    {p.kind === "estorno" ? "Estorno" : "Pagamento"} de {money(Math.abs(p.amountCents))}
                  </p>
                  <p className="muted">
                    {formatDateBR(p.paidAt)} · {p.method}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </p>
                </div>
                {p.kind === "pagamento" ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRefundTarget({ id: p.id, amountCents: Math.abs(p.amountCents) })}
                  >
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
        message={`O estorno de ${money(refundTarget?.amountCents ?? 0)} cria um lançamento compensatório e preserva o histórico original.`}
        confirmLabel="Registrar estorno"
        onClose={() => setRefundTarget(null)}
        onConfirm={() => void refund()}
      />
    </Modal>
  );
}
