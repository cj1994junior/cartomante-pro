"use client";

import { useEffect, useState } from "react";
import { Field, Icon, Modal } from "@/components/ui";
import { formatDateBR, PLAN_LABEL } from "@/lib/format";
import type { DevTenant, Plan, TenantStatus } from "@/lib/types";

export type CreatedAccountAccess = {
  name: string;
  email: string;
  password: string;
  plan: Plan;
  status: TenantStatus;
  expiresAt: string | null;
  isNew: boolean;
};

function useProfessionalLink() {
  const [link, setLink] = useState("");
  useEffect(() => {
    setLink(new URL("/", window.location.href).toString());
  }, []);
  return link;
}

async function copyText(text: string) {
  if (!text) throw new Error("O link ainda está sendo preparado.");
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.left = "-9999px";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Não foi possível copiar automaticamente. Selecione o endereço e copie manualmente.");
}

export function ProfessionalAccessLink() {
  const link = useProfessionalLink();
  const [message, setMessage] = useState("");
  const copy = async () => {
    try {
      await copyText(link);
      setMessage("Link copiado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível copiar o link.");
    }
  };

  return (
    <section className="card p-3.5" aria-label="Link de acesso para as profissionais">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="rounded-xl p-2" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
            <Icon name="share" size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Link de acesso das profissionais</h3>
            <p className="muted mt-0.5 text-xs leading-relaxed">
              Compartilhe este endereço, da mesma instalação onde a conta foi criada. A profissional deve selecionar
              <strong> Profissional</strong> e entrar com o e-mail e a senha cadastrados.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input className="input min-w-0 flex-1 text-xs" readOnly value={link} aria-label="Link de acesso das profissionais" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void copy()} disabled={!link}>
          <Icon name="copy" size={14} /> Copiar link
        </button>
        {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">Abrir login</a> : null}
      </div>
      <p className="muted mt-2 text-[0.7rem] leading-relaxed">
        Links de previews ou instalações diferentes podem usar bancos de dados separados. Uma conta criada em um endereço pode não existir em outro.
        Para uso contínuo, publique o aplicativo em um endereço estável.
      </p>
      {message ? <p className="mt-1 text-xs" role="status">{message}</p> : null}
    </section>
  );
}

export function AccountAccessModal({ access, onClose }: { access: CreatedAccountAccess | null; onClose: () => void }) {
  const link = useProfessionalLink();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setShowPassword(false);
    setMessage("");
  }, [access?.email]);

  if (!access) return null;
  const active = access.status === "active";
  const copy = async (value: string, label: string) => {
    try {
      await copyText(value);
      setMessage(`${label} copiado.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível copiar.");
    }
  };

  return (
    <Modal
      open={Boolean(access)}
      onClose={onClose}
      title={access.isNew ? "Conta criada" : "Senha atualizada"}
      subtitle="Confira os dados de acesso antes de enviá-los à profissional."
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Concluir</button>}
    >
      <div className="space-y-3">
        <div className="rounded-xl border p-3 text-xs" style={{ borderColor: active ? "#1f8a5b" : "#b7791f", background: active ? "rgba(31,138,91,.09)" : "rgba(183,121,31,.09)" }}>
          <p className="font-semibold">{active ? "Acesso ativo" : access.status === "blocked" ? "Acesso bloqueado" : "Acesso vencido"}</p>
          <p className="muted mt-0.5">
            {active
              ? `Plano ${PLAN_LABEL[access.plan]}${access.expiresAt ? ` · válido até ${formatDateBR(access.expiresAt)}` : " · sem vencimento"}.`
              : "Esta conta não conseguirá entrar até que o acesso seja ativado ou a licença renovada."}
          </p>
        </div>
        <Field label="Link para entrar no aplicativo">
          <div className="flex gap-1.5">
            <input className="input min-w-0 flex-1 text-xs" readOnly value={link} />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void copy(link, "Link")}>Copiar</button>
          </div>
        </Field>
        <Field label="E-mail da profissional">
          <div className="flex gap-1.5">
            <input className="input min-w-0 flex-1 text-xs" readOnly value={access.email} />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void copy(access.email, "E-mail")}>Copiar</button>
          </div>
        </Field>
        <Field label="Senha cadastrada" hint="A senha é exibida apenas agora. Se necessário, ela poderá ser redefinida em Editar.">
          <div className="flex gap-1.5">
            <input
              className="input min-w-0 flex-1 text-xs"
              readOnly
              type={showPassword ? "text" : "password"}
              value={access.password}
              autoComplete="off"
            />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void copy(access.password, "Senha")}>Copiar</button>
          </div>
        </Field>
        <p className="muted text-[0.7rem] leading-relaxed">
          Envie a senha por um meio seguro. Ela não é incluída no link nem ficará disponível novamente no painel.
          Na tela inicial, escolha a aba <strong>Profissional</strong>.
        </p>
        {message ? <p className="text-xs" role="status">{message}</p> : null}
      </div>
    </Modal>
  );
}

export function VerifyAccountAccessModal({ tenant, onClose }: { tenant: DevTenant | null; onClose: () => void }) {
  const link = useProfessionalLink();
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setPassword("");
    setResult(null);
  }, [tenant?.id]);

  if (!tenant) return null;
  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch(`/api/dev/tenants/${tenant.id}/verify-access`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      setResult({
        ok: res.ok,
        message: res.ok ? (body.message ?? "Acesso validado.") : (body.error ?? "Não foi possível verificar o acesso."),
      });
    } catch {
      setResult({ ok: false, message: "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente." });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal
      open={Boolean(tenant)}
      onClose={onClose}
      title="Verificar acesso da profissional"
      subtitle="Confirme a senha e a licença sem sair da conta de desenvolvedor."
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Fechar</button>
          <button type="submit" form="verify-tenant-access" className="btn btn-primary" disabled={checking || !password}>
            <Icon name="check" size={14} /> {checking ? "Verificando..." : "Verificar acesso"}
          </button>
        </>
      }
    >
      <form id="verify-tenant-access" className="space-y-3" onSubmit={verify}>
        <div className="card-muted p-3 text-xs">
          <p className="font-semibold">{tenant.name}</p>
          <p className="muted mt-0.5">E-mail de acesso: {tenant.email}</p>
          <p className="muted mt-0.5">Link desta instalação: <span className="break-all">{link}</span></p>
        </div>
        <Field label="Senha da profissional" required hint="A senha é usada somente nesta verificação e não é exibida ou armazenada em texto no servidor.">
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" />
        </Field>
        {result ? (
          <p role="status" className="rounded-lg border p-2.5 text-xs" style={{ borderColor: result.ok ? "#1f8a5b" : "#b4231b", background: result.ok ? "rgba(31,138,91,.10)" : "rgba(180,35,27,.08)" }}>
            {result.message}
          </p>
        ) : null}
        <p className="muted text-[0.7rem]">Se a senha não conferir, use <strong>Editar</strong> na conta para definir outra. Se a licença estiver bloqueada ou vencida, ative ou renove o acesso.</p>
      </form>
    </Modal>
  );
}
