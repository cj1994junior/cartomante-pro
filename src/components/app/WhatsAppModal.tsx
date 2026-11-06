"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Field, Icon, Modal, cx } from "@/components/ui";
import { formatDateBR, hoursLabel, liveElapsedSeconds, secondsToWorkedLabel, uid } from "@/lib/format";
import { paidFor, paidForWork } from "@/lib/metrics";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  WHATSAPP_CATEGORY_LABELS,
  WHATSAPP_PLACEHOLDERS,
  buildWhatsAppUrl,
  formatWhatsAppPhone,
  renderWhatsAppTemplate,
} from "@/lib/whatsapp";
import type { WhatsAppTarget, WhatsAppTemplate, WhatsAppTemplateCategory } from "@/lib/types";

const DDI_OPTIONS = [
  { code: "55", label: "+55 (Brasil)" },
  { code: "351", label: "+351 (Portugal)" },
  { code: "1", label: "+1 (EUA / Canadá)" },
  { code: "34", label: "+34 (Espanha)" },
  { code: "44", label: "+44 (Reino Unido)" },
  { code: "33", label: "+33 (França)" },
];

export function WhatsAppTemplatesManager({ compact = false }: { compact?: boolean }) {
  const { data, mutate, toast } = useApp();
  const templates = data.settings.whatsappTemplates?.length ? data.settings.whatsappTemplates : DEFAULT_WHATSAPP_TEMPLATES;
  const [defaultDdi, setDefaultDdi] = useState(data.settings.whatsappDefaultDdi || "55");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<WhatsAppTemplateCategory>("confirmacao");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDefaultDdi(data.settings.whatsappDefaultDdi || "55");
  }, [data.settings.whatsappDefaultDdi]);

  const startNew = () => {
    setEditingId("__new__");
    setTitle("");
    setCategory("geral");
    setBody("Olá, {primeiro_nome}! ✨ ");
  };

  const startEdit = (tpl: WhatsAppTemplate) => {
    setEditingId(tpl.id);
    setTitle(tpl.title);
    setCategory(tpl.category);
    setBody(tpl.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
  };

  const insertToken = (token: string) => {
    setBody((prev) => `${prev}${prev.endsWith(" ") || !prev ? "" : " "}${token}`);
  };

  const saveTemplate = async () => {
    if (title.trim().length < 2) {
      toast("Informe um título para identificar a mensagem.", "error");
      return;
    }
    if (body.trim().length < 4) {
      toast("Escreva o conteúdo da mensagem pré-programada.", "error");
      return;
    }
    setSaving(true);
    try {
      const nextItem: WhatsAppTemplate = {
        id: editingId && editingId !== "__new__" ? editingId : uid("wpl"),
        title: title.trim(),
        category,
        body: body.trim(),
      };
      const nextList =
        editingId === "__new__"
          ? [...templates, nextItem]
          : templates.map((t) => (t.id === editingId ? nextItem : t));
      await mutate("/api/settings", "PATCH", { whatsappTemplates: nextList });
      toast(editingId === "__new__" ? "Nova mensagem pré-programada criada!" : "Mensagem pré-programada atualizada!", "success");
      cancelEdit();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (id: string) => {
    if (templates.length <= 1) {
      toast("Mantenha ao menos uma mensagem cadastrada.", "info");
      return;
    }
    try {
      await mutate("/api/settings", "PATCH", {
        whatsappTemplates: templates.filter((t) => t.id !== id),
      });
      if (editingId === id) cancelEdit();
      toast("Mensagem removida.", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const restoreDefaults = async () => {
    try {
      await mutate("/api/settings", "PATCH", { whatsappTemplates: DEFAULT_WHATSAPP_TEMPLATES });
      cancelEdit();
      toast("Mensagens padrão restauradas.", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const saveDdi = async (nextDdi: string) => {
    setDefaultDdi(nextDdi);
    try {
      await mutate("/api/settings", "PATCH", { whatsappDefaultDdi: nextDdi });
      toast("Código do país padrão atualizado.", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Field label="Código de país (DDI) padrão" className="w-52">
          <select className="select py-1.5 text-xs" value={defaultDdi} onChange={(e) => void saveDdi(e.target.value)}>
            {DDI_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn btn-primary btn-sm" onClick={startNew}>
            <Icon name="plus" size={13} /> Nova mensagem
          </button>
          {!compact ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void restoreDefaults()}>
              Restaurar modelos padrão
            </button>
          ) : null}
        </div>
      </div>

      {editingId ? (
        <div className="card-muted space-y-2.5 p-3">
          <p className="text-xs font-semibold">
            {editingId === "__new__" ? "Criar nova mensagem pré-programada" : "Editar mensagem pré-programada"}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Título da mensagem" required>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Confirmação de consulta"
              />
            </Field>
            <Field label="Momento / categoria">
              <select
                className="select"
                value={category}
                onChange={(e) => setCategory(e.target.value as WhatsAppTemplateCategory)}
              >
                {Object.entries(WHATSAPP_CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <span className="label">Inserir variável automática (clique para adicionar)</span>
            <div className="flex flex-wrap gap-1">
              {WHATSAPP_PLACEHOLDERS.map((ph) => (
                <button
                  key={ph.token}
                  type="button"
                  className="chip hover:opacity-80"
                  onClick={() => insertToken(ph.token)}
                  title={`Insere ${ph.token}`}
                >
                  + {ph.label} <span className="opacity-70">{ph.token}</span>
                </button>
              ))}
            </div>
          </div>

          <Field label="Texto da mensagem" required>
            <textarea
              className="textarea min-h-[6rem]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escreva a mensagem que será preenchida automaticamente..."
            />
          </Field>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={cancelEdit} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveTemplate()} disabled={saving}>
              <Icon name="save" size={13} /> {saving ? "Salvando..." : "Salvar mensagem"}
            </button>
          </div>
        </div>
      ) : null}

      <div className={cx("grid gap-2", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        {templates.map((tpl) => (
          <div key={tpl.id} className="card-muted flex flex-col justify-between gap-2 p-2.5 text-xs">
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{tpl.title}</p>
                <span className="chip">{WHATSAPP_CATEGORY_LABELS[tpl.category] ?? "Geral"}</span>
              </div>
              <p className="muted mt-1 line-clamp-3 whitespace-pre-wrap text-[0.72rem]">{tpl.body}</p>
            </div>
            <div className="flex justify-end gap-1">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(tpl)}>
                <Icon name="edit" size={12} /> Editar
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void removeTemplate(tpl.id)} title="Excluir modelo">
                <Icon name="trash" size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WhatsAppModal({
  target,
  onClose,
}: {
  target: WhatsAppTarget | null;
  onClose: () => void;
}) {
  const { data, money, mutate, toast } = useApp();
  const templates = data.settings.whatsappTemplates?.length ? data.settings.whatsappTemplates : DEFAULT_WHATSAPP_TEMPLATES;
  const [mode, setMode] = useState<"enviar" | "gerenciar">("enviar");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [ddi, setDdi] = useState(data.settings.whatsappDefaultDdi || "55");
  const [phone, setPhone] = useState("");
  const [savePhoneToConsulente, setSavePhoneToConsulente] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [newTplTitle, setNewTplTitle] = useState("");
  const [showSaveAsTpl, setShowSaveAsTpl] = useState(false);

  const consulente = useMemo(
    () => (target ? data.consulentes.find((c) => c.id === target.consulenteId) ?? null : null),
    [target, data.consulentes],
  );

  // Caso tenha aberto apenas pela consulente, busca a próxima consulta agendada (ou última) para enriquecer variáveis
  const contextConsultation = useMemo(() => {
    if (!target) return null;
    if (target.consultation) return target.consultation;
    if (target.work) return null;
    const related = data.consultations
      .filter((c) => c.consulenteId === target.consulenteId && c.status !== "cancelada")
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
    return related[0] ?? null;
  }, [target, data.consultations]);

  const templateVars = useMemo(() => {
    const fullName = consulente?.name ?? "Consulente";
    const firstName = fullName.trim().split(/\s+/)[0] || fullName;
    const professional = data.settings.professionalName || data.tenant.ownerName || "Cartomante";
    const pix = data.settings.paymentInstructions || "Chave Pix sob consulta";

    if (target?.work) {
      const w = target.work;
      const paid = paidForWork(w.id, data.workPayments);
      const remaining = Math.max(0, w.priceCents - paid);
      return {
        nome: fullName,
        primeiro_nome: firstName,
        servico: w.title,
        data: formatDateBR(w.date),
        hora: w.startTime || "20:00",
        valor: money(w.priceCents),
        restante: money(remaining > 0 ? remaining : w.priceCents),
        duracao_real: w.cycleDays > 1 ? `${w.cycleDays} dias` : `${w.durationMinutes} min`,
        pix,
        profissional: professional,
      };
    }

    if (contextConsultation) {
      const c = contextConsultation;
      const paid = paidFor(c.id, data.payments);
      const remaining = Math.max(0, c.priceCents - paid);
      const liveSec = liveElapsedSeconds(c.actualSeconds, c.timerStartedAt);
      const realDuration = liveSec > 0 ? secondsToWorkedLabel(liveSec) : hoursLabel(c.durationMinutes);
      return {
        nome: fullName,
        primeiro_nome: firstName,
        servico: c.methodName,
        data: formatDateBR(c.date),
        hora: c.startTime,
        valor: money(c.priceCents),
        restante: money(remaining > 0 ? remaining : c.priceCents),
        duracao_real: realDuration,
        pix,
        profissional: professional,
      };
    }

    return {
      nome: fullName,
      primeiro_nome: firstName,
      servico: "consulta",
      data: formatDateBR(new Date().toISOString().slice(0, 10)),
      hora: "14:00",
      valor: money(0),
      restante: money(0),
      duracao_real: "",
      pix,
      profissional: professional,
    };
  }, [consulente, data.settings, data.tenant.ownerName, data.payments, data.workPayments, target, contextConsultation, money]);

  const chooseRecommendedTemplate = (): WhatsAppTemplate => {
    const preferred: WhatsAppTemplateCategory =
      target?.preferredCategory ??
      (target?.work
        ? "trabalho"
        : target?.consultation
          ? target.consultation.status === "realizada"
            ? "pos_consulta"
            : target.consultation.status === "em_atendimento"
              ? "inicio"
              : target.consultation.status === "confirmada"
                ? "lembrete"
                : "confirmacao"
          : "retorno");

    return templates.find((t) => t.category === preferred) ?? templates[0];
  };

  useEffect(() => {
    if (!target) return;
    setMode("enviar");
    setShowSaveAsTpl(false);
    setNewTplTitle("");
    setDdi(data.settings.whatsappDefaultDdi || "55");
    setPhone(consulente?.phone ?? "");
    setSavePhoneToConsulente(!consulente?.phone);
    const chosen = chooseRecommendedTemplate();
    setSelectedTemplateId(chosen.id);
    setMessageText(renderWhatsAppTemplate(chosen.body, templateVars));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, consulente?.id]);

  if (!target) return null;

  const applyTemplate = (tpl: WhatsAppTemplate) => {
    setSelectedTemplateId(tpl.id);
    setMessageText(renderWhatsAppTemplate(tpl.body, templateVars));
  };

  const formattedDigits = formatWhatsAppPhone(phone, ddi);

  const sendViaWhatsApp = async () => {
    if (!formattedDigits) {
      toast("Informe um número de telefone com DDD válido para abrir o WhatsApp.", "error");
      return;
    }
    if (!messageText.trim()) {
      toast("Escolha ou escreva uma mensagem antes de enviar.", "error");
      return;
    }
    if (consulente && savePhoneToConsulente && phone.trim() && phone.trim() !== (consulente.phone ?? "")) {
      try {
        await mutate(`/api/records/consulentes/${consulente.id}`, "PATCH", { phone: phone.trim() });
      } catch {
        /* segue para o envio mesmo se falhar atualização opcional */
      }
    }
    const url = buildWhatsAppUrl(formattedDigits, messageText.trim());
    window.open(url, "_blank", "noopener,noreferrer");
    toast("Abrindo conversa no WhatsApp...", "success");
    onClose();
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      toast("Mensagem copiada para a área de transferência!", "success");
    } catch {
      toast("Não foi possível copiar automaticamente neste navegador.", "info");
    }
  };

  const saveCurrentAsNewTemplate = async () => {
    if (newTplTitle.trim().length < 2 || !messageText.trim()) {
      toast("Informe um título para salvar este modelo.", "error");
      return;
    }
    try {
      const created: WhatsAppTemplate = {
        id: uid("wpl"),
        title: newTplTitle.trim(),
        category: "geral",
        body: messageText.trim(),
      };
      await mutate("/api/settings", "PATCH", { whatsappTemplates: [...templates, created] });
      setSelectedTemplateId(created.id);
      setShowSaveAsTpl(false);
      setNewTplTitle("");
      toast("Mensagem salva nas suas pré-programadas!", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={`WhatsApp — ${consulente?.name ?? "Consulente"}`}
      subtitle="Escolha uma mensagem pré-programada, revise o texto e envie com 1 clique."
      wide
      footer={
        mode === "enviar" ? (
          <>
            <button type="button" className="btn btn-outline" onClick={() => void copyMessage()}>
              <Icon name="copy" size={14} /> Copiar texto
            </button>
            <button
              type="button"
              className="btn text-white"
              style={{ background: "#1f8a4c", borderColor: "#176b3a" }}
              onClick={() => void sendViaWhatsApp()}
            >
              <Icon name="whatsapp" size={15} /> Abrir no WhatsApp e enviar
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setMode("enviar")}>
            Voltar para envio
          </button>
        )
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={cx("chip", mode === "enviar" && "chip-active")}
            onClick={() => setMode("enviar")}
          >
            <Icon name="whatsapp" size={13} /> Escolher e enviar
          </button>
          <button
            type="button"
            className={cx("chip", mode === "gerenciar" && "chip-active")}
            onClick={() => setMode("gerenciar")}
          >
            <Icon name="settings" size={13} /> Minhas mensagens pré-programadas ({templates.length})
          </button>
        </div>
      </div>

      {mode === "gerenciar" ? (
        <WhatsAppTemplatesManager compact />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-[11rem_1fr]">
            <Field label="País (DDI)">
              <select className="select" value={ddi} onChange={(e) => setDdi(e.target.value)}>
                {DDI_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Telefone / WhatsApp da consulente"
              required
              hint={
                formattedDigits
                  ? `Destino formatado: +${formattedDigits}`
                  : "Digite o DDD + número (ex.: 11 98877-1020) ou número internacional com +."
              }
            >
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 98877-1020"
                inputMode="tel"
              />
            </Field>
          </div>

          {consulente && phone.trim() !== (consulente.phone ?? "") && phone.trim().length >= 8 ? (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={savePhoneToConsulente}
                onChange={(e) => setSavePhoneToConsulente(e.target.checked)}
              />
              Salvar este número no cadastro de <strong>{consulente.name}</strong>
            </label>
          ) : null}

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="label mb-0">Escolha a mensagem pré-programada</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("gerenciar")}>
                <Icon name="edit" size={12} /> Criar / editar modelos
              </button>
            </div>
            <div className="grid max-h-44 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {templates.map((tpl) => {
                const active = tpl.id === selectedTemplateId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className={cx("rounded-xl border p-2 text-left text-xs transition", active && "nav-link-active")}
                    style={{ borderColor: active ? "var(--primary)" : "var(--border)" }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-semibold">{tpl.title}</span>
                      <span className="chip text-[0.6rem]">{WHATSAPP_CATEGORY_LABELS[tpl.category]}</span>
                    </div>
                    <p className="muted mt-0.5 line-clamp-1 text-[0.68rem]">{tpl.body}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Field
            label="Prévia da mensagem (você pode ajustar o texto antes de enviar)"
            hint="Os dados da consulente e do atendimento já foram preenchidos automaticamente."
          >
            <textarea
              className="textarea min-h-[7.5rem]"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
            />
          </Field>

          {!showSaveAsTpl ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowSaveAsTpl(true)}>
              <Icon name="plus" size={13} /> Salvar texto acima como nova mensagem pré-programada
            </button>
          ) : (
            <div className="card-muted flex flex-wrap items-center gap-2 p-2.5">
              <input
                className="input flex-1 py-1 text-xs"
                value={newTplTitle}
                onChange={(e) => setNewTplTitle(e.target.value)}
                placeholder="Título para esta nova mensagem (ex.: Aviso de atraso)"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveCurrentAsNewTemplate()}>
                Salvar modelo
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowSaveAsTpl(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
