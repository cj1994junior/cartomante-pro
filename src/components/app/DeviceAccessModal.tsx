"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useApp } from "@/components/app/AppProvider";
import { Icon, Modal } from "@/components/ui";

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function DeviceAccessContent() {
  const { data, toast } = useApp();
  const [origin, setOrigin] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = window.location.origin;
    setOrigin(url);
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);

    QRCode.toDataURL(url, {
      width: 200,
      margin: 1,
      color: { dark: "#241a33", light: "#ffffff" },
    })
      .then((res) => setQrDataUrl(res))
      .catch(() => setQrDataUrl(""));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as DeferredInstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const copyLink = async () => {
    if (!origin) return;
    try {
      await navigator.clipboard.writeText(origin);
      toast("Link de acesso copiado! Abra no navegador do telefone, tablet ou computador.", "success");
    } catch {
      toast(`Link do aplicativo: ${origin}`, "info");
    }
  };

  const shareLink = async () => {
    if (!origin) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "Cartomante Pro",
          text: "Acesse seu painel Cartomante Pro no telefone, tablet ou computador:",
          url: origin,
        });
        return;
      } catch {
        /* cancelado pelo usuário */
      }
    }
    await copyLink();
  };

  const installApp = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        toast("Aplicativo instalado na tela deste dispositivo!", "success");
        setInstallPrompt(null);
      }
    } catch {
      toast("Use o menu do navegador para adicionar o aplicativo à tela inicial.", "info");
    }
  };

  return (
    <div className="space-y-4">
      <div className="card-muted grid gap-3 p-3.5 sm:grid-cols-[auto_1fr] sm:items-center">
        {qrDataUrl ? (
          <div className="mx-auto flex flex-col items-center rounded-xl border bg-white p-2 sm:mx-0" style={{ borderColor: "var(--border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR Code para abrir no celular ou tablet" className="h-32 w-32" />
            <span className="mt-1 text-[0.6rem] font-semibold text-[#241a33]">Aponte a câmera</span>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip chip-active">Telefone</span>
            <span className="chip chip-active">Tablet</span>
            <span className="chip chip-active">Web / Computador</span>
            {standalone ? <span className="chip">Instalado como App</span> : null}
          </div>
          <p className="text-sm font-semibold">Acesse sua conta em qualquer aparelho</p>
          <p className="muted text-xs leading-snug">
            Abra o endereço abaixo no navegador do seu <strong>telefone</strong>, <strong>tablet</strong> ou <strong>computador</strong> e entre com
            seu e-mail (<strong>{data.tenant.email}</strong>) e senha. Todos os seus cadastros, consultas, trabalhos e finanças estarão disponíveis
            na hora.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <input className="input flex-1 py-1.5 text-xs font-medium" readOnly value={origin || "Carregando link..."} />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void copyLink()}>
              <Icon name="copy" size={13} /> Copiar link
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void shareLink()}>
              <Icon name="share" size={13} /> Enviar
            </button>
          </div>
          {installPrompt ? (
            <button type="button" className="btn btn-primary btn-sm w-full" onClick={() => void installApp()}>
              <Icon name="download" size={14} /> Instalar aplicativo neste dispositivo
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="card-muted space-y-1 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold">
            <Icon name="phone" size={15} /> No Telefone (iOS e Android)
          </p>
          <p className="muted leading-snug">
            Navegação inferior adaptada para uma mão. Para instalar na tela inicial: no <strong>Android (Chrome)</strong> toque nos 3 pontos →{" "}
            <em>Instalar aplicativo</em>; no <strong>iPhone (Safari)</strong> toque em <em>Compartilhar → Adicionar à Tela de Início</em>.
          </p>
        </div>

        <div className="card-muted space-y-1 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold">
            <Icon name="devices" size={15} /> No Tablet (iPad e Android)
          </p>
          <p className="muted leading-snug">
            Barra lateral compacta em modo retrato e completa em modo paisagem, com grades de 2 e 3 colunas para visualizar agenda, cartas e
            trabalhos durante o atendimento.
          </p>
        </div>

        <div className="card-muted space-y-1 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold">
            <Icon name="table" size={15} /> Na Web (Computador)
          </p>
          <p className="muted leading-snug">
            Menu lateral fixo com todas as 9 áreas visíveis, tabelas detalhadas, impressão de relatórios e preenchimento rápido da Planilha Padrão
            em Excel.
          </p>
        </div>
      </div>
    </div>
  );
}

export function DeviceAccessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Usar no Telefone, Tablet e Web"
      subtitle="Mesma conta, interface responsiva e opção de instalar na tela inicial."
      wide
      footer={
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <DeviceAccessContent />
    </Modal>
  );
}
