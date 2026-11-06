"use client";

import { useEffect, type ReactNode } from "react";

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

const ICON_PATHS: Record<string, string> = {
  sparkles: "m12 3 1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1-2.1-.9 2.1-.9zM5 16l.6 1.4L7 18l-1.4.6L5 20l-.6-1.4L3 18l1.4-.6z",
  home: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  calendar: "M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  wallet: "M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M16 13h3",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  plus: "M12 5v14M5 12h14",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  upload: "M12 21V9M7 14l5-5 5 5M4 3h16",
  code: "m8 6-6 6 6 6M16 6l6 6-6 6",
  menu: "M3 6h18M3 12h18M3 18h18",
  left: "m15 18-6-6 6-6",
  right: "m9 18 6-6-6-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  phone:
    "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z",
  star: "m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z",
  coins: "M9 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15 22a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
  image: "M3 5h18v14H3zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 15l-5-5L5 19",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  card: "M2 7h20v10H2zM2 11h20",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8",
  refresh: "M21 12a9 9 0 1 1-3-6.7M21 3v6h-6",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM7 3v6h10V3M7 21v-7h10v7",
  arrow: "M5 12h14M13 5l7 7-7 7",
  printer: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  filter: "M22 3H2l8 9.5V21l4-2v-6.5z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  userPlus: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M19 8v6M22 11h-6",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z",
  flame: "M12 2c1.5 3.5 5 5.5 5 10a5 5 0 1 1-10 0c0-2.5 1.5-4.5 2.5-6 0 2 1.5 3 2.5 2 0-2.5-.5-4.5 0-6zM12 14c1 1 1.5 2 1.5 3a1.5 1.5 0 1 1-3 0c0-1 .5-2 1.5-3z",
  leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.4 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 4.5-6.3C9.5 13.7 12 12 14 9",
  table: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M3 15h18M9 10v11",
  devices: "M4 6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7h-3v-5H6v8h6v2H4zM15 13h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1zM17.5 18.5h.01",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
  play: "m6 4 14 8-14 8V4z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  stop: "M6 6h12v12H6z",
  timer: "M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  whatsapp:
    "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5zM9.5 8.8c.2 0 .4 0 .6.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c.4.8 1.1 1.5 1.9 1.9l.6-.5c.2-.1.4-.2.6-.1l1.6.7c.4.2.4.4.4.6 0 .8-.7 1.5-1.5 1.5-2.5 0-5.8-3.3-5.8-5.8 0-.8.7-1.5 1.5-1.5z",
};

export function Icon({ name, size = 18, className }: { name: keyof typeof ICON_PATHS | string; size?: number; className?: string }) {
  const path = ICON_PATHS[name] ?? ICON_PATHS.sparkles;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("chip", className)}>{children}</span>;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "card flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle ? <p className="muted mt-0.5 text-xs">{subtitle}</p> : null}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div
            className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3"
            style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--raised) 65%, transparent)" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  onConfirm,
  onClose,
  danger = true,
  children,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={cx("btn", danger ? "btn-danger" : "btn-primary")} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="rounded-full p-2" style={{ background: "var(--primary-soft)" }}>
          <Icon name={danger ? "alert" : "check"} size={20} />
        </div>
        <div className="space-y-2 text-sm">
          <p>{message}</p>
          {children}
        </div>
      </div>
    </Modal>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: string;
  tone?: "primary" | "accent" | "success" | "warning" | "danger" | "neutral";
}) {
  const toneColor: Record<string, string> = {
    primary: "var(--primary)",
    accent: "var(--accent)",
    success: "#1f8a5b",
    warning: "#b7791f",
    danger: "#b4231b",
    neutral: "var(--muted)",
  };
  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="muted text-[0.68rem] font-bold uppercase tracking-[0.09em]">{label}</p>
        {icon ? (
          <span className="rounded-full p-1.5" style={{ background: `color-mix(in srgb, ${toneColor[tone]} 16%, transparent)`, color: toneColor[tone] }}>
            <Icon name={icon} size={15} />
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xl font-semibold leading-tight sm:text-2xl" style={{ color: tone === "primary" ? "var(--text)" : toneColor[tone] }}>
        {value}
      </p>
      {hint ? <p className="muted mt-1 text-[0.72rem] leading-snug">{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div>
      <div className="h-3 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--border) 65%, transparent)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${safe}%`, background: "linear-gradient(90deg, var(--primary), var(--accent))" }}
        />
      </div>
      <p className="muted mt-1 text-[0.72rem]">{label ?? `${safe}% da meta alcançada`}</p>
    </div>
  );
}

export function EmptyState({
  icon = "sparkles",
  title,
  message,
  action,
}: {
  icon?: string;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="rounded-full p-3" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
        <Icon name={icon} size={26} />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="muted max-w-md text-sm">{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-start gap-2">
        {icon ? (
          <span className="mt-0.5 rounded-lg p-1.5" style={{ background: "var(--primary-soft)", color: "var(--text)" }}>
            <Icon name={icon} size={16} />
          </span>
        ) : null}
        <div>
          <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
          {subtitle ? <p className="muted text-xs">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  required,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="label">
        {label} {required ? <span style={{ color: "var(--primary)" }}>*</span> : null}
      </span>
      {children}
      {hint ? <span className="muted mt-1 block text-[0.7rem] leading-snug">{hint}</span> : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="muted mt-0.5 text-xs">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 shrink-0 rounded-full border transition"
        style={{
          background: checked ? "var(--primary)" : "color-mix(in srgb, var(--border) 70%, transparent)",
          borderColor: "var(--border)",
        }}
      >
        <span
          className="absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all"
          style={{ height: 18, width: 18, left: checked ? 22 : 3 }}
        />
      </button>
    </div>
  );
}
