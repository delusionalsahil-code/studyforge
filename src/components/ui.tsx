import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{hint}</p>}
      {action && (
        <Link href={action.href} className="btn btn-primary mt-4">
          {action.label}
        </Link>
      )}
    </div>
  );
}

const DIFF: Record<string, string> = {
  Easy: "text-ok border-ok/30 bg-ok/10",
  Medium: "text-warn border-warn/30 bg-warn/10",
  Hard: "text-bad border-bad/30 bg-bad/10",
  "Very Hard": "text-bad border-bad/50 bg-bad/15 font-semibold",
};
export function DiffBadge({ value, confidence }: { value: string | null; confidence?: number | null }) {
  if (!value) return <span className="badge">Difficulty unknown</span>;
  return (
    <span className={`badge ${DIFF[value] ?? ""}`} title={confidence != null ? `Confidence ${Math.round(confidence * 100)}%` : undefined}>
      {value}
      {confidence != null && <span className="opacity-60">· {Math.round(confidence * 100)}%</span>}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    queued: ["Queued", ""],
    processing: ["Analysing…", "text-brand border-brand/30 bg-brand-soft"],
    failed: ["Failed — retry", "text-bad border-bad/30 bg-bad/10"],
    duplicate_pending: ["Possible duplicate", "text-warn border-warn/30 bg-warn/10"],
  };
  const m = map[status];
  if (!m) return null;
  return <span className={`badge ${m[1]}`}>{m[0]}</span>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "";
  return (
    <div className="card !p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Bar({ value, max = 1, tone = "brand" }: { value: number; max?: number; tone?: "brand" | "ok" | "warn" | "bad" }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  const bg = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "bg-brand";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${bg}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className = "h-16" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface2 ${className}`} />;
}

export const fmtDate = (d: Date | string | null | undefined, tz = "Asia/Kolkata") =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: tz }) : "—";
export const fmtDateTime = (d: Date | string | null | undefined, tz = "Asia/Kolkata") =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz }) : "—";
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export function relativeDue(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const ms = new Date(d).getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  if (ms < 0) return days === 0 || ms > -86_400_000 ? "Due now" : `Overdue by ${Math.abs(days)} d`;
  if (ms < 3_600_000) return "In under an hour";
  if (ms < 86_400_000) return `In ${Math.round(ms / 3_600_000)} h`;
  return `In ${days} d`;
}
