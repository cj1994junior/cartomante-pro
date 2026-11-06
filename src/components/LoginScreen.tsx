"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, Field, cx } from "@/components/ui";
import { applyPalette } from "@/components/ThemeProvider";
import { formatMoney, PLAN_LABEL } from "@/lib/format";
import { getPalette } from "@/lib/palettes";

type Role = "tenant" | "developer";

type PublicInfo = {
  paymentInstructions: string;
  supportContact: string;
  autoBlockNotice: string;
  planPrices: { monthly: number; annual: number; lifetime: number };
  showcaseImages: string[];
};

const FEATURES = [
  ["Cronômetro real de consultas", "Inicie, pause e finalize cada consulta para medir com precisão o tempo real trabalhado no mês."],
  ["WhatsApp pré-programado", "Envie confirmações, lembretes, Pix, atualizações de trabalhos e pós-consulta com 1 clique."],
  ["Trabalhos, magias e terapias", "Abertura de caminhos, vira pensamento, adoçamento, reiki, aromaterapia e acupuntura com fotos editáveis."],
  ["Planilha padrão e multi-aparelhos", "Importe/exporte planilhas (.xlsx e .csv) e acesse sua conta no telefone, tablet e computador."],
];

export function LoginScreen() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("tenant");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{ instructions: string; support: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [sessionRole, setSessionRole] = useState<string | null>(null);

  useEffect(() => {
    applyPalette(getPalette(null).id);
    fetch("/api/public/info", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setInfo(data))
      .catch(() => setInfo(null));
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { role: string | null }) => setSessionRole(data.role))
      .catch(() => setSessionRole(null));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPaymentInfo(null);
    const finalEmail = email;
    const finalPassword = password;
    const finalRole = role;
    if (!finalEmail || !finalPassword) {
      setError("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: finalEmail, password: finalPassword, role: finalRole }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
        paymentInstructions?: string;
        supportContact?: string;
      };
      if (!res.ok) {
        setError(
          res.status === 401 && finalRole === "tenant"
            ? "E-mail ou senha incorretos. Confira também se está usando o link enviado pelo responsável pela sua conta."
            : (body.error ?? "Não foi possível entrar."),
        );
        if (res.status === 402) {
          setPaymentInfo({
            instructions: body.paymentInstructions || info?.paymentInstructions || "Entre em contato com o suporte para renovar sua licença.",
            support: body.supportContact || info?.supportContact || "",
          });
        }
        return;
      }
      // Detecta imediatamente quando o navegador não preserva o cookie da sessão.
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
      if (!sessionRes.ok) {
        setError("Não foi possível confirmar sua sessão. Verifique a conexão e tente novamente.");
        return;
      }
      const session = (await sessionRes.json()) as { role?: string | null };
      if (session.role !== finalRole) {
        setError("O navegador não manteve a sessão. Abra o link em HTTPS e permita cookies para este site.");
        return;
      }
      router.push(body.redirect ?? "/app");
      router.refresh();
    } catch {
      setError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/tarot-hero.jpg" alt="Mesa de tarot com cartas douradas e ametistas" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(150deg, rgba(20,12,36,0.92) 0%, rgba(43,26,72,0.72) 55%, rgba(20,12,36,0.92) 100%)" }} />
        <div className="starfield absolute inset-0 opacity-60" />
        <div className="relative flex h-full flex-col justify-between p-8 text-[#f7f0e4] xl:p-12">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(140deg,#d9b969,#a67c22)" }}>
              <Icon name="moon" size={22} className="text-[#231634]" />
            </span>
            <div>
              <p className="heading text-xl font-semibold">Cartomante Pro</p>
              <p className="text-sm text-[#d9c9a8]">Seu ateliê organizado, do agendamento ao backup.</p>
            </div>
          </div>
          <div className="max-w-lg">
            <h1 className="heading text-3xl font-semibold leading-tight xl:text-4xl">
              Consultas, pagamentos e metas em um único painel elegante.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#e4d7c2]">
              Feito para a profissional que atende sozinha: agenda, consulentes, métodos de tiragem, finanças, relatórios e segurança — sem planilhas
              espalhadas.
            </p>
            <ul className="mt-5 space-y-2.5">
              {FEATURES.map(([title, description]) => (
                <li key={title} className="flex items-start gap-2.5">
                  <span className="mt-0.5 rounded-full bg-[#d9b969]/20 p-1 text-[#e7cd8e]">
                    <Icon name="check" size={13} />
                  </span>
                  <span className="text-sm">
                    <strong className="font-semibold text-[#f7f0e4]">{title}</strong>
                    <span className="block text-xs text-[#cdbfa9]">{description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-[#cdbfa9]">
            {info
              ? (Object.keys(info.planPrices) as (keyof PublicInfo["planPrices"])[]).map((plan) => (
                  <span key={plan} className="rounded-full border border-[#d9b969]/40 px-2.5 py-1">
                    {PLAN_LABEL[plan]}: {formatMoney(info.planPrices[plan], "BRL")}
                  </span>
                ))
              : null}
          </div>
        </div>
      </aside>

      <main className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-4 flex items-center gap-2 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(140deg, var(--primary), var(--accent))", color: "#fff" }}>
              <Icon name="moon" size={20} />
            </span>
            <div>
              <p className="heading text-lg font-semibold">Cartomante Pro</p>
              <p className="muted text-xs">Gestão completa do seu ateliê</p>
            </div>
          </div>

          <section className="card p-5">
            <div className="mb-3 flex rounded-xl border p-1" style={{ borderColor: "var(--border)" }}>
              {([
                ["tenant", "Profissional"],
                ["developer", "Desenvolvedor"],
              ] as [Role, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setRole(value); setError(null); setPaymentInfo(null); }}
                  className={cx("flex-1 rounded-lg px-3 py-2 text-sm font-semibold", role === value && "nav-link-active")}
                  style={{ color: role === value ? "var(--text)" : "var(--muted)" }}
                >
                  {label}
                </button>
              ))}
            </div>

            <h2 className="heading text-xl font-semibold">{role === "tenant" ? "Acessar meu painel" : "Painel do desenvolvedor"}</h2>
            <p className="muted mt-0.5 text-xs">
              {role === "tenant"
                ? "Entre com o e-mail e a senha cadastrados pelo responsável pela sua licença."
                : "Área restrita para gerenciar contas, licenças e faturamento do aplicativo."}
            </p>

            <form onSubmit={submit} className="mt-3 space-y-2.5">
              <Field label="E-mail" required>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={role === "tenant" ? "seu@email.com" : "dev@cartomantepro.app"}
                  autoComplete="username"
                />
              </Field>
              <Field label="Senha" required>
                <div className="relative">
                  <input
                    className="input pr-9"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button type="button" className="absolute right-2 top-2 muted" onClick={() => setShowPassword((v) => !v)} aria-label="Mostrar senha">
                    <Icon name="eye" size={16} />
                  </button>
                </div>
              </Field>
              {error ? <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</p> : null}
              {paymentInfo ? (
                <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-2 text-xs">
                  <p className="font-semibold">Regularize seu acesso</p>
                  <p className="muted mt-0.5">{paymentInfo.instructions}</p>
                  {paymentInfo.support ? <p className="muted">Suporte: {paymentInfo.support}</p> : null}
                </div>
              ) : null}
              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                <Icon name="arrow" size={15} /> {loading ? "Entrando..." : role === "tenant" ? "Entrar no painel" : "Entrar como desenvolvedor"}
              </button>
            </form>

            {sessionRole ? (
              <button
                type="button"
                className="btn btn-outline btn-sm mt-2 w-full"
                onClick={() => router.push(sessionRole === "developer" ? "/dev" : "/app")}
              >
                <Icon name="right" size={14} /> Continuar na sessão atual ({sessionRole === "developer" ? "desenvolvedor" : "profissional"})
              </button>
            ) : null}

            <p className="muted mt-3 text-[0.66rem] leading-snug">
              Ao entrar você concorda com o uso privado dos seus dados. Não há anúncios, rastreadores ou envio de informações financeiras para
              terceiros. Cada conta acessa somente os próprios registros. Esqueceu a senha? Fale com o suporte do aplicativo.
            </p>
          </section>

          <div className="muted mt-3 grid grid-cols-2 gap-2 text-[0.66rem]">
            <div className="card-muted flex items-center gap-1.5 p-2">
              <Icon name="devices" size={14} /> Telefone, tablet e web
            </div>
            <div className="card-muted flex items-center gap-1.5 p-2">
              <Icon name="table" size={14} /> Planilha padrão (.xlsx/.csv)
            </div>
            <div className="card-muted flex items-center gap-1.5 p-2">
              <Icon name="flame" size={14} /> Trabalhos, magias e terapias
            </div>
            <div className="card-muted flex items-center gap-1.5 p-2">
              <Icon name="camera" size={14} /> Imagens e 60 paletas editáveis
            </div>
          </div>
          <p className="muted mt-3 text-center text-[0.66rem]">
            Cartomante Pro 1.0 · moedas BRL, EUR e USD · datas DD/MM/AAAA · horários 24h
          </p>
        </div>
      </main>
    </div>
  );
}
