"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CurrencyCode, DataBundle } from "@/lib/types";
import { formatMoney } from "@/lib/format";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: Tone };

type BlockedInfo = { message: string; code?: string };

type AppContextValue = {
  data: DataBundle;
  currency: CurrencyCode;
  money: (cents: number, withCurrency?: boolean) => string;
  mutate: (path: string, method?: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
  toast: (message: string, tone?: Tone) => void;
  offline: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);
const CACHE_KEY = "cartomante-pro:cache:v1";

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp deve ser usado dentro do AppProvider");
  return ctx;
}

export function AppProvider({
  children,
  initialData,
  onBlocked,
  onUnauthorized,
}: {
  children: ReactNode;
  initialData: DataBundle;
  onBlocked: (info: BlockedInfo) => void;
  onUnauthorized: () => void;
}) {
  const [data, setData] = useState<DataBundle>(initialData);
  const [offline, setOffline] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const blockedRef = useRef(onBlocked);
  const unauthorizedRef = useRef(onUnauthorized);
  blockedRef.current = onBlocked;
  unauthorizedRef.current = onUnauthorized;

  const toast = useCallback((message: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const load = useCallback(async (silent = true) => {
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (res.status === 401) {
        unauthorizedRef.current();
        return;
      }
      if (res.status === 402 || res.status === 403) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        blockedRef.current({ message: body.error ?? "Acesso indisponível.", code: body.code });
        return;
      }
      if (!res.ok) throw new Error("Falha ao carregar dados");
      const bundle = (await res.json()) as DataBundle;
      setData(bundle);
      setOffline(false);
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
      } catch {
        /* armazenamento cheio: o app segue com os dados em memória */
      }
      if (!silent) toast("Dados atualizados.", "success");
    } catch {
      try {
        const cached = window.localStorage.getItem(CACHE_KEY);
        if (cached) {
          setData(JSON.parse(cached) as DataBundle);
          setOffline(true);
        }
      } catch {
        /* mantém os dados atuais */
      }
    }
  }, [toast]);

  const mutate = useCallback(
    async (path: string, method: "POST" | "PATCH" | "DELETE" = "POST", body?: unknown) => {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        if (res.status === 402 || res.status === 403) {
          blockedRef.current({ message: String(json.error ?? "Acesso indisponível."), code: json.code as string });
        }
        if (res.status === 401) unauthorizedRef.current();
        const error = new Error(String(json.error ?? "Não foi possível concluir a operação."));
        (error as Error & { extra?: Record<string, unknown> }).extra = json;
        throw error;
      }
      await load();
      return json;
    },
    [load, toast],
  );

  useEffect(() => {
    const interval = window.setInterval(() => void load(), 120000);
    let lastFocus = 0;
    const onFocus = () => {
      if (Date.now() - lastFocus < 15000) return;
      lastFocus = Date.now();
      void load();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [load]);

  const currency = data.settings.currency ?? "BRL";
  const money = useCallback((cents: number) => formatMoney(cents, currency), [currency]);

  const value = useMemo<AppContextValue>(
    () => ({ data, currency, money, mutate, refresh: () => load(false), toast, offline }),
    [data, currency, money, mutate, load, toast, offline],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-[calc(5.6rem+env(safe-area-inset-bottom,0px))] z-[90] flex flex-col items-center gap-2 px-3 lg:bottom-5 lg:right-5 lg:left-auto lg:items-end">
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-3 py-2 text-sm shadow-lg"
            style={{
              background: "var(--surface)",
              borderColor:
                item.tone === "error" ? "#b4231b" : item.tone === "info" ? "var(--accent)" : "color-mix(in srgb, var(--primary) 55%, transparent)",
              color: "var(--text)",
            }}
          >
            <span
              className="mt-0.5 shrink-0"
              style={{ color: item.tone === "error" ? "#b4231b" : item.tone === "info" ? "var(--accent)" : "var(--primary)" }}
            >
              {item.tone === "error" ? "!" : item.tone === "info" ? "i" : "✓"}
            </span>
            <span className="leading-snug">{item.message}</span>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
