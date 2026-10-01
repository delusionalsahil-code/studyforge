import { useEffect, useState } from "react";
import { setParams, useRoute } from "../lib/router";
import { useDB, useTax } from "../lib/store";
import { toClient } from "../lib/taxonomy";
import { DIFFICULTIES, HIERARCHY, LEVEL_PARAM, type HierarchyLevel, type Selection } from "../lib/taxonomy-types";
import { HierarchySelects } from "./Hierarchy";

export function selectionFromParams(p: Record<string, string>): Selection {
  const s: Selection = {};
  for (const lv of HIERARCHY) s[lv] = Number(p[LEVEL_PARAM[lv]]) || null;
  return s;
}

export function SearchBox({ placeholder, param = "q" }: { placeholder?: string; param?: string }) {
  const route = useRoute();
  const [v, setV] = useState(route.params[param] ?? "");
  useEffect(() => setV(route.params[param] ?? ""), [route.params[param]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => {
      if ((route.params[param] ?? "") !== v.trim()) setParams(route, { [param]: v.trim() });
    }, 350);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative">
      <input id="search" className="input !pr-9" type="search" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder ?? "Search…"} aria-label="Search" />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-muted sm:block">/</kbd>
    </div>
  );
}

export function QuestionFilters({ levels = HIERARCHY as unknown as HierarchyLevel[], extras = true, placeholder, chips = [] }: { levels?: HierarchyLevel[]; extras?: boolean; placeholder?: string; chips?: string[] }) {
  const route = useRoute();
  const db = useDB();
  const tax = useTax();
  const ctax = toClient(tax);
  const [open, setOpen] = useState(true);
  const sel = selectionFromParams(route.params);
  const active = HIERARCHY.filter((lv) => sel[lv]).length + ["type", "difficulty", "formula", "status", "trick", "review", "source"].filter((k) => route.params[k]).length;

  const onSel = (s: Selection) => {
    const patch: Record<string, string | null> = {};
    for (const lv of HIERARCHY) patch[LEVEL_PARAM[lv]] = s[lv] ? String(s[lv]) : null;
    setParams(route, patch);
  };
  const set = (k: string, v: string) => setParams(route, { [k]: v || null });
  const sources = [...new Set(db.questions.map((q) => q.sourceName).filter((s): s is string => Boolean(s)))].slice(0, 40);
  const relevantFormulas = db.formulas.filter((f) => !sel.chapter || f.chapterId === sel.chapter).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="card mb-5 space-y-3 !p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-60 flex-1">
          <SearchBox placeholder={placeholder ?? "Search or ask: “hard electrostatics numericals”, “my weak integration questions”, “questions with shortcuts”…"} />
        </div>
        <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          Filters{active > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white dark:text-black">{active}</span>}
        </button>
        {(active > 0 || route.params.q) && (
          <button className="btn" onClick={() => setParams(route, Object.fromEntries(Object.keys(route.params).map((k) => [k, null])))}>
            Clear
          </button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Understood as:
          {chips.map((c) => (
            <span key={c} className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand">{c}</span>
          ))}
        </div>
      )}
      {open && (
        <>
          <HierarchySelects tax={ctax} value={sel} onChange={onSel} levels={levels} compact />
          {extras && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
              <Select label="Question type" value={route.params.type} onChange={(v) => set("type", v)} options={(ctax.question_type ?? []).map((n) => [String(n.id), n.name])} />
              <Select label="Difficulty" value={route.params.difficulty} onChange={(v) => set("difficulty", v)} options={DIFFICULTIES.map((d) => [d, d])} />
              <Select label="Formula" value={route.params.formula} onChange={(v) => set("formula", v)} options={relevantFormulas.map((f) => [f.id, f.name])} />
              <Select label="Study status" value={route.params.status} onChange={(v) => set("status", v)} options={[["due", "Revision due"], ["weak", "Weak"], ["mastered", "Mastered"]]} />
              <Select label="Shortcut" value={route.params.trick} onChange={(v) => set("trick", v)} options={[["1", "Has a shortcut"]]} />
              <Select label="Review" value={route.params.review} onChange={(v) => set("review", v)} options={[["1", "Needs review"]]} />
              <Select label="Source" value={route.params.source} onChange={(v) => set("source", v)} options={[["image", "Images"], ["pdf", "PDFs"], ["text", "Typed / pasted"], ["ai_generated", "AI-generated"], ...sources.map((s): [string, string] => [s, s])]} />
              <Select label="Sort" value={route.params.sort} onChange={(v) => set("sort", v)} options={[["old", "Oldest first"], ["due", "Next revision"]]} anyLabel="Newest first" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, anyLabel }: { label: string; value?: string; onChange: (v: string) => void; options: [string, string][]; anyLabel?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">{anyLabel ?? "Any"}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}

export function Pager({ page, total, pageSize }: { page: number; total: number; pageSize: number }) {
  const route = useRoute();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const go = (p: number) => {
    setParams(route, { page: p > 1 ? String(p) : null }, false);
    window.scrollTo({ top: 0 });
  };
  return (
    <div className="mt-5 flex items-center justify-between text-sm">
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => go(page - 1)}>← Previous</button>
      <span className="text-muted">Page {page} of {pages}</span>
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => go(page + 1)}>Next →</button>
    </div>
  );
}
