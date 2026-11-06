"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, Field, Icon, Modal, SectionTitle, StatCard, cx } from "@/components/ui";
import { AccountAccessModal, ProfessionalAccessLink, VerifyAccountAccessModal, type CreatedAccountAccess } from "@/components/dev/AccessTools";
import { PLAN_LABEL, centsToInput, formatDateBR, formatDateTimeBR, formatMoney, parseMoneyToCents, todayISO } from "@/lib/format";
import type { DevData, DevTenant, Plan } from "@/lib/types";

type Phase = "loading" | "guest" | "ready";

const STATUS_LABEL: Record<string, string> = { active: "Ativo", blocked: "Bloqueado", expired: "Vencido" };
const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  blocked: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  expired: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};
const PLAN_TONE: Record<Plan, string> = {
  monthly: "chip",
  annual: "chip",
  lifetime: "chip-active",
};

export function DevPanel() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<DevData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [tab, setTab] = useState<"visao" | "contas" | "financeiro" | "config">("visao");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [accountModal, setAccountModal] = useState<{ open: boolean; tenant: DevTenant | null }>({ open: false, tenant: null });
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; tenantId: number | null }>({ open: false, tenantId: null });
  const [deleteTarget, setDeleteTarget] = useState<DevTenant | null>(null);
  const [blockTarget, setBlockTarget] = useState<DevTenant | null>(null);
  const [wipePayment, setWipePayment] = useState<number | null>(null);
  const [createdAccess, setCreatedAccess] = useState<CreatedAccountAccess | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<DevTenant | null>(null);
  // login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [logging, setLogging] = useState(false);

  const notify = (message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 4500);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dev/data", { cache: "no-store" });
      if (res.status === 401) {
        setPhase("guest");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as DevData & { error?: string };
      if (!res.ok && !body.tenants) throw new Error(body.error ?? "Falha ao carregar painel.");
      setData(body);
      setPhase("ready");
    } catch (err) {
      setError((err as Error).message);
      setPhase("guest");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const session = await fetch("/api/auth/session", { cache: "no-store" })
        .then((res) => res.json())
        .catch(() => ({ role: null }));
      if (session.role === "developer") await load();
      else setPhase("guest");
    })();
  }, [load]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLogging(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role: "developer" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Credenciais inválidas.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLogging(false);
    }
  };

  const api = async (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(json.error ?? "Não foi possível concluir."));
    await load();
    return json;
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setPhase("guest");
    setData(null);
    router.refresh();
  };

  const kpis = useMemo(() => {
    if (!data) {
      return { active: 0, blocked: 0, expired: 0, lifetime: 0, monthlyRevenue: 0, totalRevenue: 0, mrr: 0, total: 0, revenueByMonth: [] as { month: string; cents: number }[] };
    }
    const active = data.tenants.filter((t) => t.status === "active").length;
    const blocked = data.tenants.filter((t) => t.status === "blocked").length;
    const expired = data.tenants.filter((t) => t.status === "expired").length;
    const lifetime = data.tenants.filter((t) => t.plan === "lifetime").length;
    const currentMonth = todayISO().slice(0, 7);
    const monthlyRevenue = data.licensePayments.filter((p) => p.paidAt.startsWith(currentMonth)).reduce((a, p) => a + p.amountCents, 0);
    const totalRevenue = data.licensePayments.reduce((a, p) => a + p.amountCents, 0);
    const mrr = data.tenants
      .filter((t) => t.status === "active")
      .reduce((acc, t) => acc + (t.plan === "monthly" ? t.priceCents : t.plan === "annual" ? Math.round(t.priceCents / 12) : 0), 0);
    const map = new Map<string, number>();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      map.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    for (const payment of data.licensePayments) {
      const key = payment.paidAt.slice(0, 7);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + payment.amountCents);
    }
    return {
      active,
      blocked,
      expired,
      lifetime,
      monthlyRevenue,
      totalRevenue,
      mrr,
      total: data.tenants.length,
      revenueByMonth: [...map.entries()].map(([month, cents]) => ({ month, cents })),
    };
  }, [data]);

  const filteredTenants = useMemo(() => {
    if (!data) return [];
    return data.tenants.filter((tenant) => {
      if (statusFilter && tenant.status !== statusFilter) return false;
      if (planFilter && tenant.plan !== planFilter) return false;
      if (!search) return true;
      const term = search.toLowerCase();
      return tenant.name.toLowerCase().includes(term) || tenant.email.toLowerCase().includes(term) || tenant.ownerName.toLowerCase().includes(term);
    });
  }, [data, statusFilter, planFilter, search]);

  const toggleBlock = async (tenant: DevTenant) => {
    try {
      await api(`/api/dev/tenants/${tenant.id}`, "PATCH", { status: tenant.status === "active" ? "blocked" : "active" });
      notify(tenant.status === "active" ? "Acesso bloqueado imediatamente." : "Acesso reativado.");
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setBlockTarget(null);
    }
  };

  const renew = async (tenant: DevTenant, days = 30) => {
    try {
      await api(`/api/dev/tenants/${tenant.id}`, "PATCH", { renewDays: days });
      notify(`Licença renovada por ${days} dias.`);
    } catch (err) {
      notify((err as Error).message, "error");
    }
  };

  const removeTenant = async () => {
    if (!deleteTarget) return;
    try {
      const result = await api(`/api/dev/tenants/${deleteTarget.id}`, "DELETE");
      notify(String(result.message ?? "Conta removida."));
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const removePayment = async () => {
    if (!wipePayment) return;
    try {
      await api("/api/dev/payments", "DELETE", { id: wipePayment });
      notify("Registro de pagamento removido.");
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setWipePayment(null);
    }
  };

  if (phase === "loading") {
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-md items-center justify-center px-4">
        <div className="card w-full p-5 text-center">
          <div className="skeleton mx-auto h-10 w-10 rounded-xl" />
          <p className="muted mt-2 text-sm">Carregando painel do desenvolvedor...</p>
        </div>
      </div>
    );
  }

  if (phase === "guest" || !data) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8">
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(140deg, var(--primary), var(--accent))", color: "#fff" }}>
              <Icon name="code" size={20} />
            </span>
            <div>
              <p className="heading text-lg font-semibold">Painel do desenvolvedor</p>
              <p className="muted text-xs">Gestão de contas, licenças e faturamento</p>
            </div>
          </div>
          <form onSubmit={login} className="mt-4 space-y-2.5">
            <Field label="E-mail do desenvolvedor" required>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dev@cartomantepro.app" autoComplete="username" />
            </Field>
            <Field label="Senha" required>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            {error ? <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</p> : null}
            <button type="submit" className="btn btn-primary w-full" disabled={logging}>
              <Icon name="lock" size={15} /> {logging ? "Entrando..." : "Entrar no painel"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => router.push("/")}>
              Voltar para o acesso das profissionais
            </button>
          </form>
          <p className="muted mt-3 text-[0.66rem] leading-snug">
            Use o e-mail e a senha atualmente salvos em <strong>Configurações do desenvolvedor</strong>. Se você alterou somente a senha, o
            e-mail anterior continua sendo o login. Se alterou somente o e-mail, a senha anterior continua válida. Em uma nova instalação,
            utilize as credenciais entregues pelo administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-24">
      <header className="border-b" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 88%, transparent)" }}>
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(140deg, var(--primary), var(--accent))", color: "#fff" }}>
              <Icon name="code" size={20} />
            </span>
            <div>
              <p className="heading text-base font-semibold">Cartomante Pro · Desenvolvedor</p>
              <p className="muted text-[0.7rem]">{data.developer.name} · {data.developer.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => router.push("/")}>
              <Icon name="eye" size={14} /> Ver app
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()}>
              <Icon name="logout" size={15} /> Sair
            </button>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-3 pb-2 sm:px-5">
          {([
            ["visao", "Visão geral", "chart"],
            ["contas", "Contas e acessos", "users"],
            ["financeiro", "Financeiro", "wallet"],
            ["config", "Configurações", "settings"],
          ] as [typeof tab, string, string][]).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              className={cx("chip", tab === key && "chip-active")}
              onClick={() => setTab(key)}
            >
              <Icon name={icon} size={13} /> {label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-5">
        {toast ? (
          <div
            className="rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: toast.tone === "error" ? "#b4231b" : "var(--primary)", background: "var(--surface)" }}
          >
            {toast.message}
          </div>
        ) : null}

        {tab === "visao" ? (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Contas ativas" value={kpis.active} hint={`${kpis.total} contas no total`} icon="check" tone="success" />
              <StatCard label="Bloqueadas" value={kpis.blocked} hint="Acesso impedido" icon="ban" tone="danger" />
              <StatCard label="Vencidas" value={kpis.expired} hint="Bloqueio automático" icon="clock" tone="warning" />
              <StatCard label="Vitalícias" value={kpis.lifetime} hint="Sem expiração" icon="star" tone="accent" />
              <StatCard label="Receita do mês" value={formatMoney(kpis.monthlyRevenue)} hint="Licenças recebidas" icon="coins" tone="success" />
              <StatCard label="Faturamento total" value={formatMoney(kpis.totalRevenue)} hint="Histórico de vendas" icon="wallet" tone="accent" />
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
              <section className="card p-4">
                <SectionTitle title="Faturamento por mês" subtitle="Últimos 6 meses de licenças recebidas" icon="chart" />
                <div className="flex h-40 items-end gap-2">
                  {kpis.revenueByMonth.map((item) => {
                    const max = Math.max(...kpis.revenueByMonth.map((m) => m.cents), 1);
                    return (
                      <div key={item.month} className="flex flex-1 flex-col items-center justify-end gap-1">
                        <span className="text-[0.6rem] font-semibold">{item.cents ? formatMoney(item.cents) : ""}</span>
                        <div
                          className="w-full rounded-t-lg"
                          style={{
                            height: `${Math.max(4, (item.cents / max) * 100)}%`,
                            background: "linear-gradient(180deg, var(--primary), var(--accent))",
                          }}
                        />
                        <span className="muted text-[0.6rem]">{item.month.slice(5)}/{item.month.slice(2, 4)}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="muted mt-2 text-[0.7rem]">Receita recorrente mensal estimada (MRR): <strong>{formatMoney(kpis.mrr)}</strong></p>
              </section>

              <section className="card p-4">
                <SectionTitle title="Planos vendidos" subtitle="Distribuição da carteira" icon="star" />
                <div className="space-y-2">
                  {(["monthly", "annual", "lifetime"] as Plan[]).map((plan) => {
                    const list = data.tenants.filter((t) => t.plan === plan);
                    const active = list.filter((t) => t.status === "active").length;
                    return (
                      <div key={plan} className="card-muted p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{PLAN_LABEL[plan]}</span>
                          <span className="chip">{formatMoney(data.developer.settings.planPrices[plan])}</span>
                        </div>
                        <p className="muted mt-1">{list.length} conta(s) · {active} ativa(s) · {list.reduce((a, t) => a + t.revenueCents, 0) ? formatMoney(list.reduce((a, t) => a + t.revenueCents, 0)) : formatMoney(0)} faturado</p>
                      </div>
                    );
                  })}
                </div>
                {data.demoCredentials ? (
                  <div className="mt-3 rounded-lg p-2 text-xs" style={{ background: "var(--primary-soft)" }}>
                    <p className="font-bold uppercase tracking-wide">Conta demo (3 meses)</p>
                    <p className="mt-0.5">{data.demoCredentials.email}</p>
                    <p>Senha: {data.demoCredentials.password}</p>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm mt-1"
                      onClick={() => {
                        void navigator.clipboard?.writeText(`${data.demoCredentials?.email} / ${data.demoCredentials?.password}`);
                        notify("Credenciais copiadas.");
                      }}
                    >
                      <Icon name="copy" size={13} /> Copiar
                    </button>
                  </div>
                ) : null}
              </section>
            </div>

            <section className="card p-4">
              <SectionTitle title="Próximos vencimentos" subtitle="Mensais e anuais que vão expirar" icon="clock" />
              {data.tenants.filter((t) => t.status === "active" && t.plan !== "lifetime").length ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Conta</th>
                        <th>Plano</th>
                        <th>Vencimento</th>
                        <th>Dias restantes</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.tenants
                        .filter((t) => t.status === "active" && t.plan !== "lifetime")
                        .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""))
                        .slice(0, 8)
                        .map((tenant) => (
                          <tr key={tenant.id}>
                            <td>{tenant.name}</td>
                            <td>{PLAN_LABEL[tenant.plan]}</td>
                            <td>{formatDateBR(tenant.expiresAt)}</td>
                            <td>
                              <span className={cx("chip", (tenant.daysLeft ?? 0) <= 5 ? "bg-rose-500/15 text-rose-500" : "")}>{tenant.daysLeft ?? "—"} dia(s)</span>
                            </td>
                            <td>
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => void renew(tenant)}>
                                Renovar 30 dias
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted text-sm">Nenhuma licença mensal/anual ativa no momento.</p>
              )}
            </section>
          </>
        ) : null}

        {tab === "contas" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="heading text-lg font-semibold">Contas e acessos</h2>
                <p className="muted text-xs">Crie, ative, bloqueie, renove ou exclua o acesso de cada profissional.</p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAccountModal({ open: true, tenant: null })}>
                <Icon name="plus" size={14} /> Nova conta
              </button>
            </div>
            <ProfessionalAccessLink />
            <div className="card flex flex-wrap items-end gap-2 p-3">
              <div className="min-w-[12rem] flex-1">
                <Field label="Buscar conta">
                  <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, responsável ou e-mail" />
                </Field>
              </div>
              <Field label="Status" className="w-36">
                <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="active">Ativas</option>
                  <option value="blocked">Bloqueadas</option>
                  <option value="expired">Vencidas</option>
                </select>
              </Field>
              <Field label="Plano" className="w-36">
                <select className="select" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="monthly">Mensal</option>
                  <option value="annual">Anual</option>
                  <option value="lifetime">Vitalício</option>
                </select>
              </Field>
              <span className="chip">{filteredTenants.length} conta(s)</span>
            </div>

            <section className="card overflow-hidden">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Conta / profissional</th>
                      <th>Plano</th>
                      <th>Status</th>
                      <th>Validade</th>
                      <th>Consultas</th>
                      <th>Receita</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map((tenant) => (
                      <tr key={tenant.id}>
                        <td>
                          <p className="font-semibold">{tenant.name}</p>
                          <p className="muted text-[0.7rem]">{tenant.ownerName}</p>
                          <p className="muted text-[0.68rem]">{tenant.email}</p>
                          {tenant.isDemo ? <span className="chip mt-1">Demo</span> : null}
                        </td>
                        <td>
                          <span className={PLAN_TONE[tenant.plan]}>{PLAN_LABEL[tenant.plan]}</span>
                          <p className="muted mt-1 text-[0.68rem]">{formatMoney(tenant.priceCents)}</p>
                        </td>
                        <td>
                          <span className={cx("chip border", STATUS_TONE[tenant.status])}>{STATUS_LABEL[tenant.status]}</span>
                          <p className="muted mt-1 text-[0.66rem]">
                            {tenant.lastLoginAt ? `Último acesso ${formatDateTimeBR(tenant.lastLoginAt)}` : "Nunca acessou"}
                          </p>
                        </td>
                        <td>
                          {tenant.plan === "lifetime" ? "Vitalício" : formatDateBR(tenant.expiresAt)}
                          {tenant.plan !== "lifetime" ? <p className="muted text-[0.66rem]">{tenant.daysLeft ?? "—"} dia(s)</p> : null}
                        </td>
                        <td>{tenant.consultationsCount}</td>
                        <td>{formatMoney(tenant.revenueCents)}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setVerifyTarget(tenant)}>
                              <Icon name="check" size={13} /> Verificar acesso
                            </button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAccountModal({ open: true, tenant })}>
                              <Icon name="edit" size={13} /> Editar
                            </button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setPaymentModal({ open: true, tenantId: tenant.id })}>
                              <Icon name="coins" size={13} /> Pagamento
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBlockTarget(tenant)}>
                              <Icon name={tenant.status === "active" ? "ban" : "check"} size={13} /> {tenant.status === "active" ? "Bloquear" : "Ativar"}
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm text-rose-500" onClick={() => setDeleteTarget(tenant)}>
                              <Icon name="trash" size={13} /> Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredTenants.length ? (
                      <tr>
                        <td colSpan={7} className="muted py-6 text-center">Nenhuma conta encontrada com estes filtros.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
            <p className="muted text-[0.7rem]">
              O plano mensal bloqueia automaticamente no 30º dia: ao expirar, o login retorna a mensagem para realizar o pagamento e o painel não abre.
            </p>
          </>
        ) : null}

        {tab === "financeiro" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="heading text-lg font-semibold">Financeiro das licenças</h2>
                <p className="muted text-xs">Contas ativas, planos e valores faturados.</p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setPaymentModal({ open: true, tenantId: data.tenants[0]?.id ?? null })}>
                <Icon name="plus" size={14} /> Registrar pagamento
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatCard label="Faturamento total" value={formatMoney(kpis.totalRevenue)} icon="wallet" tone="accent" />
              <StatCard label="Receita no mês" value={formatMoney(kpis.monthlyRevenue)} icon="coins" tone="success" />
              <StatCard label="MRR estimado" value={formatMoney(kpis.mrr)} icon="chart" />
              <StatCard label="Contas pagantes ativas" value={kpis.active} icon="check" tone="success" />
            </div>
            <section className="card overflow-hidden">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Conta</th>
                      <th>Plano</th>
                      <th>Referência</th>
                      <th className="text-right">Valor</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.licensePayments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDateBR(payment.paidAt)}</td>
                        <td>{payment.tenantName}</td>
                        <td>{PLAN_LABEL[payment.plan]}</td>
                        <td className="muted text-[0.72rem]">{payment.reference ?? "—"}</td>
                        <td className="text-right font-semibold text-emerald-600">{formatMoney(payment.amountCents)}</td>
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWipePayment(payment.id)}>
                            <Icon name="trash" size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!data.licensePayments.length ? (
                      <tr>
                        <td colSpan={6} className="muted py-6 text-center">Nenhum pagamento de licença registrado.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {tab === "config" ? <DevSettings data={data} api={api} notify={notify} /> : null}
      </main>

      <AccountModal
        state={accountModal}
        onClose={() => setAccountModal({ open: false, tenant: null })}
        onCreated={setCreatedAccess}
        api={api}
        notify={notify}
        prices={data.developer.settings.planPrices}
      />
      <AccountAccessModal access={createdAccess} onClose={() => setCreatedAccess(null)} />
      <VerifyAccountAccessModal tenant={verifyTarget} onClose={() => setVerifyTarget(null)} />
      <LicensePaymentModal
        state={paymentModal}
        onClose={() => setPaymentModal({ open: false, tenantId: null })}
        api={api}
        notify={notify}
        tenants={data.tenants}
        prices={data.developer.settings.planPrices}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Excluir conta de ${deleteTarget?.name ?? ""}`}
        message="Todos os dados da profissional (consulentes, consultas, pagamentos e lançamentos) serão removidos e o acesso será encerrado imediatamente. O histórico de pagamentos de licença é mantido no faturamento."
        confirmLabel="Excluir conta definitivamente"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void removeTenant()}
      />
      <ConfirmDialog
        open={Boolean(blockTarget)}
        title={blockTarget?.status === "active" ? "Bloquear acesso" : "Ativar acesso"}
        message={
          blockTarget?.status === "active"
            ? "A profissional será desconectada e não conseguirá entrar no painel até você reativar. Esta ação não exclui dados."
            : "A conta voltará a ter acesso ao painel. Se o plano estiver vencido, uma nova validade será gerada conforme o plano."
        }
        confirmLabel={blockTarget?.status === "active" ? "Bloquear agora" : "Ativar acesso"}
        danger={blockTarget?.status === "active"}
        onClose={() => setBlockTarget(null)}
        onConfirm={() => { if (blockTarget) void toggleBlock(blockTarget); }}
      />
      <ConfirmDialog
        open={Boolean(wipePayment)}
        title="Excluir registro de pagamento"
        message="Este registro de licença será removido do faturamento histórico do painel. A licença da conta não é alterada."
        confirmLabel="Excluir pagamento"
        onClose={() => setWipePayment(null)}
        onConfirm={() => void removePayment()}
      />
    </div>
  );
}

function AccountModal({
  state,
  onClose,
  onCreated,
  api,
  notify,
  prices,
}: {
  state: { open: boolean; tenant: DevTenant | null };
  onClose: () => void;
  onCreated: (access: CreatedAccountAccess) => void;
  api: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<Record<string, unknown>>;
  notify: (message: string, tone?: "success" | "error") => void;
  prices: Record<Plan, number>;
}) {
  const editing = state.tenant;
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<Plan>("monthly");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("active");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    setName(editing?.name ?? "");
    setOwnerName(editing?.ownerName ?? "");
    setEmail(editing?.email ?? "");
    setPhone(editing?.phone ?? "");
    setPlan(editing?.plan ?? "monthly");
    setPrice(centsToInput(editing?.priceCents ?? prices.monthly));
    setStatus(editing?.status ?? "active");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setNotes(editing?.notes ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, editing?.id]);

  const changePlan = (next: Plan) => {
    setPlan(next);
    if (next !== editing?.plan) setPrice(centsToInput(prices[next]));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!editing || password || confirmPassword) {
      if (password.length < 6 || password.length > 120) {
        setError("A senha deve ter entre 6 e 120 caracteres.");
        return;
      }
      if (password !== password.trim()) {
        setError("A senha não pode começar ou terminar com espaços.");
        return;
      }
      if (password !== confirmPassword) {
        setError("A confirmação da senha não confere.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        name,
        ownerName,
        email,
        phone,
        plan,
        priceCents: parseMoneyToCents(price),
        status,
        notes,
        ...(!editing || password ? { password } : {}),
      };
      const result = editing
        ? await api(`/api/dev/tenants/${editing.id}`, "PATCH", payload)
        : await api("/api/dev/tenants", "POST", payload);
      const saved = result.tenant as {
        name: string;
        email: string;
        plan: Plan;
        status: CreatedAccountAccess["status"];
        expiresAt: string | null;
      };
      if (password) {
        onCreated({
          name: saved.name,
          email: saved.email,
          password,
          plan: saved.plan,
          status: saved.status,
          expiresAt: saved.expiresAt,
          isNew: !editing,
        });
      }
      notify(
        saved.status === "active"
          ? editing ? "Conta atualizada e acesso ativo." : "Conta criada com acesso ativo."
          : saved.status === "blocked"
            ? "Conta salva com acesso bloqueado."
            : "Conta salva com licença vencida.",
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={editing ? `Editar conta — ${editing.name}` : "Nova conta de profissional"}
      subtitle="O acesso é criado por você. Mensal bloqueia após 30 dias; anual após 365; vitalício não expira."
      wide
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" form="dev-account-form" className="btn btn-primary" disabled={saving}>
            <Icon name="save" size={14} /> {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar conta"}
          </button>
        </>
      }
    >
      <form id="dev-account-form" className="space-y-3" onSubmit={submit}>
        {error ? <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</div> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome da conta / ateliê" required>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ateliê Lua de Prata" />
          </Field>
          <Field label="Nome da profissional">
            <input className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Ex.: Maria Aparecida" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="E-mail de acesso" required>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="profissional@email.com" />
          </Field>
          <Field label="Telefone (opcional)">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Plano" required>
            <select className="select" value={plan} onChange={(e) => changePlan(e.target.value as Plan)}>
              <option value="monthly">Mensal (30 dias)</option>
              <option value="annual">Anual (365 dias)</option>
              <option value="lifetime">Vitalício</option>
            </select>
          </Field>
          <Field label="Valor da licença">
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <Field
            label="Status"
            hint={status === "active" ? "A profissional poderá entrar." : "A profissional não poderá entrar até o acesso ser liberado."}
          >
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Ativo</option>
              <option value="blocked">Bloqueado</option>
              <option value="expired">Vencido</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={editing ? "Redefinir senha (opcional)" : "Senha de acesso"}
            required={!editing}
            hint="De 6 a 120 caracteres, sem espaços no início ou no final."
          >
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? "Deixe em branco para manter" : "Senha inicial"}
                maxLength={120}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="muted absolute right-2.5 top-2.5"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                <Icon name="eye" size={16} />
              </button>
            </div>
          </Field>
          <Field label="Confirmar senha" required={!editing || Boolean(password)} hint="Digite a mesma senha para evitar erros de cadastro.">
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
              maxLength={120}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <p className="muted text-[0.7rem]">A senha é armazenada com proteção por hash e não pode ser recuperada em texto puro.</p>
        <Field label="Observações internas">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {editing ? (
          <p className="muted text-[0.7rem]">
            Alterar o plano reinicia a contagem a partir de hoje. Para apenas adicionar dias, use “Renovar 30 dias” na lista de contas.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

function LicensePaymentModal({
  state,
  onClose,
  api,
  notify,
  tenants,
  prices,
}: {
  state: { open: boolean; tenantId: number | null };
  onClose: () => void;
  api: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<Record<string, unknown>>;
  notify: (message: string, tone?: "success" | "error") => void;
  tenants: DevTenant[];
  prices: Record<Plan, number>;
}) {
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [plan, setPlan] = useState<Plan>("monthly");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [renew, setRenew] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const tenant = tenants.find((t) => t.id === state.tenantId);
    setTenantId(state.tenantId ?? tenants[0]?.id ?? null);
    setPlan(tenant?.plan ?? "monthly");
    setAmount(centsToInput(tenant?.priceCents ?? prices[tenant?.plan ?? "monthly"]));
    setPaidAt(todayISO());
    setReference("");
    setNotes("");
    setRenew(true);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.tenantId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId) {
      setError("Selecione uma conta.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/api/dev/payments", "POST", {
        tenantId,
        plan,
        amountCents: parseMoneyToCents(amount),
        paidAt,
        reference,
        notes,
        renew,
      });
      notify(renew ? "Pagamento registrado e licença renovada." : "Pagamento registrado no faturamento.");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title="Registrar pagamento de licença"
      subtitle="Este valor entra no faturamento do painel do desenvolvedor."
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" form="license-form" className="btn btn-primary" disabled={saving}>
            <Icon name="coins" size={14} /> {saving ? "Salvando..." : "Registrar pagamento"}
          </button>
        </>
      }
    >
      <form id="license-form" className="space-y-3" onSubmit={submit}>
        {error ? <div className="rounded-lg border border-rose-400/50 bg-rose-500/10 p-2 text-xs text-rose-600">{error}</div> : null}
        <Field label="Conta" required>
          <select
            className="select"
            value={tenantId ?? ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              setTenantId(id);
              const tenant = tenants.find((t) => t.id === id);
              if (tenant) {
                setPlan(tenant.plan);
                setAmount(centsToInput(tenant.priceCents || prices[tenant.plan]));
              }
            }}
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} · {PLAN_LABEL[tenant.plan]} · {tenant.status}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Plano">
            <select
              className="select"
              value={plan}
              onChange={(e) => {
                const next = e.target.value as Plan;
                setPlan(next);
                setAmount(centsToInput(prices[next]));
              }}
            >
              <option value="monthly">Mensal</option>
              <option value="annual">Anual</option>
              <option value="lifetime">Vitalício</option>
            </select>
          </Field>
          <Field label="Valor recebido" required>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Data" required>
            <input type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Referência / comprovante">
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex.: Pix 12345" />
        </Field>
        <Field label="Observações">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} />
          Renovar a licença e liberar o acesso automaticamente
        </label>
      </form>
    </Modal>
  );
}

function DevSettings({
  data,
  api,
  notify,
}: {
  data: DevData;
  api: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<Record<string, unknown>>;
  notify: (message: string, tone?: "success" | "error") => void;
}) {
  const [name, setName] = useState(data.developer.name);
  const [email, setEmail] = useState(data.developer.email);
  const [monthly, setMonthly] = useState(centsToInput(data.developer.settings.planPrices.monthly));
  const [annual, setAnnual] = useState(centsToInput(data.developer.settings.planPrices.annual));
  const [lifetime, setLifetime] = useState(centsToInput(data.developer.settings.planPrices.lifetime));
  const [instructions, setInstructions] = useState(data.developer.settings.paymentInstructions);
  const [support, setSupport] = useState(data.developer.settings.supportContact);
  const [blockNotice, setBlockNotice] = useState(data.developer.settings.autoBlockNotice);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const changingPassword = Boolean(currentPassword || newPassword || confirmPassword);
    if (changingPassword) {
      if (!currentPassword) {
        notify("Informe a senha atual para confirmar a troca de senha.", "error");
        return;
      }
      if (newPassword.length < 8) {
        notify("A nova senha deve ter ao menos 8 caracteres.", "error");
        return;
      }
      if (newPassword !== confirmPassword) {
        notify("A confirmação da nova senha não confere.", "error");
        return;
      }
    }

    setSaving(true);
    try {
      const result = await api("/api/dev/settings", "PATCH", {
        name,
        email,
        planPrices: {
          monthly: parseMoneyToCents(monthly),
          annual: parseMoneyToCents(annual),
          lifetime: parseMoneyToCents(lifetime),
        },
        paymentInstructions: instructions,
        supportContact: support,
        autoBlockNotice: blockNotice,
        ...(changingPassword ? { currentPassword, newPassword } : {}),
      });
      const savedEmail = String((result.account as { email?: string } | undefined)?.email ?? email);
      setEmail(savedEmail);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify(
        changingPassword
          ? `E-mail e senha salvos juntos. Próximo acesso: ${savedEmail} com a nova senha.`
          : "Configurações do aplicativo salvas.",
      );
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <section className="card p-4">
        <SectionTitle
          title="Dados do desenvolvedor"
          subtitle="E-mail e nova senha são salvos na mesma operação, evitando divergência no login"
          icon="code"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="E-mail de acesso" hint="Este é o e-mail que deve ser digitado na tela de login.">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Senha atual" hint="Obrigatória somente para trocar a senha.">
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="Nova senha (mín. 8 caracteres)">
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirmar nova senha">
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
            <Icon name="lock" size={14} /> {saving ? "Salvando..." : "Salvar e-mail e senha"}
          </button>
          <span className="muted text-[0.7rem]">
            Ao trocar os dois, o próximo login usará o novo e-mail e a nova senha.
          </span>
        </div>
      </section>

      <section className="card p-4">
        <SectionTitle title="Planos e cobrança" subtitle="Valores padrão usados ao criar contas e registrar pagamentos" icon="wallet" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Mensal (30 dias)">
            <input className="input" value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Anual (365 dias)">
            <input className="input" value={annual} onChange={(e) => setAnnual(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Vitalício">
            <input className="input" value={lifetime} onChange={(e) => setLifetime(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Instruções de pagamento (aparecem no bloqueio)">
            <textarea className="textarea" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </Field>
          <div className="space-y-3">
            <Field label="Contato de suporte">
              <input className="input" value={support} onChange={(e) => setSupport(e.target.value)} />
            </Field>
            <Field label="Mensagem de bloqueio automático">
              <textarea className="textarea" value={blockNotice} onChange={(e) => setBlockNotice(e.target.value)} />
            </Field>
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm mt-3" onClick={() => void save()} disabled={saving}>
          <Icon name="save" size={14} /> {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </section>

      <section className="card p-4">
        <SectionTitle title="Imagens do aplicativo" subtitle="Preferência visual usada nas telas de acesso e perfil" icon="image" />
        <div className="grid grid-cols-3 gap-2">
          {data.developer.settings.showcaseImages.map((src) => (
            <div key={src} className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="Prévia do aplicativo" className="h-24 w-full object-cover" />
              <p className="muted truncate px-1 py-1 text-[0.6rem]">{src.split("/").pop()}</p>
            </div>
          ))}
        </div>
        <p className="muted mt-2 text-[0.7rem]">
          A profissional pode escolher a imagem de perfil e a paleta no painel dela. Você define aqui as imagens de vitrine do aplicativo.
        </p>
        {data.demoCredentials ? (
          <div className="mt-3 rounded-lg p-2 text-xs" style={{ background: "var(--primary-soft)" }}>
            <p className="font-bold uppercase tracking-wide">Acesso de demonstração (3 meses de dados)</p>
            <p>E-mail: {data.demoCredentials.email}</p>
            <p>Senha: {data.demoCredentials.password}</p>
            <p className="muted mt-1 text-[0.68rem]">A conta demo é vitalícia e serve para apresentar o app a novas clientes.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
