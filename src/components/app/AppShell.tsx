"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app/AppProvider";
import { ReminderBell } from "@/components/app/reminders";
import { Icon, cx } from "@/components/ui";
import { PLAN_LABEL } from "@/lib/format";

export type TabKey =
  | "painel"
  | "consultas"
  | "trabalhos"
  | "agenda"
  | "consulentes"
  | "metodos"
  | "financeiro"
  | "relatorios"
  | "configuracoes";

export const NAV_ITEMS: { key: TabKey; label: string; short: string; icon: string; hint: string }[] = [
  { key: "painel", label: "Painel inicial", short: "Painel", icon: "home", hint: "Indicadores, meta e próximos atendimentos" },
  { key: "consultas", label: "Consultas", short: "Consultas", icon: "sparkles", hint: "Agendar, registrar e receber pagamentos" },
  {
    key: "trabalhos",
    label: "Trabalhos e magias",
    short: "Trabalhos",
    icon: "flame",
    hint: "Abertura de caminhos, adoçamento, reiki e terapias",
  },
  { key: "agenda", label: "Agenda", short: "Agenda", icon: "calendar", hint: "Visão diária, semanal e mensal" },
  { key: "consulentes", label: "Consulentes", short: "Consulentes", icon: "users", hint: "Cadastro, perfil e histórico" },
  { key: "metodos", label: "Métodos de tiragem", short: "Métodos", icon: "moon", hint: "Serviços, preços e duração" },
  { key: "financeiro", label: "Financeiro", short: "Financeiro", icon: "wallet", hint: "Entradas, despesas, saldo e metas" },
  { key: "relatorios", label: "Relatórios", short: "Relatórios", icon: "chart", hint: "Análises, CSV e impressão" },
  {
    key: "configuracoes",
    label: "Configurações e backup",
    short: "Ajustes",
    icon: "settings",
    hint: "Preferências, paletas, planilha padrão e segurança",
  },
];

const MOBILE_PRIMARY: TabKey[] = ["painel", "consultas", "trabalhos", "financeiro"];

export function AppShell({
  active,
  onNavigate,
  onOpenSpreadsheet,
  onOpenDevices,
  onOpenImageEditor,
  banner,
  children,
}: {
  active: TabKey;
  onNavigate: (tab: TabKey) => void;
  onOpenSpreadsheet: () => void;
  onOpenDevices: () => void;
  onOpenImageEditor: () => void;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const { data, offline } = useApp();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const settings = data.settings;
  const activeItem = NAV_ITEMS.find((item) => item.key === active);
  const professionalName = settings.professionalName || data.tenant.ownerName || "Cartomante";
  const planLabel = data.tenant.isDemo ? "Demonstração" : PLAN_LABEL[data.tenant.plan];
  const initials = professionalName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  const navigate = (tab: TabKey) => {
    onNavigate(tab);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-[100dvh] md:flex">
      {/* Barra lateral compacta para TABLET (768px – 1023px) */}
      <aside
        className="no-print hidden w-[5.5rem] shrink-0 flex-col items-center border-r md:sticky md:top-0 md:flex md:h-[100dvh] lg:hidden"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 86%, transparent)" }}
        aria-label="Menu do tablet"
      >
        <button
          type="button"
          onClick={onOpenImageEditor}
          className="group relative mt-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--border)", background: "var(--primary-soft)" }}
          title="Trocar foto / imagem do aplicativo"
        >
          {settings.profileImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.profileImage} alt={professionalName} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-bold">{initials || "CP"}</span>
          )}
        </button>

        <nav className="mt-3 flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto px-1.5 pb-2">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.key)}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[0.62rem] font-semibold transition",
                  isActive && "nav-link-active",
                )}
                style={{ color: isActive ? "var(--text)" : "var(--muted)" }}
                title={item.label}
              >
                <Icon name={item.icon} size={18} />
                <span className="max-w-full truncate">{item.short}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex w-full flex-col items-center gap-1 border-t p-2" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm w-full"
            onClick={onOpenDevices}
            title="Usar no telefone, tablet e web"
          >
            <Icon name="devices" size={16} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => void logout()} title="Sair da conta">
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>

      {/* Menu lateral completo para WEB / COMPUTADOR (>= 1024px) */}
      <aside
        className="no-print hidden w-[17.5rem] shrink-0 flex-col border-r lg:sticky lg:top-0 lg:flex lg:h-[100dvh]"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 82%, transparent)" }}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "linear-gradient(140deg, var(--primary), var(--accent))", color: "#fff" }}
          >
            <Icon name="moon" size={20} />
          </span>
          <div className="min-w-0">
            <p className="heading truncate text-base font-semibold">{settings.appName || "Cartomante Pro"}</p>
            <p className="muted truncate text-[0.7rem]">Telefone · Tablet · Web</p>
          </div>
        </div>

        <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl border p-2" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={onOpenImageEditor}
            className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-full border"
            style={{ borderColor: "var(--border)", background: "var(--primary-soft)" }}
            title="Editar foto e imagem de capa"
          >
            {settings.profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.profileImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-bold">{initials || "CP"}</span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
              <Icon name="camera" size={13} />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{professionalName}</p>
            <p className="muted truncate text-[0.65rem]">{data.tenant.name}</p>
          </div>
          <button
            type="button"
            onClick={onOpenImageEditor}
            className="btn btn-ghost btn-sm"
            title="Editar imagem do aplicativo"
            aria-label="Editar imagem do aplicativo"
          >
            <Icon name="camera" size={14} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cx("nav-link", active === item.key && "nav-link-active")}
              onClick={() => navigate(item.key)}
              aria-current={active === item.key ? "page" : undefined}
            >
              <Icon name={item.icon} size={17} />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="space-y-1.5 border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className="btn btn-outline btn-sm" onClick={onOpenSpreadsheet} title="Importar ou baixar planilha padrão">
              <Icon name="table" size={13} /> Planilha
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={onOpenDevices} title="Abrir no telefone, tablet ou web">
              <Icon name="devices" size={13} /> Aparelhos
            </button>
          </div>
          <span className="chip w-full justify-center">{planLabel}</span>
          <button type="button" className="nav-link" onClick={() => void logout()}>
            <Icon name="logout" size={16} /> Sair da conta
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Cabeçalho responsivo */}
        <header
          className="no-print sticky top-0 z-40 border-b backdrop-blur"
          style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 88%, transparent)" }}
        >
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:px-5">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(140deg, var(--primary), var(--accent))", color: "#fff" }}
              >
                <Icon name="moon" size={18} />
              </span>
              <div className="min-w-0">
                <p className="heading truncate text-sm font-semibold">{settings.appName || "Cartomante Pro"}</p>
                <p className="muted truncate text-[0.65rem]">{activeItem?.label}</p>
              </div>
            </div>
            <div className="hidden lg:block">
              <h1 className="heading text-lg font-semibold">{activeItem?.label}</h1>
              <p className="muted text-[0.72rem]">{activeItem?.hint}</p>
            </div>
            <div className="flex items-center">
              <ReminderBell />
            </div>
          </div>
          {offline ? (
            <div className="bg-amber-500/15 px-3 py-1.5 text-center text-[0.7rem] font-medium text-amber-700">
              Você está offline. Os dados exibidos são os últimos carregados neste dispositivo — novas alterações exigem conexão.
            </div>
          ) : null}
          {banner}
        </header>

        <main className="app-main mx-auto w-full max-w-6xl px-3 pt-4 sm:px-5">{children}</main>
      </div>

      {/* Navegação inferior para TELEFONE (< 768px) */}
      <nav
        className="mobile-nav no-print fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t md:hidden"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 96%, transparent)" }}
        aria-label="Navegação principal"
      >
        {MOBILE_PRIMARY.map((key) => {
          const item = NAV_ITEMS.find((nav) => nav.key === key)!;
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(key)}
              className="flex flex-col items-center gap-0.5 py-2 text-[0.62rem] font-semibold"
              style={{ color: active === key ? "var(--primary)" : "var(--muted)" }}
              aria-current={active === key ? "page" : undefined}
            >
              <Icon name={item.icon} size={19} />
              {item.short}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2 text-[0.62rem] font-semibold"
          style={{ color: menuOpen ? "var(--primary)" : "var(--muted)" }}
        >
          <Icon name="menu" size={19} />
          Mais
        </button>
      </nav>

      {/* Menu completo mobile — rolagem própria */}
      {menuOpen ? (
        <div className="fixed inset-0 z-[80] md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div
            className="absolute inset-x-0 bottom-0 flex max-h-[94dvh] flex-col rounded-t-2xl border-t"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenImageEditor();
                  }}
                  className="relative h-10 w-10 overflow-hidden rounded-full border"
                  style={{ borderColor: "var(--border)", background: "var(--primary-soft)" }}
                >
                  {settings.profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={settings.profileImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold">{initials || "CP"}</span>
                  )}
                </button>
                <div>
                  <p className="heading text-base font-semibold">{professionalName}</p>
                  <p className="muted text-[0.7rem]">{planLabel} · toque na foto para editar</p>
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-3">
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSpreadsheet();
                  }}
                >
                  <Icon name="table" size={13} /> Planilha
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenImageEditor();
                  }}
                >
                  <Icon name="camera" size={13} /> Imagem
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenDevices();
                  }}
                >
                  <Icon name="devices" size={13} /> Aparelhos
                </button>
              </div>
              <div className="space-y-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={cx("nav-link", active === item.key && "nav-link-active")}
                    onClick={() => navigate(item.key)}
                  >
                    <Icon name={item.icon} size={18} />
                    <span className="flex-1">
                      <span className="block text-sm">{item.label}</span>
                      <span className="muted block text-[0.68rem]">{item.hint}</span>
                    </span>
                    <Icon name="right" size={14} />
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-outline mt-3 w-full" onClick={() => void logout()}>
                <Icon name="logout" size={15} /> Sair da conta
              </button>
              <p className="muted mt-3 text-center text-[0.68rem]">
                Cartomante Pro · funciona em telefone, tablet e computador
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
