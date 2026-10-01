"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { HierarchyFields } from "@/components/HierarchyFields";
import { DIFFICULTIES, HIERARCHY, LEVEL_PARAM, type ClientTaxonomy, type Selection } from "@/lib/taxonomy-types";

interface Props {
  tax: ClientTaxonomy;
  formulas: { id: number; name: string }[];
  values: Record<string, string>;
  chips: string[];
  focus?: boolean;
  basePath?: string;
  /** which extra filters to show */
  extras?: ("type" | "difficulty" | "formula" | "status" | "trick" | "review" | "source")[];
  levels?: readonly (typeof HIERARCHY)[number][];
  showSearch?: boolean;
  placeholder?: string;
}

/** URL-driven filter bar: every change updates the query string (server-rendered, shareable, paginated results). */
export function QuestionFilters({ tax, formulas, values, chips, focus, basePath = "/questions", extras = ["type", "difficulty", "formula", "status", "trick", "review", "source"], levels = HIERARCHY, showSearch = true, placeholder }: Props) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(values.q ?? "");
  const [open, setOpen] = useState(Object.keys(values).some((k) => k !== "q" && k !== "page" && k !== "focus"));

  useEffect(() => setQ(values.q ?? ""), [values.q]);
  useEffect(() => {
    if (focus) searchRef.current?.focus();
  }, [focus]);

  const sel: Selection = {};
  for (const l of HIERARCHY) sel[l] = values[LEVEL_PARAM[l]] ? Number(values[LEVEL_PARAM[l]]) : null;

  function push(patch: Record<string, string | null>) {
    const next: Record<string, string> = { ...values };
    delete next.page;
    delete next.focus;
    for (const [k, v] of Object.entries(patch)) {
      if (v) next[k] = v;
      else delete next[k];
    }
    const qs = new URLSearchParams(next).toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const active = Object.keys(values).filter((k) => !["page", "focus"].includes(k)).length;
  const typeOpts = tax.question_type ?? [];

  return (
    <div className="card mb-5 space-y-4 !p-4">
      {showSearch && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            push({ q: q.trim() || null });
          }}
          className="flex gap-2"
          role="search"
        >
          <input
            ref={searchRef}
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder ?? "Search or ask: “hard electrostatics numericals”, “my weak integration questions”, “questions with shortcuts”…"}
            aria-label="Search questions"
          />
          <button className="btn btn-primary">Search</button>
        </form>
      )}
      {chips.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Understood as:
          {chips.map((c) => (
            <span key={c} className="badge text-brand">
              {c}
            </span>
          ))}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button type="button" className="btn btn-ghost !px-2 text-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "▾" : "▸"} Filters {active > 0 && <span className="badge text-brand">{active}</span>}
        </button>
        {active > 0 && (
          <button type="button" className="btn btn-ghost text-sm" onClick={() => router.push(basePath)}>
            Clear all
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-4">
          <HierarchyFields
            tax={tax}
            value={sel}
            levels={levels}
            onChange={(next) => {
              const patch: Record<string, string | null> = {};
              for (const l of HIERARCHY) patch[LEVEL_PARAM[l]] = next[l] ? String(next[l]) : null;
              push(patch);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {extras.includes("type") && (
              <div>
                <label className="label" htmlFor="f-type">
                  Question type
                </label>
                <select id="f-type" className="input" value={values.typeId ?? ""} onChange={(e) => push({ typeId: e.target.value || null })}>
                  <option value="">All types</option>
                  {typeOpts.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {extras.includes("difficulty") && (
              <div>
                <label className="label" htmlFor="f-diff">
                  Difficulty
                </label>
                <select id="f-diff" className="input" value={values.difficulty ?? ""} onChange={(e) => push({ difficulty: e.target.value || null })}>
                  <option value="">Any</option>
                  {DIFFICULTIES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}
            {extras.includes("formula") && (
              <div>
                <label className="label" htmlFor="f-formula">
                  Formula used
                </label>
                <select id="f-formula" className="input" value={values.formulaId ?? ""} onChange={(e) => push({ formulaId: e.target.value || null })}>
                  <option value="">Any formula</option>
                  {formulas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {extras.includes("status") && (
              <div>
                <label className="label" htmlFor="f-status">
                  Progress
                </label>
                <select id="f-status" className="input" value={values.status ?? ""} onChange={(e) => push({ status: e.target.value || null })}>
                  <option value="">All</option>
                  <option value="due">Revision due</option>
                  <option value="weak">Weak</option>
                  <option value="mastered">Mastered</option>
                  <option value="new">Not yet revised</option>
                  <option value="failed">Needs attention (failed / duplicate)</option>
                </select>
              </div>
            )}
            {extras.includes("source") && (
              <div>
                <label className="label" htmlFor="f-source">
                  Source
                </label>
                <input
                  id="f-source"
                  className="input"
                  defaultValue={values.source ?? ""}
                  placeholder="Book / test name, or image, pdf, text"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") push({ source: e.currentTarget.value.trim() || null });
                  }}
                  onBlur={(e) => e.currentTarget.value.trim() !== (values.source ?? "") && push({ source: e.currentTarget.value.trim() || null })}
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            {extras.includes("trick") && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={values.trick === "1"} onChange={(e) => push({ trick: e.target.checked ? "1" : null })} /> Shortcut available
              </label>
            )}
            {extras.includes("review") && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={values.review === "1"} onChange={(e) => push({ review: e.target.checked ? "1" : null })} /> Needs review
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
