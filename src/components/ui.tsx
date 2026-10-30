import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { uk } from "../i18n/uk.ts";
import { IconBack, IconClose } from "./icons.tsx";

export const primaryButton =
  "inline-flex h-12 w-full items-center justify-center rounded-2xl bg-lime px-4 text-base font-semibold text-ink transition active:scale-[0.98] disabled:opacity-50";

export const secondaryButton =
  "inline-flex h-12 w-full items-center justify-center rounded-2xl border border-line bg-panel px-4 text-base font-medium disabled:opacity-50";

export const dangerButton =
  "inline-flex h-11 items-center justify-center rounded-2xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50";

export const backButton =
  "inline-flex h-10 items-center gap-0.5 rounded-full border border-line bg-panel pl-2 pr-3.5 text-sm font-medium text-white transition active:scale-[0.98]";

export const chipButton =
  "inline-flex h-8 items-center justify-center rounded-full border border-line bg-ink px-3 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50";

export const chipDanger =
  "inline-flex h-8 items-center justify-center rounded-full border border-danger/40 px-3 text-sm font-medium text-danger transition active:scale-[0.98] disabled:opacity-50";

export const dangerOutline =
  "inline-flex h-12 w-full items-center justify-center rounded-2xl border border-danger/40 bg-danger/10 px-4 text-base font-medium text-danger transition active:scale-[0.98] disabled:opacity-50";

export const iconButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-ink text-white transition active:scale-[0.98]";

export const fieldClass =
  "h-12 w-full rounded-xl border border-line bg-ink px-3 text-base text-white outline-none placeholder:text-muted focus:border-lime";

export const numberClass =
  "h-16 w-full rounded-2xl border border-line bg-ink text-center text-3xl font-semibold text-white tabular-nums outline-none focus:border-lime";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function BackButton({ onClick, to }: { onClick?: () => void; to?: string }) {
  const content = (
    <>
      <IconBack />
      {uk.back}
    </>
  );
  if (to) return <Link to={to} className={backButton}>{content}</Link>;
  return (
    <button type="button" className={backButton} onClick={onClick}>
      {content}
    </button>
  );
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title === uk.appName ? title : `${title} · ${uk.appName}`;
  }, [title]);
}

export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="10" fill="#d6ff4a" />
      <rect x="7" y="14.5" width="18" height="3" rx="1.5" fill="#07080b" />
      <circle cx="9" cy="16" r="3.4" fill="#07080b" />
      <circle cx="23" cy="16" r="3.4" fill="#07080b" />
    </svg>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-danger">{error}</span> : null}
    </label>
  );
}

export function Loading({ label = uk.loading }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-muted" role="status">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-lime" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-4 py-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {text ? <p className="mt-2 text-sm text-muted">{text}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-3xl border border-danger/40 bg-danger/10 px-4 py-6 text-center" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className={`${secondaryButton} mt-4`} onClick={onRetry}>
          {uk.retry}
        </button>
      ) : null}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-black/70" aria-label={uk.close} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className={iconButton} aria-label={uk.close} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-sm text-muted">{body}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" className={secondaryButton} onClick={onClose} disabled={busy}>
          {uk.cancel}
        </button>
        <button type="button" className={dangerButton} onClick={onConfirm} disabled={busy}>
          {busy ? uk.saving : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

export function ExerciseThumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return <div className="h-full w-full bg-panel-2" aria-hidden="true" />;
  }
  return <img src={src} alt={alt} className="h-full w-full object-cover" />;
}
