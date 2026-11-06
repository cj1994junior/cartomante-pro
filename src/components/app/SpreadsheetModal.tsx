"use client";

import { useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Field, Icon, Modal } from "@/components/ui";
import { formatDateBR } from "@/lib/format";

type PreviewResponse = {
  ok: boolean;
  dryRun: boolean;
  summary: {
    consulentes: number;
    metodos: number;
    catalogoTrabalhos: number;
    consultas: number;
    trabalhos: number;
    financeiro: number;
    total: number;
  };
  warnings: string[];
  preview?: {
    consulentes: { name: string; phone: string | null }[];
    consultas: { date: string; startTime: string; consulenteName: string; methodName: string }[];
    trabalhos: { date: string; kind: string; title: string; consulenteName: string }[];
    financeiro: { date: string; type: string; description: string; amountCents: number }[];
  };
};

export function SpreadsheetCenter({ onDone }: { onDone?: () => void }) {
  const { refresh, toast, money } = useApp();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sheetHint, setSheetHint] = useState("consultas");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const downloadFile = async (url: string, fallbackName: string, key: string) => {
    setDownloading(key);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Não foi possível gerar a planilha.");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objUrl;
      link.download = fallbackName;
      link.click();
      URL.revokeObjectURL(objUrl);
      toast("Planilha baixada com sucesso.", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setDownloading(null);
    }
  };

  const analyzeFile = async (file: File, hint = sheetHint) => {
    setSelectedFile(file);
    setPreview(null);
    setError(null);
    setResultMsg(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dryRun", "true");
      fd.append("sheetHint", hint);
      const res = await fetch("/api/spreadsheet", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as PreviewResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Não foi possível validar a planilha.");
      setPreview(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("dryRun", "false");
      fd.append("sheetHint", sheetHint);
      const res = await fetch("/api/spreadsheet", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        created?: Record<string, number>;
        skipped?: Record<string, number>;
      };
      if (!res.ok) throw new Error(json.error ?? "Falha ao importar planilha.");
      await refresh();
      const created = json.created ?? {};
      const parts = [
        created.consulentes ? `${created.consulentes} consulente(s)` : "",
        created.metodos ? `${created.metodos} método(s)` : "",
        created.catalogoTrabalhos ? `${created.catalogoTrabalhos} tipo(s) de trabalho` : "",
        created.consultas ? `${created.consultas} consulta(s)` : "",
        created.trabalhos ? `${created.trabalhos} trabalho(s)/terapia(s)` : "",
        created.pagamentos ? `${created.pagamentos} pagamento(s)` : "",
        created.financeiro ? `${created.financeiro} lançamento(s)` : "",
      ].filter(Boolean);
      const msg = parts.length
        ? `Importação concluída: ${parts.join(", ")}.`
        : "Planilha verificada: todos os registros já estavam cadastrados (nenhuma duplicidade criada).";
      setResultMsg(msg);
      setPreview(null);
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast(msg, "success");
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card-muted space-y-2 p-3.5">
          <div className="flex items-center gap-2">
            <span className="rounded-lg p-1.5" style={{ background: "var(--primary-soft)" }}>
              <Icon name="download" size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold">1. Baixar Planilha Padrão</p>
              <p className="muted text-[0.7rem]">Modelo pronto para Excel, Google Planilhas ou Numbers</p>
            </div>
          </div>
          <p className="muted text-xs leading-snug">
            A planilha inclui abas organizadas para <strong>Consulentes</strong>, <strong>Métodos de tiragem</strong>,{" "}
            <strong>Consultas</strong>, <strong>Trabalhos, Magias e Atividades</strong> e <strong>Financeiro</strong>, com instruções em
            português.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm w-full"
            disabled={downloading === "tpl-xlsx"}
            onClick={() =>
              void downloadFile(
                "/api/spreadsheet?mode=template&format=xlsx",
                "cartomante-pro-planilha-padrao.xlsx",
                "tpl-xlsx",
              )
            }
          >
            <Icon name="table" size={14} />{" "}
            {downloading === "tpl-xlsx" ? "Gerando..." : "Baixar Planilha Padrão (.xlsx)"}
          </button>
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <span className="muted text-[0.65rem]">Ou modelo CSV por aba:</span>
            {([
              ["consultas", "Consultas"],
              ["trabalhos", "Trabalhos/Magias"],
              ["consulentes", "Consulentes"],
              ["financeiro", "Financeiro"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="chip hover:opacity-80"
                onClick={() =>
                  void downloadFile(
                    `/api/spreadsheet?mode=template&format=csv&sheet=${key}`,
                    `planilha-padrao-${key}.csv`,
                    `csv-${key}`,
                  )
                }
              >
                {label} (.csv)
              </button>
            ))}
          </div>
        </div>

        <div className="card-muted space-y-2 p-3.5">
          <div className="flex items-center gap-2">
            <span className="rounded-lg p-1.5" style={{ background: "var(--accent-soft)" }}>
              <Icon name="table" size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold">Exportar meus registros em planilha</p>
              <p className="muted text-[0.7rem]">Baixe todos os dados já cadastrados no app</p>
            </div>
          </div>
          <p className="muted text-xs leading-snug">
            Gera uma planilha Excel completa com todas as suas consulentes, consultas, trabalhos/terapias, pagamentos e despesas no mesmo
            formato padrão (pode ser editada e reimportada).
          </p>
          <button
            type="button"
            className="btn btn-outline btn-sm w-full"
            disabled={downloading === "exp-xlsx"}
            onClick={() =>
              void downloadFile(
                "/api/spreadsheet?mode=export&format=xlsx",
                `cartomante-pro-registros-${new Date().toISOString().slice(0, 10)}.xlsx`,
                "exp-xlsx",
              )
            }
          >
            <Icon name="download" size={14} />{" "}
            {downloading === "exp-xlsx" ? "Exportando..." : "Exportar registros atuais (.xlsx)"}
          </button>
        </div>
      </div>

      <div className="card-muted space-y-3 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-lg p-1.5" style={{ background: "var(--primary-soft)" }}>
              <Icon name="upload" size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold">2. Importar planilha preenchida para o aplicativo</p>
              <p className="muted text-[0.7rem]">Aceita arquivos .xlsx (Excel / Google Planilhas) e .csv</p>
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-[1.5fr_1fr]">
          <Field label="Selecionar arquivo preenchido (.xlsx ou .csv)">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.ods,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="input text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void analyzeFile(f);
              }}
            />
          </Field>
          <Field label="Se for CSV único, qual tipo?" hint="Para .xlsx multi-abas o reconhecimento é automático.">
            <select
              className="select text-xs"
              value={sheetHint}
              onChange={(e) => {
                setSheetHint(e.target.value);
                if (selectedFile) void analyzeFile(selectedFile, e.target.value);
              }}
            >
              <option value="consultas">Consultas</option>
              <option value="trabalhos">Trabalhos, Magias e Atividades</option>
              <option value="consulentes">Consulentes</option>
              <option value="metodos">Métodos de tiragem</option>
              <option value="catalogo_trabalhos">Catálogo de trabalhos</option>
              <option value="financeiro">Financeiro (entradas/despesas)</option>
            </select>
          </Field>
        </div>

        {loading ? <p className="muted text-xs">Validando planilha e conferindo registros...</p> : null}
        {error ? <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2.5 text-xs text-rose-600">{error}</div> : null}
        {resultMsg ? (
          <div className="rounded-lg border border-emerald-400/50 bg-emerald-500/10 p-2.5 text-xs text-emerald-700">{resultMsg}</div>
        ) : null}

        {preview ? (
          <div className="space-y-2.5 rounded-xl border p-3" style={{ borderColor: "var(--primary)", background: "var(--surface)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide">
                Pré-visualização — {preview.summary.total} registro(s) reconhecido(s)
              </p>
              <span className="chip chip-active">Pronto para importar</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
              <div className="card-muted p-2">Consulentes: <strong>{preview.summary.consulentes}</strong></div>
              <div className="card-muted p-2">Métodos: <strong>{preview.summary.metodos}</strong></div>
              <div className="card-muted p-2">Catálogo trabalhos: <strong>{preview.summary.catalogoTrabalhos}</strong></div>
              <div className="card-muted p-2">Consultas: <strong>{preview.summary.consultas}</strong></div>
              <div className="card-muted p-2">Trabalhos / terapias: <strong>{preview.summary.trabalhos}</strong></div>
              <div className="card-muted p-2">Financeiro: <strong>{preview.summary.financeiro}</strong></div>
            </div>

            {preview.preview ? (
              <div className="muted space-y-1 text-[0.7rem]">
                {preview.preview.consultas.map((c, idx) => (
                  <p key={`pc-${idx}`}>• Consulta: {formatDateBR(c.date)} {c.startTime} — {c.consulenteName} ({c.methodName})</p>
                ))}
                {preview.preview.trabalhos.map((w, idx) => (
                  <p key={`pw-${idx}`}>• {w.kind === "atividade" ? "Atividade" : "Trabalho"}: {formatDateBR(w.date)} — {w.title} ({w.consulenteName})</p>
                ))}
                {preview.preview.financeiro.map((t, idx) => (
                  <p key={`pf-${idx}`}>• Financeiro ({t.type}): {formatDateBR(t.date)} — {t.description} ({money(t.amountCents)})</p>
                ))}
              </div>
            ) : null}

            {preview.warnings.length ? (
              <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-2 text-[0.68rem]">
                <p className="font-semibold">Avisos em algumas linhas (ignoradas):</p>
                <ul className="mt-0.5 list-disc pl-4">
                  {preview.warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setPreview(null);
                  setSelectedFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Cancelar
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void confirmImport()} disabled={importing}>
                <Icon name="check" size={14} /> {importing ? "Importando..." : "Confirmar e importar registros"}
              </button>
            </div>
          </div>
        ) : null}

        <p className="muted text-[0.68rem] leading-snug">
          Proteção automática: antes de importar, o aplicativo cria uma cópia de segurança dos dados atuais, cadastra consulentes ou métodos novos
          automaticamente e ignora registros idênticos para não duplicar entradas financeiras.
        </p>
      </div>
    </div>
  );
}

export function SpreadsheetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Planilha padrão — importar e exportar registros"
      subtitle="Baixe o modelo padrão, preencha seus atendimentos e importe para dentro do aplicativo."
      wide
      footer={
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <SpreadsheetCenter />
    </Modal>
  );
}
