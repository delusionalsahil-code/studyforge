"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Rich, Tex } from "@/components/Rich";
import type { Rating } from "@/lib/srs";

export interface SessionQuestion {
  id: string;
  text: string;
  imageUploadId: string | null;
  path: string;
  difficulty: string | null;
  preview: Record<Rating, string>;
}

interface Reveal {
  solution: Record<string, unknown>;
  finalAnswer: string;
  verified: boolean;
  formulas: { id: number; name: string; latex: string; expression: string }[];
  trick: { name: string; explanation: string; shortcut: string } | null;
  mistakes: { id: number; title: string; description: string; tip: string }[];
  hasTrick: boolean;
}

const RATING_UI: { key: Rating; label: string; tone: string; hint: string }[] = [
  { key: "again", label: "Again", tone: "border-bad/50 text-bad hover:bg-bad/10", hint: "Forgot" },
  { key: "hard", label: "Hard", tone: "border-warn/50 text-warn hover:bg-warn/10", hint: "Struggled" },
  { key: "good", label: "Good", tone: "border-brand/50 text-brand hover:bg-brand-soft", hint: "Solved" },
  { key: "easy", label: "Easy", tone: "border-ok/50 text-ok hover:bg-ok/10", hint: "Effortless" },
  { key: "mastered", label: "Mastered", tone: "border-ok bg-ok/10 text-ok hover:bg-ok/20", hint: "Never again soon" },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function RevisionSession({ questions }: { questions: SessionQuestion[] }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"think" | "revealed" | "done">("think");
  const [hints, setHints] = useState<string[]>([]);
  const [hintBusy, setHintBusy] = useState(false);
  const [solved, setSolved] = useState<boolean | null>(null);
  const [suggested, setSuggested] = useState<Rating | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [mistakes, setMistakes] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ rating: Rating; next: string } | null>(null);
  const [log, setLog] = useState<{ rating: Rating; sec: number }[]>([]);
  const startRef = useRef(Date.now());
  const frozen = useRef<number | null>(null);

  const q = questions[idx];

  useEffect(() => {
    startRef.current = Date.now();
    frozen.current = null;
    setElapsed(0);
    const t = setInterval(() => {
      if (frozen.current === null) setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [idx]);

  const nextHint = useCallback(async () => {
    if (!q || hints.length >= 3 || hintBusy) return;
    setHintBusy(true);
    setError(null);
    const res = await fetch(`/api/questions/${q.id}/reveal?part=hint${hints.length + 1}`);
    const d = await res.json().catch(() => ({}));
    setHintBusy(false);
    if (!res.ok || !d.hint) return setError(d.error ?? "No hint available.");
    setHints((h) => [...h, d.hint]);
  }, [q, hints.length, hintBusy]);

  const showSolution = useCallback(
    async (wasSolved: boolean, suggest: Rating) => {
      if (!q || phase !== "think") return;
      frozen.current = Math.round((Date.now() - startRef.current) / 1000);
      setElapsed(frozen.current);
      setError(null);
      const res = await fetch(`/api/questions/${q.id}/reveal?part=solution`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        frozen.current = null;
        return setError(d.error ?? "Could not load the solution.");
      }
      setReveal(d as Reveal);
      setSolved(wasSolved);
      setSuggested(wasSolved ? (hints.length >= 2 ? "hard" : "good") : suggest);
      setPhase("revealed");
    },
    [q, phase, hints.length],
  );

  const submit = useCallback(
    async (rating: Rating) => {
      if (!q || submitting) return;
      setSubmitting(true);
      setError(null);
      const sec = frozen.current ?? Math.round((Date.now() - startRef.current) / 1000);
      const res = await fetch("/api/revision/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: q.id, rating, solved: solved ?? rating !== "again", hintsUsed: hints.length, timeSpentSec: sec, mistakeIds: rating === "again" || rating === "hard" ? mistakes : [] }),
      });
      const d = await res.json().catch(() => ({}));
      setSubmitting(false);
      if (!res.ok) return setError(d.error ?? "Could not save your rating. Try again.");
      const days = Number(d.intervalDays);
      setLog((l) => [...l, { rating, sec }]);
      setResult({ rating, next: days === 0 ? "in 10 minutes" : d.status === "mastered" ? `in ${days} days (mastered)` : `in ${days} day${days === 1 ? "" : "s"}` });
    },
    [q, submitting, solved, hints.length, mistakes],
  );

  const advance = useCallback(() => {
    setResult(null);
    setReveal(null);
    setHints([]);
    setSolved(null);
    setSuggested(null);
    setMistakes([]);
    setPhase("think");
    if (idx + 1 >= questions.length) setPhase("done");
    else setIdx((i) => i + 1);
  }, [idx, questions.length]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select") || e.metaKey || e.ctrlKey) return;
      if (phase === "think") {
        if (result) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            advance();
          }
        } else if (e.key === " ") {
          e.preventDefault();
          showSolution(false, "hard");
        } else if (e.key === "h") nextHint();
      } else if (phase === "revealed") {
        if (result) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            advance();
          }
        } else if (/^[1-5]$/.test(e.key)) submit(RATING_UI[Number(e.key) - 1].key);
      } else if (phase === "done") return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, result, showSolution, nextHint, submit, advance]);

  if (phase === "done") {
    const total = log.reduce((a, l) => a + l.sec, 0);
    const count = (r: Rating) => log.filter((l) => l.rating === r).length;
    return (
      <div className="card mx-auto max-w-xl space-y-4 text-center">
        <p className="text-4xl">🎯</p>
        <h2 className="text-2xl font-semibold">Session complete</h2>
        <p className="text-muted">
          {log.length} question{log.length === 1 ? "" : "s"} · {fmt(total)} total
        </p>
        <div className="grid grid-cols-5 gap-2 text-sm">
          {RATING_UI.map((r) => (
            <div key={r.key} className="rounded-lg border border-line p-2">
              <p className="text-xl font-semibold tabular-nums">{count(r.key)}</p>
              <p className="text-xs text-muted">{r.label}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-2">
          <Link href="/revision" className="btn btn-primary">
            Back to revision
          </Link>
          <Link href="/analytics" className="btn">
            See analytics
          </Link>
        </div>
      </div>
    );
  }

  const sol = reveal?.solution ?? {};
  const steps = Array.isArray(sol.steps) ? (sol.steps as string[]) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Question {idx + 1} of {questions.length}
        </span>
        <span className="tabular-nums" aria-live="off">
          ⏱ {fmt(elapsed)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
        <div className="h-full bg-brand transition-all" style={{ width: `${(idx / questions.length) * 100}%` }} />
      </div>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{q.path || "Unclassified"}</span>
          {q.difficulty && <span className="badge">{q.difficulty}</span>}
        </div>
        <div className="text-lg leading-relaxed">
          <Rich text={q.text} />
        </div>
        {q.imageUploadId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/uploads/${q.imageUploadId}`} alt="Original question" className="mt-4 max-h-80 rounded-lg border border-line" />
        )}
      </section>

      {hints.length > 0 && (
        <section className="card space-y-2 border-brand/30 bg-brand-soft/50">
          {hints.map((h, i) => (
            <p key={i} className="text-sm">
              <b className="text-brand">Hint {i + 1}{i === 0 ? " · concept" : i === 1 ? " · formula / idea" : " · next step"}:</b> <Rich text={h} />
            </p>
          ))}
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </p>
      )}

      {phase === "think" && result && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p>
            Saved as <b className="capitalize">{result.rating}</b>. Next review <b>{result.next}</b>.
          </p>
          <button className="btn btn-primary" onClick={advance} autoFocus>
            {idx + 1 >= questions.length ? "Finish" : "Next question"} ↵
          </button>
        </div>
      )}

      {phase === "think" && !result && (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted">Think it through on paper first — then check yourself.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn btn-primary !min-h-11" onClick={() => showSolution(true, "good")}>
              ✓ I solved it
            </button>
            <button className="btn !min-h-11" onClick={nextHint} disabled={hints.length >= 3 || hintBusy}>
              {hintBusy ? "Loading…" : hints.length >= 3 ? "No more hints" : `💡 Need hint (${hints.length}/3) · h`}
            </button>
            <button className="btn !min-h-11" onClick={() => showSolution(false, "hard")}>
              Show solution · Space
            </button>
            <button className="btn btn-danger !min-h-11" onClick={() => showSolution(false, "again")}>
              I forgot
            </button>
          </div>
          <button className="btn btn-ghost w-full text-ok" onClick={() => {
            frozen.current = Math.round((Date.now() - startRef.current) / 1000);
            setSolved(true);
            submit("mastered");
          }} disabled={submitting}>
            Mark as mastered
          </button>
        </div>
      )}

      {phase === "revealed" && reveal && (
        <div className="space-y-4">
          <section className="card space-y-3">
            <h2 className="section-title !mb-0">Solution</h2>
            {Array.isArray(sol.given) && (sol.given as string[]).length > 0 && (
              <p className="text-sm">
                <b>Given:</b> <Rich text={(sol.given as string[]).join("; ")} />
              </p>
            )}
            {typeof sol.approach === "string" && (
              <p className="text-sm">
                <b>Approach:</b> <Rich text={sol.approach} />
              </p>
            )}
            <ol className="space-y-2 text-sm">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-semibold text-brand">{i + 1}.</span>
                  <Rich text={s} />
                </li>
              ))}
            </ol>
            <div className="rounded-lg border border-ok/30 bg-ok/10 p-3">
              <span className="text-xs font-semibold uppercase text-ok">Final answer</span>
              <div className="font-medium">
                <Rich text={reveal.finalAnswer} />
              </div>
            </div>
            {!reveal.verified && <p className="text-xs text-warn">⚠ This answer was not independently verified — double-check it.</p>}
            {reveal.formulas.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {reveal.formulas.map((f) => (
                  <div key={f.id} className="rounded-lg bg-surface2 p-2 text-center text-sm">
                    <p className="text-xs text-muted">{f.name}</p>
                    <Tex latex={f.latex} fallback={f.expression} />
                  </div>
                ))}
              </div>
            )}
            {reveal.trick && (
              <p className="rounded-lg border border-ok/30 bg-ok/5 p-3 text-sm">
                <b className="text-ok">⚡ {reveal.trick.name}:</b> <Rich text={reveal.trick.explanation} />
              </p>
            )}
          </section>

          {!result && (
            <>
              {reveal.mistakes.length > 0 && (
                <details className="card text-sm" open={suggested === "again" || suggested === "hard"}>
                  <summary className="cursor-pointer font-medium">Did you fall into any of these? (optional)</summary>
                  <ul className="mt-2 space-y-1.5">
                    {reveal.mistakes.map((m) => (
                      <li key={m.id}>
                        <label className="flex items-start gap-2">
                          <input type="checkbox" className="mt-1" checked={mistakes.includes(m.id)} onChange={(e) => setMistakes((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))} />
                          <span>
                            <b><Rich text={m.title} /></b> <span className="text-muted">— <Rich text={m.tip} /></span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div>
                <p className="mb-2 text-center text-sm text-muted">How did it go? <span className="hidden sm:inline">(keys 1–5)</span></p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {RATING_UI.map((r, i) => (
                    <button key={r.key} className={`btn !h-auto flex-col !py-2.5 ${r.tone} ${suggested === r.key ? "ring-2 ring-current" : ""}`} disabled={submitting} onClick={() => submit(r.key)}>
                      <span className="font-semibold">
                        {i + 1}. {r.label}
                      </span>
                      <span className="text-[11px] font-normal opacity-80">≈ {q.preview[r.key]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {result && (
            <div className="card flex flex-wrap items-center justify-between gap-3">
              <p>
                Saved as <b className="capitalize">{result.rating}</b>. Next review <b>{result.next}</b>.
              </p>
              <button className="btn btn-primary" onClick={advance} autoFocus>
                {idx + 1 >= questions.length ? "Finish" : "Next question"} ↵
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
