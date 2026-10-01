"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DuplicateCard } from "@/components/DuplicateCard";
import { HierarchyFields } from "@/components/HierarchyFields";
import { Rich } from "@/components/Rich";
import { Stepper } from "@/components/Stepper";
import { DIFFICULTIES, HIERARCHY, type ClientTaxonomy, type HierarchyLevel, type Selection } from "@/lib/taxonomy-types";

/* ---------------------------- processing panel ---------------------------- */
export function QuestionProcessing({
  id,
  status: initialStatus,
  stage: initialStage,
  error: initialError,
  stale: initialStale,
  duplicate,
}: {
  id: string;
  status: string;
  stage: string;
  error: string | null;
  stale: boolean;
  duplicate: { id: string | null; text: string | null; score: number | null };
}) {
  const router = useRouter();
  const [s, setS] = useState({ status: initialStatus, stage: initialStage, error: initialError, stale: initialStale });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/questions/${id}`, { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          if (!alive) return;
          setS({ status: d.status, stage: d.stage, error: d.error, stale: d.stale });
          if (d.status === "completed") return router.refresh();
          if (d.status === "processing" || d.status === "queued") timer.current = setTimeout(tick, 2500);
        }
      } catch {
        timer.current = setTimeout(tick, 5000);
      }
    };
    if (s.status === "processing" || s.status === "queued") timer.current = setTimeout(tick, 1500);
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, s.status]);

  async function retry() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/questions/${id}/retry`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(d.error ?? "Retry failed");
    setS({ status: "queued", stage: s.stage, error: null, stale: false });
  }

  if (s.status === "duplicate_pending") return <DuplicateCard id={id} existingId={duplicate.id} existingText={duplicate.text} score={duplicate.score} />;
  return (
    <div className="card space-y-3" aria-live="polite">
      <h2 className="font-semibold">{s.status === "failed" ? "Analysis stopped" : "Analysing this question…"}</h2>
      <Stepper stage={s.stage} status={s.status} />
      {s.status === "failed" && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">
          {s.error ?? "Something went wrong."}
        </p>
      )}
      {(s.status === "failed" || s.stale) && (
        <button className="btn btn-primary" disabled={busy} onClick={retry}>
          {busy ? "Retrying…" : s.status === "failed" ? "Retry from the failed step" : "Looks stuck — resume"}
        </button>
      )}
      {s.status !== "failed" && !s.stale && <p className="text-sm text-muted">This takes about a minute. You can leave this page — progress is saved.</p>}
      {err && <p className="text-sm text-bad">{err}</p>}
    </div>
  );
}

/* --------------------------- classification editor ------------------------- */
interface EditorInitial {
  sel: Selection;
  conceptIds: number[];
  questionTypeId: number | null;
  difficulty: string | null;
}

export function ClassificationEditor({ questionId, tax, initial, suggestions, aiPath, needsReview, reasons }: { questionId: string; tax: ClientTaxonomy; initial: EditorInitial; suggestions: Record<string, string[]>; aiPath: string; needsReview: boolean; reasons: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(needsReview);
  const [sel, setSel] = useState<Selection>(initial.sel);
  const [concepts, setConcepts] = useState<number[]>(initial.conceptIds);
  const [typeId, setTypeId] = useState<number | null>(initial.questionTypeId);
  const [difficulty, setDifficulty] = useState<string | null>(initial.difficulty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const chapterConcepts = (tax.concept ?? []).filter((c) => c.a.chapter === sel.chapter);
  const topicName = (id?: number) => tax.topic?.find((t) => t.id === id)?.name;
  const groups = new Map<string, typeof chapterConcepts>();
  for (const c of chapterConcepts) {
    const k = topicName(c.a.topic) ?? "General (chapter level)";
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const body = {
      classId: sel.class ?? null,
      examId: sel.exam ?? null,
      subjectId: sel.subject ?? null,
      unitId: sel.unit ?? null,
      chapterId: sel.chapter ?? null,
      subchapterId: sel.subchapter ?? null,
      topicId: sel.topic ?? null,
      subtopicId: sel.subtopic ?? null,
      conceptIds: concepts.filter((c) => chapterConcepts.some((x) => x.id === c)),
      questionTypeId: typeId,
      difficulty,
    };
    const res = await fetch(`/api/questions/${questionId}/classification`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Could not save classification");
    setSaved(true);
    router.refresh();
  }

  const levels = HIERARCHY.filter((l) => l !== "concept") as HierarchyLevel[];
  return (
    <div className="rounded-xl border border-line">
      <button className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          {open ? "▾" : "▸"} {needsReview ? "Review & correct classification" : "Edit classification"}
        </span>
        {needsReview && <span className="badge border-warn/30 bg-warn/10 text-warn">Needs review</span>}
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4">
          {reasons.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-warn">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {Object.keys(suggestions).length > 0 && (
            <div className="rounded-lg bg-surface2 p-3 text-sm">
              <p className="font-medium">AI suggested categories that aren’t in the taxonomy yet</p>
              <ul className="mt-1 text-muted">
                {Object.entries(suggestions).map(([k, v]) => (
                  <li key={k}>
                    <span className="capitalize">{k}</span>: {v.join(", ")}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted">An admin can add them under Taxonomy; choose the closest existing option meanwhile.</p>
            </div>
          )}
          <HierarchyFields tax={tax} value={sel} onChange={setSel} levels={levels} emptyLabel={(l) => `Unknown / needs review`} />
          {sel.chapter ? (
            <div>
              <p className="label">Concepts (first ticked = primary)</p>
              {chapterConcepts.length === 0 ? (
                <p className="text-sm text-muted">This chapter has no concepts defined yet.</p>
              ) : (
                <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-line p-3">
                  {[...groups.entries()].map(([g, list]) => (
                    <div key={g}>
                      <p className="mb-1 text-xs font-semibold text-muted">{g}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {list.map((c) => {
                          const on = concepts.includes(c.id);
                          return (
                            <label key={c.id} className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${on ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-surface2"}`}>
                              <input type="checkbox" className="sr-only" checked={on} onChange={() => setConcepts((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))} />
                              {c.name}
                              {on && concepts[0] === c.id ? " ★" : ""}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Choose a chapter to pick concepts.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ce-type">
                Question type
              </label>
              <select id="ce-type" className="input" value={typeId ?? ""} onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Unknown / needs review</option>
                {(tax.question_type ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ce-diff">
                Difficulty
              </label>
              <select id="ce-diff" className="input" value={difficulty ?? ""} onChange={(e) => setDifficulty(e.target.value || null)}>
                <option value="">Unknown</option>
                {DIFFICULTIES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          {aiPath && <p className="text-xs text-muted">Original AI classification (kept in history): {aiPath}</p>}
          {error && (
            <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-2.5 text-sm text-bad">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : needsReview ? "Confirm / save classification" : "Save classification"}
            </button>
            {saved && <span className="text-sm text-ok">Saved ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ similar questions -------------------------- */
interface Gen {
  id: string;
  text: string;
  variation: string;
  expectedAnswer: string;
  solutionOutline: string;
  savedQuestionId: string | null;
}

export function SimilarGenerator({ questionId, initial }: { questionId: string; initial: Gen[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Gen[]>(initial);
  const [mode, setMode] = useState("mix");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/questions/${questionId}/generate-similar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, count: 2 }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Generation failed");
    setItems((p) => [...(d.generated as Gen[]), ...p]);
  }
  async function save(id: string) {
    setSaving(id);
    setError(null);
    const res = await fetch(`/api/generated/${id}/save`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setSaving(null);
    if (!res.ok) return setError(d.error ?? "Could not save");
    setItems((p) => p.map((g) => (g.id === id ? { ...g, savedQuestionId: d.id } : g)));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="gen-mode">
            Variation
          </label>
          <select id="gen-mode" className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="mix">Mix of variations</option>
            <option value="values">Same concept, different values</option>
            <option value="wording">Different wording / scenario</option>
            <option value="harder">Harder</option>
            <option value="easier">Easier</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={busy}>
          {busy ? "Generating…" : "Generate similar question"}
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-2.5 text-sm text-bad">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {items.map((g) => (
          <li key={g.id} className="rounded-lg border border-line bg-surface2/40 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <span className="badge text-brand">AI-generated</span>
              <span className="badge">{g.variation}</span>
            </div>
            <div className="text-[15px] leading-relaxed">
              <Rich text={g.text} />
            </div>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-muted">Expected answer &amp; outline (AI-generated, unverified)</summary>
              <div className="mt-2 space-y-1">
                <p>
                  <b>Answer:</b> <Rich text={g.expectedAnswer} />
                </p>
                <p className="text-muted">
                  <Rich text={g.solutionOutline} />
                </p>
              </div>
            </details>
            <div className="mt-3">
              {g.savedQuestionId ? (
                <Link href={`/questions/${g.savedQuestionId}`} className="btn">
                  Open in my bank →
                </Link>
              ) : (
                <button className="btn" onClick={() => save(g.id)} disabled={saving === g.id}>
                  {saving === g.id ? "Adding…" : "Add to my bank & analyse"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------- actions -------------------------------- */
export function QuestionActions({ id, notes }: { id: string; notes: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(notes ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function call(kind: string, url: string, init: RequestInit, after: () => void) {
    setBusy(kind);
    setMsg(null);
    const res = await fetch(url, init);
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMsg(d.error ?? "Action failed");
    after();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="notes">
          Personal notes
        </label>
        <textarea id="notes" className="input min-h-20" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
        <button className="btn mt-2" disabled={busy === "notes"} onClick={() => call("notes", `/api/questions/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes: text }) }, () => setMsg("Notes saved"))}>
          Save notes
        </button>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button
          className="btn"
          disabled={busy === "re"}
          onClick={() => {
            if (confirm("Re-run the whole AI analysis? Solution, formulas, tricks and mistakes will be regenerated (your manual classification is kept).")) {
              call("re", `/api/questions/${id}/retry`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reset: true }) }, () => router.refresh());
            }
          }}
        >
          Re-run analysis
        </button>
        <button
          className="btn btn-danger"
          disabled={busy === "del"}
          onClick={() => {
            if (confirm("Delete this question and its revision history? The original upload is kept.")) call("del", `/api/questions/${id}`, { method: "DELETE" }, () => router.push("/questions"));
          }}
        >
          Delete question
        </button>
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}
