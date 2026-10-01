import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Rich } from "../components/Rich";
import { Badge, Empty, PageHeader } from "../components/ui";
import { submitReview } from "../lib/actions";
import { dueQuestions, weakQuestions } from "../lib/queries";
import { Link, useRoute } from "../lib/router";
import { previewIntervals, type Rating } from "../lib/srs";
import { getDB, getUpload, useDB, useTax } from "../lib/store";
import { pathText } from "../lib/taxonomy";
import { cn } from "../utils/cn";

const RATING_UI: { r: Rating; label: string; cls: string; key: string }[] = [
  { r: "again", label: "Again", cls: "border-bad/40 text-bad hover:bg-bad-soft", key: "1" },
  { r: "hard", label: "Hard", cls: "border-warn/40 text-warn hover:bg-warn-soft", key: "2" },
  { r: "good", label: "Good", cls: "border-brand/40 text-brand hover:bg-brand-soft", key: "3" },
  { r: "easy", label: "Easy", cls: "border-good/40 text-good hover:bg-good-soft", key: "4" },
  { r: "mastered", label: "Mastered", cls: "border-good/60 bg-good-soft text-good", key: "5" },
];

export default function SessionPage() {
  const route = useRoute();
  // freeze the queue at start so ratings don't reshuffle the session
  const [queue, setQueue] = useState<string[] | null>(null);
  const db = useDB();
  useEffect(() => {
    const d = getDB();
    const ids = (route.params.ids ?? "").split(",").filter((i) => d.questions.some((q) => q.id === i && q.processingStatus === "completed" && d.revision[i]));
    const subject = Number(route.params.subject) || null;
    const list = ids.length ? ids : (route.params.mode === "weak" ? weakQuestions(d, subject) : dueQuestions(d, subject)).map((q) => q.id);
    setQueue(list.slice(0, 40));
  }, [route.params.ids, route.params.mode, route.params.subject]);

  if (!queue) return null;
  if (queue.length === 0) return (<><PageHeader title="Revision session" /><Empty title="Nothing to revise right now" hint="You're up to date. New questions become due the day after you add them." action={{ to: "/revision", label: "Back to revision" }} /></>);
  return <Session initial={queue} key={queue.join(",")} sessionKey={route.params.mode ?? ""} dbVersion={db.reviews.length} />;
}

function Session({ initial }: { initial: string[]; sessionKey: string; dbVersion: number }) {
  const db = getDB();
  const tax = useTax();
  const [queue, setQueue] = useState(initial);
  const [pos, setPos] = useState(0);
  const [hints, setHints] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [forced, setForced] = useState<Rating | null>(null);
  const [results, setResults] = useState<{ id: string; rating: Rating }[]>([]);
  const started = useRef(Date.now());
  const requeued = useRef(new Set<string>());

  const id = queue[pos];
  const q = db.questions.find((x) => x.id === id);
  const rs = id ? db.revision[id] : undefined;
  const upload = getUpload(q?.imageUploadId);

  useEffect(() => { started.current = Date.now(); setHints(0); setRevealed(false); setForced(null); }, [id, pos]);

  const rate = useCallback((rating: Rating) => {
    if (!q) return;
    const sec = Math.round((Date.now() - started.current) / 1000);
    submitReview(q.id, rating, hints, sec);
    setResults((r) => [...r, { id: q.id, rating }]);
    // "Again" comes back later in this same session (once)
    if (rating === "again" && !requeued.current.has(q.id)) { requeued.current.add(q.id); setQueue((qq) => [...qq, q.id]); }
    setPos((p) => p + 1);
  }, [q, hints]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      if (!q) return;
      const k = e.key.toLowerCase();
      if (revealed) { const r = RATING_UI.find((x) => x.key === k); if (r) rate(r.r); return; }
      if (k === "h") setHints((h) => Math.min(3, h + 1));
      if (k === " " || k === "s") { e.preventDefault(); setRevealed(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, q, rate]);

  const preview = useMemo(() => (rs ? previewIntervals(rs, hints, 0) : null), [rs, hints]);

  if (pos >= queue.length || !q || !rs) {
    const counts = results.reduce<Record<string, number>>((a, r) => ((a[r.rating] = (a[r.rating] ?? 0) + 1), a), {});
    return (
      <>
        <PageHeader title="Session complete" subtitle={`${results.length} review${results.length === 1 ? "" : "s"} saved. Your schedule has been updated.`} />
        <div className="card space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {RATING_UI.map((r) => <div key={r.r} className="rounded-lg bg-surface-2 p-3 text-center"><div className="text-2xl font-semibold tabular-nums">{counts[r.r] ?? 0}</div><div className="text-xs text-muted">{r.label}</div></div>)}
          </div>
          <div className="flex flex-wrap gap-2"><Link to="/revision" className="btn btn-primary">Back to revision</Link><Link to="/analytics" className="btn">See analytics</Link></div>
        </div>
      </>
    );
  }

  const sol = q.solution!;
  const hintList = sol.hints;
  const hintLabel = ["Concept", "Formula / key idea", "Next step"];

  return (
    <>
      <PageHeader title="Revision session" subtitle={`Question ${Math.min(pos + 1, queue.length)} of ${queue.length}`} actions={<Link to="/revision" className="btn btn-sm">End session</Link>} />
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-brand transition-all" style={{ width: `${(pos / queue.length) * 100}%` }} /></div>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted"><Badge>{rs.status}</Badge><span className="truncate">{revealed ? pathText(tax, q.ids) : "Topic hidden until you answer"}</span></div>
          <div className="text-base leading-relaxed"><Rich text={q.originalText} /></div>
          {upload && <img src={upload.dataUrl} alt="Question" className="mt-3 max-h-80 rounded-lg border border-line object-contain" />}
        </div>

        {!revealed && (
          <>
            <div className="card text-sm text-muted">🧠 <b className="text-fg">Think first.</b> Try it on paper. Use a hint only if you're stuck — hints are progressive and never give the answer.</div>
            {hints > 0 && (
              <div className="space-y-2">
                {hintList.slice(0, hints).map((h, i) => (
                  <div key={i} className="rounded-lg border border-brand/30 bg-brand-soft p-3 text-sm"><div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand">Hint {i + 1} · {hintLabel[i]}</div><Rich text={h} /></div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => setRevealed(true)}>I solved it</button>
              <button className="btn" disabled={hints >= 3} onClick={() => setHints(hints + 1)}>{hints >= 3 ? "No more hints" : `Need hint (${hints}/3)`}</button>
              <button className="btn" onClick={() => setRevealed(true)}>Show solution</button>
              <button className="btn" onClick={() => { setForced("again"); setRevealed(true); }}>I forgot</button>
              <button className="btn" onClick={() => rate("mastered")}>Mark mastered</button>
            </div>
            <p className="text-xs text-muted">Shortcuts: <kbd className="rounded border border-line px-1">H</kbd> hint · <kbd className="rounded border border-line px-1">Space</kbd> solution</p>
          </>
        )}

        {revealed && (
          <>
            <div className="card space-y-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Solution</div>
              {sol.content.given.length > 0 && <div><b>Given:</b> {sol.content.given.map((g, i) => <span key={i}>{i > 0 && "; "}<Rich text={g} /></span>)}</div>}
              <div><b>Approach:</b> <Rich text={sol.content.approach} /></div>
              <ol className="list-decimal space-y-1.5 pl-5">{sol.content.steps.map((s, i) => <li key={i}><Rich text={s} /></li>)}</ol>
              <div className="rounded-lg border border-brand/30 bg-brand-soft p-3 font-semibold"><Rich text={sol.finalAnswer} /></div>
              {q.tricks[0] && <div className="rounded-lg border border-good/30 bg-good-soft/50 p-3"><b>Shortcut — {q.tricks[0].name}:</b> <Rich text={q.tricks[0].shortcutMethod} /></div>}
              <Link to={`/questions/${q.id}`} className="text-xs text-brand underline">Open full question page</Link>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">How did it go? <span className="font-normal text-muted">{hints > 0 ? `(${hints} hint${hints > 1 ? "s" : ""} used)` : ""}</span></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {RATING_UI.map((r) => (
                  <button key={r.r} onClick={() => rate(r.r)} className={cn("rounded-lg border bg-surface px-2 py-2.5 text-sm font-semibold transition-colors", r.cls, forced === r.r && "ring-2 ring-bad/50")}>
                    {r.label}
                    <span className="block text-[11px] font-normal text-muted">{preview?.[r.r]} · <kbd>{r.key}</kbd></span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
