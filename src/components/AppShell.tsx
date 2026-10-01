"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

interface Props {
  user: { name: string; email: string; role: string };
  dueCount: number;
  children: ReactNode;
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦", key: "d" },
  { href: "/questions", label: "Questions", icon: "☰", key: "q" },
  { href: "/add", label: "Add Question", icon: "＋", key: "n" },
  { href: "/revision", label: "Revision", icon: "↻", key: "r" },
  { href: "/formulas", label: "Formula Vault", icon: "∑", key: "f" },
  { href: "/tricks", label: "Tricks", icon: "⚡", key: "t" },
  { href: "/mistakes", label: "Mistakes", icon: "⚠", key: "m" },
  { href: "/analytics", label: "Analytics", icon: "◔", key: "a" },
  { href: "/settings", label: "Settings", icon: "⚙", key: "s" },
];

export function AppShell({ user, dueCount, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  };

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }, [router]);

  // keyboard shortcuts: g + letter, "/" to search, "?" for help
  useEffect(() => {
    let gPending = false;
    let timer: ReturnType<typeof setTimeout>;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        router.push("/questions?focus=1");
      } else if (e.key === "?") setHelp((h) => !h);
      else if (e.key === "Escape") setHelp(false);
      else if (e.key === "n") router.push("/add");
      else if (e.key === "g") {
        gPending = true;
        clearTimeout(timer);
        timer = setTimeout(() => (gPending = false), 1200);
      } else if (gPending) {
        const item = NAV.find((n) => n.key === e.key);
        if (item) router.push(item.href);
        gPending = false;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const items = user.role === "admin" ? [...NAV, { href: "/admin/taxonomy", label: "Taxonomy (Admin)", icon: "⌘", key: "" }] : NAV;
  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive(n.href) ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface2 hover:text-fg"}`}
          aria-current={isActive(n.href) ? "page" : undefined}
        >
          <span className="w-5 text-center text-base" aria-hidden>
            {n.icon}
          </span>
          <span className="flex-1">{n.label}</span>
          {n.href === "/revision" && dueCount > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-fg">{dueCount}</span>}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface p-4 lg:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 text-lg font-bold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-brand-fg">A</span> Arjuna
        </Link>
        {nav}
        <div className="mt-auto space-y-2 border-t border-line pt-4">
          <div className="px-2 text-sm">
            <p className="truncate font-medium">{user.name || "Student"}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn flex-1" onClick={toggleTheme} aria-label="Toggle dark mode">
              {dark ? "☀ Light" : "☾ Dark"}
            </button>
            <button className="btn" onClick={logout}>
              Sign out
            </button>
          </div>
          <button className="btn btn-ghost w-full text-xs text-muted" onClick={() => setHelp(true)}>
            Keyboard shortcuts <kbd className="rounded border border-line px-1">?</kbd>
          </button>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold">
          <span className="grid size-7 place-items-center rounded-md bg-brand text-sm text-brand-fg">A</span> Arjuna
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/add" className="btn btn-primary !min-h-8 !px-3">
            ＋ Add
          </Link>
          <button className="btn !min-h-8" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
            ☰
          </button>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            {nav}
            <div className="mt-auto space-y-2 border-t border-line pt-4">
              <p className="truncate px-2 text-sm font-medium">{user.name || user.email}</p>
              <div className="flex gap-2">
                <button className="btn flex-1" onClick={toggleTheme}>
                  {dark ? "☀ Light" : "☾ Dark"}
                </button>
                <button className="btn" onClick={logout}>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {help && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setHelp(false)} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-lg font-semibold">Keyboard shortcuts</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {[
                ["/", "Search questions"],
                ["n", "Add question"],
                ["g then d / q / r / f / t / m / a / s", "Go to Dashboard / Questions / Revision / Formulas / Tricks / Mistakes / Analytics / Settings"],
                ["Revision: Space", "Reveal solution"],
                ["Revision: h", "Next hint"],
                ["Revision: 1–5", "Again · Hard · Good · Easy · Mastered"],
                ["?", "Toggle this help"],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>
                    <kbd className="rounded border border-line bg-surface2 px-1.5 py-0.5 text-xs">{k}</kbd>
                  </dt>
                  <dd className="text-muted">{v}</dd>
                </div>
              ))}
            </dl>
            <button className="btn mt-4 w-full" onClick={() => setHelp(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
