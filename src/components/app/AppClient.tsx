"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DataBundle, Consultation, WhatsAppTarget } from "@/lib/types";
import { AppProvider } from "@/components/app/AppProvider";
import { AppShell, type TabKey } from "@/components/app/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Dashboard } from "@/components/app/Dashboard";
import { Consultas } from "@/components/app/Consultas";
import { TrabalhosMagias } from "@/components/app/TrabalhosMagias";
import { Agenda } from "@/components/app/Agenda";
import { Consulentes } from "@/components/app/Consulentes";
import { Metodos } from "@/components/app/Metodos";
import { Financeiro } from "@/components/app/Financeiro";
import { Relatorios } from "@/components/app/Relatorios";
import { Configuracoes } from "@/components/app/Configuracoes";
import { ConsultationFormModal, PaymentModal } from "@/components/app/forms";
import { SpreadsheetModal } from "@/components/app/SpreadsheetModal";
import { DeviceAccessModal } from "@/components/app/DeviceAccessModal";
import { QuickAppImageModal } from "@/components/app/ImagePicker";
import { ActiveStopwatchBanner, FinishedConsultationModal, type FinishedSummary } from "@/components/app/StopwatchControls";
import { WhatsAppModal } from "@/components/app/WhatsAppModal";
import { Field, Icon } from "@/components/ui";

type Phase = "loading" | "locked" | "blocked" | "ready" | "error";

type BlockedInfo = { message: string; code?: string };

export function AppClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<DataBundle | null>(null);
  const [blocked, setBlocked] = useState<BlockedInfo>({ message: "" });
  const [publicInfo, setPublicInfo] = useState<{ paymentInstructions: string; supportContact: string } | null>(null);
  const [tab, setTab] = useState<TabKey>("painel");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [editTarget, setEditTarget] = useState<Consultation | null | undefined>(undefined);
  const [payTarget, setPayTarget] = useState<Consultation | null>(null);
  const [spreadsheetOpen, setSpreadsheetOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [whatsappTarget, setWhatsappTarget] = useState<WhatsAppTarget | null>(null);
  const [finishedSummary, setFinishedSummary] = useState<FinishedSummary | null>(null);

  const fetchPublicInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/public/info", { cache: "no-store" });
      if (res.ok) setPublicInfo(await res.json());
    } catch {
      /* opcional */
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/");
        return;
      }
      if (res.status === 402 || res.status === 403) {
        const body = (await res.json().catch(() => ({}))) as BlockedInfo & { error?: string };
        setBlocked({ message: body.error ?? body.message ?? "Acesso indisponível.", code: body.code });
        setPhase("blocked");
        void fetchPublicInfo();
        return;
      }
      if (!res.ok) throw new Error("Falha ao carregar");
      const bundle = (await res.json()) as DataBundle;
      setData(bundle);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [router, fetchPublicInfo]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
        const session = (await sessionRes.json()) as { role: string | null; locked?: boolean };
        if (!active) return;
        if (session.role !== "tenant") {
          router.replace("/");
          return;
        }
        if (session.locked && window.sessionStorage.getItem("cartomante:unlocked") !== "1") {
          setPhase("locked");
          return;
        }
        await loadData();
      } catch {
        if (active) setPhase("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [router, loadData]);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setVerifying(true);
    setPinError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify-pin", pin }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Senha incorreta.");
      window.sessionStorage.setItem("cartomante:unlocked", "1");
      setPin("");
      await loadData();
    } catch (error) {
      setPinError((error as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.sessionStorage.removeItem("cartomante:unlocked");
    router.replace("/");
  };

  if (phase === "loading") {
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-3 px-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(140deg, var(--primary), var(--accent))", color: "#fff" }}>
          <Icon name="moon" size={26} />
        </span>
        <p className="heading text-lg font-semibold">Abrindo seu ateliê...</p>
        <div className="skeleton h-2 w-40" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <Icon name="alert" size={30} />
        <h2 className="heading text-lg font-semibold">Não foi possível carregar seus dados</h2>
        <p className="muted text-sm">Verifique sua conexão e tente novamente. Seus registros continuam salvos na sua conta.</p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" onClick={() => { setPhase("loading"); void loadData(); }}>
            <Icon name="refresh" size={15} /> Tentar novamente
          </button>
          <button type="button" className="btn btn-outline" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (phase === "locked") {
    return (
      <div className="mx-auto flex min-h-[80dvh] max-w-sm flex-col items-center justify-center px-4">
        <div className="card w-full p-5 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--primary-soft)" }}>
            <Icon name="lock" size={22} />
          </span>
          <h2 className="heading mt-2 text-lg font-semibold">Painel bloqueado</h2>
          <p className="muted mt-1 text-xs">Digite sua senha numérica para acessar. O bloqueio é uma proteção de acesso e não criptografa os dados.</p>
          <form onSubmit={unlock} className="mt-3 space-y-2">
            <Field label="Senha de bloqueio">
              <input
                className="input text-center tracking-[0.4em]"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            {pinError ? <p className="text-xs text-rose-500">{pinError}</p> : null}
            <button type="submit" className="btn btn-primary w-full" disabled={verifying}>
              <Icon name="lock" size={15} /> {verifying ? "Verificando..." : "Desbloquear"}
            </button>
          </form>
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => void logout()}>
            Sair da conta
          </button>
        </div>
      </div>
    );
  }

  if (phase === "blocked" || !data) {
    return (
      <div className="mx-auto flex min-h-[80dvh] max-w-lg flex-col items-center justify-center px-4">
        <div className="card w-full p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-500">
            <Icon name="ban" size={22} />
          </span>
          <h2 className="heading mt-2 text-lg font-semibold">Acesso suspenso</h2>
          <p className="muted mt-1 text-sm">{blocked.message || "Sua licença precisa ser renovada para usar o painel."}</p>
          {publicInfo ? (
            <div className="card-muted mt-3 space-y-1 p-2 text-xs">
              <p className="font-semibold">Como regularizar</p>
              <p className="muted">{publicInfo.paymentInstructions}</p>
              <p className="muted">Suporte: {publicInfo.supportContact}</p>
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-outline" onClick={() => void loadData()}>
              <Icon name="refresh" size={15} /> Já paguei, verificar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void logout()}>
              Entrar com outra conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  const openNewConsultation = () => setEditTarget(null);
  const renderTab = () => {
    switch (tab) {
      case "painel":
        return (
          <Dashboard
            onNavigate={setTab}
            onEdit={(consultation) => setEditTarget(consultation)}
            onPay={(consultation) => setPayTarget(consultation)}
            onWhatsApp={setWhatsappTarget}
            onFinished={setFinishedSummary}
            onOpenImageEditor={() => setImageModalOpen(true)}
          />
        );
      case "consultas":
        return (
          <Consultas
            onNew={openNewConsultation}
            onEdit={(consultation) => setEditTarget(consultation)}
            onPay={(consultation) => setPayTarget(consultation)}
            onWhatsApp={setWhatsappTarget}
            onFinished={setFinishedSummary}
          />
        );
      case "trabalhos":
        return <TrabalhosMagias onOpenSpreadsheet={() => setSpreadsheetOpen(true)} onWhatsApp={setWhatsappTarget} />;
      case "agenda":
        return (
          <Agenda
            onNew={openNewConsultation}
            onEdit={(consultation) => setEditTarget(consultation)}
            onPay={(consultation) => setPayTarget(consultation)}
            onWhatsApp={setWhatsappTarget}
            onFinished={setFinishedSummary}
          />
        );
      case "consulentes":
        return <Consulentes onOpenSpreadsheet={() => setSpreadsheetOpen(true)} onWhatsApp={setWhatsappTarget} />;
      case "metodos":
        return <Metodos />;
      case "financeiro":
        return <Financeiro onPay={(consultation) => setPayTarget(consultation)} onOpenSpreadsheet={() => setSpreadsheetOpen(true)} />;
      case "relatorios":
        return <Relatorios onWhatsApp={setWhatsappTarget} />;
      case "configuracoes":
        return <Configuracoes />;
      default:
        return null;
    }
  };

  return (
    <ThemeProvider paletteId={data.settings.palette}>
      <AppProvider
        initialData={data}
        onBlocked={(info) => {
          setBlocked(info);
          setPhase("blocked");
          void fetchPublicInfo();
        }}
        onUnauthorized={() => router.replace("/")}
      >
        <AppShell
          active={tab}
          onNavigate={setTab}
          onOpenSpreadsheet={() => setSpreadsheetOpen(true)}
          onOpenDevices={() => setDevicesOpen(true)}
          onOpenImageEditor={() => setImageModalOpen(true)}
          banner={
            <ActiveStopwatchBanner
              onPay={(consultation) => setPayTarget(consultation)}
              onWhatsApp={setWhatsappTarget}
              onFinished={setFinishedSummary}
            />
          }
        >
          {renderTab()}
        </AppShell>
        <ConsultationFormModal
          open={editTarget !== undefined}
          onClose={() => setEditTarget(undefined)}
          consultation={editTarget ?? null}
        />
        <PaymentModal consultation={payTarget} onClose={() => setPayTarget(null)} />
        <SpreadsheetModal open={spreadsheetOpen} onClose={() => setSpreadsheetOpen(false)} />
        <DeviceAccessModal open={devicesOpen} onClose={() => setDevicesOpen(false)} />
        <QuickAppImageModal open={imageModalOpen} onClose={() => setImageModalOpen(false)} />
        <WhatsAppModal target={whatsappTarget} onClose={() => setWhatsappTarget(null)} />
        <FinishedConsultationModal
          summary={finishedSummary}
          onClose={() => setFinishedSummary(null)}
          onPay={(consultation) => setPayTarget(consultation)}
          onWhatsApp={setWhatsappTarget}
        />
      </AppProvider>
    </ThemeProvider>
  );
}
