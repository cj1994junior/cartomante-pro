"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { buildReminders } from "@/components/app/reminders";
import { ConfirmDialog, Field, Icon, SectionTitle, Toggle, cx } from "@/components/ui";
import { DeviceAccessContent } from "@/components/app/DeviceAccessModal";
import { ImagePickerField } from "@/components/app/ImagePicker";
import { SpreadsheetCenter } from "@/components/app/SpreadsheetModal";
import { WhatsAppTemplatesManager } from "@/components/app/WhatsAppModal";
import { applyPalette } from "@/components/ThemeProvider";
import { CURRENCIES, CURRENCY_OPTIONS, centsToInput, formatDateBR, formatDateTimeBR, parseMoneyToCents } from "@/lib/format";
import { PALETTES, PALETTE_GROUPS } from "@/lib/palettes";

export function Configuracoes() {
  const { data, mutate, toast, money } = useApp();
  const settings = data.settings;
  const [professionalName, setProfessionalName] = useState(settings.professionalName);
  const [appName, setAppName] = useState(settings.appName);
  const [about, setAbout] = useState(settings.about);
  const [profileImage, setProfileImage] = useState(settings.profileImage);
  const [coverImage, setCoverImage] = useState(settings.coverImage || settings.profileImage);
  const [currency, setCurrency] = useState(settings.currency);
  const [goal, setGoal] = useState(centsToInput(settings.monthlyGoalCents));
  const [initialBalance, setInitialBalance] = useState(centsToInput(settings.initialBalanceCents));
  const [paymentInstructions, setPaymentInstructions] = useState(settings.paymentInstructions);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteGroup, setPaletteGroup] = useState<string>("Todas");
  const [newCategory, setNewCategory] = useState({ income: "", expense: "", payment: "" });
  const [pin, setPin] = useState("");
  const [pinEnabled, setPinEnabled] = useState(Boolean(settings.lockEnabled));
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState("");
  const [importPayload, setImportPayload] = useState<Record<string, unknown> | null>(null);
  const [importCounts, setImportCounts] = useState<Record<string, number> | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importOpen, setImportOpen] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );

  useEffect(() => {
    setProfessionalName(settings.professionalName);
    setAppName(settings.appName);
    setAbout(settings.about);
    setProfileImage(settings.profileImage);
    setCoverImage(settings.coverImage || settings.profileImage);
    setCurrency(settings.currency);
    setGoal(centsToInput(settings.monthlyGoalCents));
    setInitialBalance(centsToInput(settings.initialBalanceCents));
    setPaymentInstructions(settings.paymentInstructions);
    setPinEnabled(Boolean(settings.lockEnabled));
  }, [settings]);

  const filteredPalettes = useMemo(
    () =>
      PALETTES.filter((palette) => (paletteGroup === "Todas" ? true : palette.group === paletteGroup)).filter((palette) =>
        paletteSearch ? palette.name.toLowerCase().includes(paletteSearch.toLowerCase()) : true,
      ),
    [paletteGroup, paletteSearch],
  );

  const nextReminders = useMemo(() => buildReminders(data).filter((r) => r.fireAt.getTime() > Date.now()).slice(0, 5), [data]);

  const saveIdentity = async () => {
    setSavingIdentity(true);
    try {
      await mutate("/api/settings", "PATCH", {
        professionalName,
        appName,
        about,
        profileImage,
        coverImage: coverImage || profileImage,
        currency,
        monthlyGoalCents: parseMoneyToCents(goal),
        initialBalanceCents: parseMoneyToCents(initialBalance),
        paymentInstructions,
      });
      toast("Preferências salvas.", "success");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSavingIdentity(false);
    }
  };

  const applyPaletteChoice = async (paletteId: string) => {
    applyPalette(paletteId);
    try {
      await mutate("/api/settings", "PATCH", { palette: paletteId });
      toast("Paleta aplicada em todo o aplicativo.", "success");
    } catch (error) {
      toast((error as Error).message, "error");
    }
  };

  const updateSetting = async (patch: Record<string, unknown>, message = "Preferência atualizada.") => {
    try {
      await mutate("/api/settings", "PATCH", patch);
      toast(message, "success");
    } catch (error) {
      toast((error as Error).message, "error");
    }
  };

  const addCategory = async (kind: "incomeCategories" | "expenseCategories" | "paymentMethods", value: string) => {
    if (!value.trim()) return;
    const current = settings[kind];
    if (current.includes(value.trim())) {
      toast("Esta categoria já existe.", "info");
      return;
    }
    await updateSetting({ [kind]: [...current, value.trim()] }, "Categoria adicionada.");
  };

  const removeCategory = async (kind: "incomeCategories" | "expenseCategories" | "paymentMethods", value: string) => {
    await updateSetting({ [kind]: settings[kind].filter((item) => item !== value) }, "Categoria removida.");
  };

  const exportBackup = async () => {
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error("Não foi possível gerar o backup.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cartomante-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      await mutate("/api/settings", "PATCH", { lastBackupAt: new Date().toISOString() });
      toast("Backup exportado. Guarde o arquivo em local seguro.", "success");
    } catch (error) {
      toast((error as Error).message, "error");
    }
  };

  const onFileSelected = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed !== "object" || !parsed.data) throw new Error("Arquivo inválido: estrutura de backup não reconhecida.");
      setImportPayload(parsed);
      setImportCounts((parsed.counts as Record<string, number>) ?? null);
      setImportOpen(true);
    } catch (error) {
      toast(`Importação cancelada. ${(error as Error).message}`, "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runImport = async () => {
    if (!importPayload) return;
    try {
      const result = await mutate("/api/backup", "POST", { mode: importMode, payload: importPayload });
      toast(String(result.message ?? "Backup importado."), "success");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setImportOpen(false);
      setImportPayload(null);
      setImportCounts(null);
    }
  };

  const savePin = async () => {
    if (!pinEnabled) {
      await updateSetting({ lockEnabled: false }, "Bloqueio local desativado.");
      setPin("");
      return;
    }
    if (!/^\d{4,8}$/.test(pin) && !settings.lockEnabled) {
      toast("Defina uma senha numérica de 4 a 8 dígitos.", "error");
      return;
    }
    await updateSetting(pin ? { lockEnabled: true, pin } : { lockEnabled: true }, pin ? "Bloqueio local ativado. Guarde sua senha." : "Bloqueio mantido.");
    setPin("");
  };

  const wipeData = async () => {
    try {
      const result = await mutate("/api/account", "POST", { action: "wipe", confirmation: wipeText });
      toast(String(result.message ?? "Dados excluídos."), "success");
      setWipeOpen(false);
      setWipeText("");
    } catch (error) {
      toast((error as Error).message, "error");
    }
  };

  const requestNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast("Este navegador não suporta notificações do sistema.", "error");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    toast(result === "granted" ? "Notificações permitidas." : "Permissão não concedida — os lembretes seguem visíveis na agenda.", result === "granted" ? "success" : "info");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="heading text-lg font-semibold">Configurações e backup</h2>
        <p className="muted text-xs">Personalize a aparência, moeda, metas, lembretes, privacidade e seus arquivos de segurança.</p>
      </div>

      <section className="card p-4">
        <SectionTitle title="Identidade profissional" subtitle="Aparece no topo do app e nos relatórios" icon="sparkles" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome profissional">
            <input className="input" value={professionalName} onChange={(e) => setProfessionalName(e.target.value)} placeholder="Como você quer ser chamada" />
          </Field>
          <Field label="Nome do aplicativo">
            <input className="input" value={appName} onChange={(e) => setAppName(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <ImagePickerField
            label="Imagem de capa do painel (editável)"
            value={coverImage}
            onChange={setCoverImage}
            aspect="wide"
            hint="Envie uma foto do seu celular, tablet ou computador ou escolha na galeria acima."
          />
          <ImagePickerField
            label="Foto ou logo de perfil (editável)"
            value={profileImage}
            onChange={setProfileImage}
            aspect="square"
            hint="Aparece no menu lateral e no cabeçalho móvel."
          />
        </div>
        <Field label="Sobre o atendimento" hint="Texto curto sobre seu trabalho (opcional)." className="mt-3">
          <textarea className="textarea" value={about} onChange={(e) => setAbout(e.target.value)} />
        </Field>
        <button type="button" className="btn btn-primary btn-sm mt-3" onClick={() => void saveIdentity()} disabled={savingIdentity}>
          <Icon name="save" size={14} /> {savingIdentity ? "Salvando..." : "Salvar identidade e imagens"}
        </button>
      </section>

      <section className="card p-4">
        <SectionTitle
          title="Mensagens pré-programadas do WhatsApp"
          subtitle="Personalize os modelos que aparecem na hora de enviar mensagem para suas consulentes"
          icon="whatsapp"
        />
        <WhatsAppTemplatesManager />
      </section>

      <section className="card p-4">
        <SectionTitle
          title="Planilha padrão — importar e exportar registros"
          subtitle="Baixe a planilha modelo, preencha seus atendimentos e importe para dentro do aplicativo"
          icon="table"
        />
        <SpreadsheetCenter />
      </section>

      <section className="card p-4">
        <SectionTitle
          title="Acessar no Telefone, Tablet e Web"
          subtitle="Use a mesma conta em celulares, tablets e computadores com interface responsiva"
          icon="devices"
        />
        <DeviceAccessContent />
      </section>

      <section className="card p-4">
        <SectionTitle title="Paletas de cores" subtitle={`${PALETTES.length} paletas editáveis — incluindo Rosa & Ouro e Ametista & Ouro`} icon="image" />
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-[10rem] flex-1">
            <input className="input pl-8" value={paletteSearch} onChange={(e) => setPaletteSearch(e.target.value)} placeholder="Buscar paleta" />
            <span className="absolute left-2.5 top-2.5 muted">
              <Icon name="search" size={15} />
            </span>
          </div>
          {["Todas", ...PALETTE_GROUPS].map((group) => (
            <button key={group} type="button" className={cx("chip", paletteGroup === group && "chip-active")} onClick={() => setPaletteGroup(group)}>
              {group}
            </button>
          ))}
        </div>
        <div className="grid max-h-80 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {filteredPalettes.map((palette) => (
            <button
              key={palette.id}
              type="button"
              onClick={() => void applyPaletteChoice(palette.id)}
              className="rounded-xl border p-1.5 text-left"
              style={{
                borderColor: settings.palette === palette.id ? "var(--primary)" : "var(--border)",
                background: palette.bg,
                color: palette.text,
              }}
            >
              <div className="flex gap-1">
                <span className="h-4 w-4 rounded-full" style={{ background: palette.primary }} />
                <span className="h-4 w-4 rounded-full" style={{ background: palette.accent }} />
                <span className="h-4 w-4 rounded-full border" style={{ background: palette.surface, borderColor: palette.border }} />
                {settings.palette === palette.id ? <Icon name="check" size={14} /> : null}
              </div>
              <p className="mt-1 truncate text-[0.68rem] font-semibold">{palette.name}</p>
              <p className="truncate text-[0.58rem] opacity-80">{palette.group}</p>
            </button>
          ))}
        </div>
        <p className="muted mt-2 text-[0.68rem]">A paleta é aplicada imediatamente e fica salva na sua conta.</p>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card p-4">
          <SectionTitle title="Moeda e metas" subtitle="Formato dos valores em todo o app" icon="coins" />
          <Field label="Moeda">
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)}>
              {CURRENCY_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {CURRENCIES[code].label}
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field label="Meta financeira mensal">
              <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Saldo inicial" hint="Não é alterado silenciosamente.">
              <input className="input" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} inputMode="decimal" />
            </Field>
          </div>
          <Field label="Instruções de pagamento (opcional)" className="mt-2">
            <textarea className="textarea" value={paymentInstructions} onChange={(e) => setPaymentInstructions(e.target.value)} />
          </Field>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveIdentity()}>
              <Icon name="save" size={14} /> Salvar
            </button>
            <span className="chip">Saldo exibido: {money(settings.initialBalanceCents)}</span>
          </div>
        </section>

        <section className="card p-4">
          <SectionTitle title="Lembretes" subtitle="Notificações locais no dispositivo" icon="bell" />
          <div className="space-y-2">
            <Toggle checked={settings.reminder24h} onChange={(value) => void updateSetting({ reminder24h: value })} label="24 horas antes" />
            <Toggle checked={settings.reminder1h} onChange={(value) => void updateSetting({ reminder1h: value })} label="1 hora antes" />
            <Toggle checked={settings.reminderDay} onChange={(value) => void updateSetting({ reminderDay: value })} label="No dia da consulta" />
            <Field label="Horário do lembrete do dia">
              <input
                type="time"
                className="input"
                value={settings.reminderDayTime}
                onChange={(e) => void updateSetting({ reminderDayTime: e.target.value })}
              />
            </Field>
          </div>
          <div className="card-muted mt-2 space-y-1 p-2 text-[0.68rem]">
            <p className="muted">
              Permissão do dispositivo: <strong>{permission === "granted" ? "concedida" : permission === "denied" ? "negada" : permission === "unsupported" ? "não suportada" : "não solicitada"}</strong>
            </p>
            {permission !== "granted" && permission !== "unsupported" ? (
              <button type="button" className="btn btn-outline btn-sm w-full" onClick={() => void requestNotifications()}>
                Solicitar permissão
              </button>
            ) : null}
            <p className="muted">
              Limitação real: notificações do sistema dependem do navegador e de o app estar aberto/instalado. Não enviamos dados sigilosos nem valores
              nos avisos. Cancelar uma consulta remove seus lembretes e alterar data/horário cria novos avisos automaticamente.
            </p>
            {nextReminders.map((reminder) => (
              <p key={reminder.key} className="muted">
                • {reminder.consulenteName} · {formatDateBR(reminder.date)} {reminder.startTime} · {reminder.label}
              </p>
            ))}
          </div>
        </section>
      </div>

      <section className="card p-4">
        <SectionTitle title="Categorias e formas de pagamento" subtitle="Personalize seus lançamentos financeiros" icon="filter" />
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["expenseCategories", "Despesas", "expense"],
            ["incomeCategories", "Entradas", "income"],
            ["paymentMethods", "Formas de pagamento", "payment"],
          ] as const).map(([key, label, formKey]) => (
            <div key={key}>
              <p className="label">{label}</p>
              <div className="mb-1 flex flex-wrap gap-1">
                {settings[key].map((item) => (
                  <span key={item} className="chip">
                    {item}
                    <button type="button" onClick={() => void removeCategory(key, item)} aria-label={`Remover ${item}`}>
                      <Icon name="x" size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  className="input py-1 text-xs"
                  value={newCategory[formKey]}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, [formKey]: e.target.value }))}
                  placeholder="Nova categoria"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addCategory(key, newCategory[formKey]);
                      setNewCategory((prev) => ({ ...prev, [formKey]: "" }));
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    void addCategory(key, newCategory[formKey]);
                    setNewCategory((prev) => ({ ...prev, [formKey]: "" }));
                  }}
                >
                  <Icon name="plus" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card p-4">
          <SectionTitle title="Backup e restauração" subtitle="Seus dados também ficam neste dispositivo/navegador em cache" icon="download" />
          <div className="space-y-2">
            <button type="button" className="btn btn-primary btn-sm w-full" onClick={() => void exportBackup()}>
              <Icon name="download" size={14} /> Exportar todos os dados (JSON)
            </button>
            <div className="card-muted p-2 text-[0.68rem]">
              <p className="muted">
                Último backup: <strong>{settings.lastBackupAt ? formatDateTimeBR(settings.lastBackupAt) : "nenhum backup registrado"}</strong>
              </p>
              <p className="muted">O backup inclui consulentes, métodos, consultas, pagamentos, lançamentos, metas e preferências.</p>
            </div>
            <div className="divider" />
            <p className="text-xs font-semibold">Importar backup</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="input text-xs"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFileSelected(file);
              }}
            />
            <p className="muted text-[0.68rem] leading-snug">
              Validamos o arquivo antes de importar, fazemos uma cópia de segurança automática dos dados atuais e detectamos possíveis duplicidades.
              Nunca substituímos tudo sem sua confirmação.
            </p>
          </div>
        </section>

        <section className="card p-4">
          <SectionTitle title="Privacidade e segurança" subtitle="Transparência sobre onde os dados ficam" icon="shield" />
          <div className="space-y-2 text-xs">
            <p className="muted leading-snug">
              Seus registros ficam na sua conta privada deste aplicativo (acessível no seu telefone, tablet e computador com seu e-mail e senha) e em
              cache local do navegador. Não há rastreadores publicitários, venda de dados ou compartilhamento com terceiros. Recomendamos exportar
              backups JSON ou a Planilha Padrão periodicamente.
            </p>
            <div className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
              <p className="font-semibold">Bloqueio local por senha</p>
              <p className="muted mb-1 leading-snug">
                Uma senha numérica de 4 a 8 dígitos protege a abertura do painel neste dispositivo. {settings.lockEnabled ? "Está ativado." : "Está desativado."} O
                bloqueio é uma proteção de acesso — não é criptografia dos dados.
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  className="input w-28 py-1 text-xs"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Nova senha"
                  inputMode="numeric"
                  autoComplete="new-password"
                />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void savePin()}>
                  <Icon name="lock" size={13} /> {pinEnabled ? "Salvar/ativar" : "Ativar"}
                </button>
                {settings.lockEnabled ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setPinEnabled(false);
                      setPin("");
                      void updateSetting({ lockEnabled: false }, "Bloqueio local desativado.");
                    }}
                  >
                    Desativar
                  </button>
                ) : null}
              </div>
            </div>
            <div className="rounded-lg border border-rose-400/50 bg-rose-500/5 p-2">
              <p className="font-semibold text-rose-600">Excluir todos os dados</p>
              <p className="muted mb-1 leading-snug">Remove permanentemente consulentes, consultas, pagamentos e lançamentos desta conta.</p>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setWipeOpen(true)}>
                <Icon name="trash" size={13} /> Excluir dados da aplicação
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="card p-4">
        <SectionTitle title="Sobre o aplicativo" subtitle="Conta, versão e armazenamento" icon="moon" />
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <p className="muted">Versão: <strong style={{ color: "var(--text)" }}>1.0.0</strong></p>
          <p className="muted">Conta: <strong style={{ color: "var(--text)" }}>{data.tenant.name}</strong> ({data.tenant.email})</p>
          <p className="muted">Plano: <strong style={{ color: "var(--text)" }}>{data.tenant.isDemo ? "Demonstração (dados fictícios)" : data.tenant.plan === "monthly" ? "Mensal" : data.tenant.plan === "annual" ? "Anual" : "Vitalício"}</strong></p>
          <p className="muted">Validade do acesso: <strong style={{ color: "var(--text)" }}>{data.tenant.expiresAt ? formatDateBR(data.tenant.expiresAt) : "sem expiração"}</strong></p>
          <p className="muted">Armazenamento: PostgreSQL privado da conta + cache local. Backup manual recomendado.</p>
          <p className="muted">Formato de datas: DD/MM/AAAA · horários 24h · moeda {CURRENCIES[settings.currency].label}</p>
        </div>
        <p className="muted mt-2 text-[0.68rem] leading-snug">
          Funcionamento offline: o app mantém a última visualização carregada e os arquivos essenciais em cache (PWA). Novas gravações exigem conexão
          com o serviço. A instalação como aplicativo depende do suporte do navegador/dispositivo.
        </p>
      </section>

      <ConfirmDialog
        open={importOpen}
        title="Confirmar importação de backup"
        message={
          importMode === "replace"
            ? "O modo SUBSTITUIR apaga os dados atuais desta conta e restaura o arquivo. Uma cópia de segurança automática dos dados atuais será salva antes."
            : "O modo MESCLAR adiciona apenas registros que ainda não existem (duplicidades são ignoradas)."
        }
        confirmLabel="Importar agora"
        onClose={() => setImportOpen(false)}
        onConfirm={() => void runImport()}
        danger={importMode === "replace"}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {(["merge", "replace"] as const).map((mode) => (
              <button key={mode} type="button" className={cx("chip", importMode === mode && "chip-active")} onClick={() => setImportMode(mode)}>
                {mode === "merge" ? "Mesclar" : "Substituir todos"}
              </button>
            ))}
          </div>
          {importCounts ? (
            <ul className="muted text-[0.7rem]">
              {Object.entries(importCounts).map(([key, value]) => (
                <li key={key}>
                  {key}: {value}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={wipeOpen}
        title="Excluir todos os dados"
        message="Esta operação é irreversível. Para confirmar, digite EXCLUIR no campo abaixo."
        confirmLabel="Excluir definitivamente"
        onClose={() => setWipeOpen(false)}
        onConfirm={() => void wipeData()}
      >
        <input className="input" value={wipeText} onChange={(e) => setWipeText(e.target.value)} placeholder="Digite EXCLUIR" />
      </ConfirmDialog>
    </div>
  );
}
