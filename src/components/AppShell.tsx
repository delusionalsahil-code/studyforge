import { useEffect, useRef, useState, type ReactNode } from "react";
import { dueQuestions } from "../lib/queries";
import { Link, go, useRoute } from "../lib/router";
import { persistenceMode, updateSettings, useDB } from "../lib/store";
import { aiConfigured } from "../lib/ai/client";
import { cn } from "../utils/cn";
import { Toaster } from "./ui";

const ICONS: Record<string, string> = {
  dashboard: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10",
  questions: "M4 5h16M4 12h16M4 19h10",
  add: "M12 5v14M5 12h14",
  revision: "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5",
  formulas: "M5 4h14M5 20h14M8 4l8 8-8 8",
  tricks: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  mistakes: "M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  analytics: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  taxonomy: "M6 3v6a3 3 0 0 0 3 3h9M6 12v6a3 3 0 0 0 3 3h9M18 9v6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  sun: "M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
};
export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard", key: "d" },
  { to: "/questions", label: "Questions", icon: "questions", key: "q" },
  { to: "/add", label: "Add Question", icon: "add", key: "n" },
  { to: "/revision", label: "Revision", icon: "revision", key: "r" },
  { to: "/formulas", label: "Formula Vault", icon: "formulas", key: "f" },
  { to: "/tricks", label: "Tricks", icon: "tricks", key: "t" },
  { to: "/mistakes", label: "Mistakes", icon: "mistakes", key: "m" },
  { to: "/analytics", label: "Analytics", icon: "analytics", key: "a" },
  { to: "/admin/taxonomy", label: "Taxonomy", icon: "taxonomy", key: "x" },
  { to: "/settings", label: "Settings", icon: "settings", key: "s" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const db = useDB();
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const pending = useRef<number | null>(null);
  const due = dueQuestions(db).length;
  const dark = document.documentElement.classList.contains("dark");

  useEffect(() => setDrawer(false), [route.path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") return void setHelp((h) => !h);
      if (e.key === "Escape") return void setHelp(false);
      if (e.key === "/") {
        const el = document.getElementById("search");
        if (el) {
          e.preventDefault();
          el.focus();
        } else go("/questions");
        return;
      }
      if (pending.current) {
        clearTimeout(pending.current);
        pending.current = null;
        const item = NAV.find((n) => n.key === e.key.toLowerCase());
        if (item) go(item.to);
        return;
      }
      if (e.key === "g") pending.current = window.setTimeout(() => (pending.current = null), 1200);
      if (e.key === "n") go("/add");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (to: string) => route.path === to || route.path.startsWith(to + "/");
  const toggleTheme = () => updateSettings({ theme: dark ? "light" : "dark" });

  const navLink = (n: (typeof NAV)[number]) => (
    <Link key={n.to} to={n.to} aria-current={isActive(n.to) ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", isActive(n.to) ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-fg")}>
      <Icon name={n.icon} />
      <span className="flex-1">{n.label}</span>
      {n.to === "/revision" && due > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white dark:text-black">{due}</span>}
    </Link>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <Link to="/dashboard" className="mb-5 flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white dark:text-black">S</span>
          <span className="text-base font-semibold tracking-tight">StudyForge</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Main">
          {NAV.map(navLink)}
        </nav>
        <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs text-muted">
          <div className="flex items-center justify-between px-2">
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", aiConfigured() ? "bg-good" : "bg-warn")} />
              {aiConfigured() ? "AI connected" : "AI not configured"}
            </span>
            <button onClick={toggleTheme} className="rounded-md p-1.5 hover:bg-surface-2" aria-label="Toggle dark mode">
              <Icon name={dark ? "sun" : "moon"} />
            </button>
          </div>
          <button onClick={() => setHelp(true)} className="w-full rounded-md px-2 py-1 text-left hover:bg-surface-2">
            Keyboard shortcuts <kbd className="ml-1 rounded border border-line px-1">?</kbd>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-xs font-bold text-white dark:text-black">S</span>
            <span className="font-semibold">StudyForge</span>
          </Link>
          <button onClick={toggleTheme} className="rounded-md p-2 hover:bg-surface-2" aria-label="Toggle dark mode">
            <Icon name={dark ? "sun" : "moon"} />
          </button>
        </header>
        {persistenceMode === "memory" && (
          <div className="bg-warn-soft px-4 py-2 text-center text-xs text-warn">Browser storage is unavailable here — your data will be lost when you close this tab. Use Settings → Export backup.</div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Mobile">
        {[NAV[0], NAV[1], NAV[2], NAV[3]].map((n) => (
          <Link key={n.to} to={n.to} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium", isActive(n.to) ? "text-brand" : "text-muted")}>
            <Icon name={n.icon} className="h-5 w-5" />
            {n.label.replace(" Question", "")}
            {n.to === "/revision" && due > 0 && <span className="absolute right-[28%] top-1 rounded-full bg-brand px-1 text-[9px] font-bold text-white dark:text-black">{due}</span>}
          </Link>
        ))}
        <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted">
          <Icon name="more" className="h-5 w-5" />
          More
        </button>
      </nav>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Navigate</div>
            <div className="grid grid-cols-2 gap-1">{NAV.map(navLink)}</div>
          </div>
        </div>
      )}
      {help && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setHelp(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Keyboard shortcuts</h2>
              <button className="btn btn-sm" onClick={() => setHelp(false)}>Close</button>
            </div>
            <ul className="space-y-1.5 text-sm">
              {[["g then d / q / r / f / t / m / a / x / s", "Go to a section"], ["n", "Add a question"], ["/", "Focus search"], ["?", "Toggle this help"]].map(([k, v]) => (
                <li key={k} className="flex justify-between gap-4"><kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs">{k}</kbd><span className="text-muted">{v}</span></li>
              ))}
              <li className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">In revision</li>
              {[["H", "Next hint"], ["Space / S", "Show solution"], ["1 2 3 4 5", "Again · Hard · Good · Easy · Mastered"]].map(([k, v]) => (
                <li key={k} className="flex justify-between gap-4"><kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs">{k}</kbd><span className="text-muted">{v}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <Toaster />
    </div>
  );
}
