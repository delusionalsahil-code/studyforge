import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../utils/cn";
import { Link } from "../lib/router";

export type Tone = "neutral" | "brand" | "good" | "warn" | "bad";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  brand: "bg-brand-soft text-brand",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function DifficultyBadge({ value }: { value: string | null }) {
  if (!value) return <Badge>Difficulty ?</Badge>;
  const tone: Tone = value === "Easy" ? "good" : value === "Medium" ? "brand" : value === "Hard" ? "warn" : "bad";
  return <Badge tone={tone}>{value}</Badge>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, hint, action, children }: { title: string; hint?: string; action?: { to: string; label: string; params?: Record<string, string> }; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-12 text-center">
      <div className="text-base font-semibold">{title}</div>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action && (
        <Link to={action.to} params={action.params} className="btn btn-primary mt-2">
          {action.label}
        </Link>
      )}
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-label="Loading" />;
}

export function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  return (
    <div className="card !p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "bad" && "text-bad", tone === "good" && "text-good", tone === "warn" && "text-warn")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Bar({ value, tone = "brand" }: { value: number; tone?: "brand" | "good" | "warn" | "bad" }) {
  const color = { brand: "bg-brand", good: "bg-good", warn: "bg-warn", bad: "bg-bad" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </div>
  );
}
export const accTone = (a: number | null) => (a === null ? "brand" : a >= 0.8 ? "good" : a >= 0.6 ? "warn" : "bad") as "brand" | "good" | "warn" | "bad";

export function ErrorBox({ children, title = "Something went wrong" }: { children: ReactNode; title?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-bad/30 bg-bad-soft p-3 text-sm text-bad">
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 opacity-90">{children}</div>
    </div>
  );
}

export function Section({ title, hint, actions, children, id }: { title: string; hint?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* --------------------------------- toasts --------------------------------- */
interface ToastMsg {
  id: number;
  text: string;
  tone: "good" | "bad" | "neutral";
}
let toasts: ToastMsg[] = [];
let tid = 0;
const tl = new Set<() => void>();
export function toast(text: string, tone: ToastMsg["tone"] = "neutral") {
  const t = { id: ++tid, text, tone };
  toasts = [...toasts, t];
  tl.forEach((f) => f());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    tl.forEach((f) => f());
  }, tone === "bad" ? 7000 : 3500);
}
export function Toaster() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    tl.add(f);
    return () => void tl.delete(f);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 lg:bottom-6" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn("pointer-events-auto rounded-lg border px-3.5 py-2.5 text-sm shadow-lg", t.tone === "bad" ? "border-bad/40 bg-bad-soft text-bad" : t.tone === "good" ? "border-good/40 bg-good-soft text-good" : "border-line bg-surface")}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string; count?: number }[] }) {
  return (
    <div className="scroll-thin flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1" role="tablist">
      {items.map((i) => (
        <button key={i.key} role="tab" aria-selected={value === i.key} onClick={() => onChange(i.key)} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors", value === i.key ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}>
          {i.label}
          {i.count !== undefined && <span className="ml-1.5 text-xs opacity-70">{i.count}</span>}
        </button>
      ))}
    </div>
  );
}
