import { Processing } from "../components/Processing";
import { QuestionCard } from "../components/QuestionCard";
import { Rich, Tex } from "../components/Rich";
import { Badge, Bar, Empty, PageHeader, Section, Stat, accTone, toast } from "../components/ui";
import { completed, dueQuestions, isMastered, performanceBy, streak, weakQuestions } from "../lib/queries";
import { Link } from "../lib/router";
import { clearSamples, loadSamples } from "../lib/sample";
import { useDB, useTax } from "../lib/store";
import { truncate } from "../lib/text";

export default function DashboardPage() {
  const db = useDB();
  const tax = useTax();
  const done = completed(db);
  const due = dueQuestions(db);
  const weak = weakQuestions(db);
  const mastered = done.filter((q) => isMastered(db.revision[q.id]));
  const st = streak(db.reviews);
  const hasSamples = db.questions.some((q) => q.isSample);

  const subjects = tax.byLevel.subject.filter((s) => s.active);
  const subjectPerf = performanceBy(db, (q) => (q.ids.subjectId ? [{ key: String(q.ids.subjectId), label: tax.get("subject", q.ids.subjectId)?.name ?? "?" }] : []));
  const conceptPerf = performanceBy(db, (q) => q.ids.conceptIds.map((c) => ({ key: String(c), label: tax.get("concept", c)?.name ?? "?" }))).filter((c) => c.weak).slice(0, 5);
  const weakFormulaIds = new Set(weak.flatMap((q) => q.formulaIds));
  const formulas = db.formulas.filter((f) => weakFormulaIds.has(f.id)).slice(0, 4);
  const recentMistakes = done.filter((q) => q.mistakes.length).slice(0, 4).map((q) => ({ q, m: q.mistakes[0] }));
  const busy = db.questions.some((q) => q.processingStatus === "processing" || q.processingStatus === "failed" || q.processingStatus === "duplicate_pending") || db.imports.some((i) => i.status !== "completed");

  if (db.questions.length === 0 && db.imports.length === 0) {
    return (
      <>
        <PageHeader title="Welcome to StudyForge" subtitle="Your personal AI question bank, solution generator, formula vault and adaptive revision system." />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card space-y-3">
            <h2 className="font-semibold">1 · Connect AI (optional but recommended)</h2>
            <p className="text-sm text-muted">Add an OpenAI-compatible API key in Settings so new questions are automatically classified, solved, verified and scheduled.</p>
            <Link to="/settings" className="btn">Open Settings</Link>
          </div>
          <div className="card space-y-3">
            <h2 className="font-semibold">2 · Add your first question</h2>
            <p className="text-sm text-muted">Paste text, drop a screenshot, take a photo or upload a PDF.</p>
            <Link to="/add" className="btn btn-primary">Add a question</Link>
          </div>
          <div className="card space-y-3 md:col-span-2">
            <h2 className="font-semibold">Just exploring?</h2>
            <p className="text-sm text-muted">Load 5 pre-analysed sample questions (Physics, Chemistry, Maths) with solutions, formulas, shortcuts, mistakes and a revision history so every screen has real data. You can remove them any time.</p>
            <button className="btn" onClick={() => toast(`Loaded ${loadSamples()} sample questions`, "good")}>Load sample data</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle="What to revise, what to fix, and how you're progressing." actions={<><Link to="/add" className="btn">+ Add question</Link><Link to="/revision/session" className={`btn btn-primary ${due.length ? "" : "pointer-events-none opacity-50"}`}>Start revision ({due.length})</Link></>} />
      {busy && <Processing showRecent={false} />}
      <div className={busy ? "mt-6 space-y-5" : "space-y-5"}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Due today" value={due.length} tone={due.length ? "warn" : "good"} hint={due.length ? "Start a session" : "All caught up"} />
          <Stat label="Revision streak" value={`${st} d`} />
          <Stat label="Weak questions" value={weak.length} tone={weak.length ? "bad" : "neutral"} />
          <Stat label="Mastered" value={mastered.length} tone="good" />
          <Stat label="Total questions" value={done.length} />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Section title="Today's revision" actions={<Link to="/revision" className="text-xs text-brand underline">Open revision</Link>}>
              {due.length === 0 ? <p className="text-sm text-muted">Nothing due. New questions become due the day after you add them.</p> : (
                <div className="space-y-1.5 text-sm">
                  {subjects.map((s) => ({ s, n: due.filter((q) => q.ids.subjectId === s.id).length })).filter((x) => x.n).map(({ s, n }) => (
                    <div key={s.id} className="flex items-center justify-between"><span className="font-medium">{s.name}</span><span className="tabular-nums">{n}</span></div>
                  ))}
                  <div className="flex items-center justify-between border-t border-line pt-2 font-semibold"><span>Total due</span><span>{due.length}</span></div>
                </div>
              )}
            </Section>
            <Section title="Recently added" actions={<Link to="/questions" className="text-xs text-brand underline">All questions</Link>}>
              {db.questions.filter((q) => q.processingStatus === "completed").length === 0 ? <p className="text-sm text-muted">No analysed questions yet.</p> : (
                <div className="grid gap-2 md:grid-cols-2">{done.slice(0, 4).map((q) => <QuestionCard key={q.id} q={q} />)}</div>
              )}
            </Section>
            <Section title="Recent mistakes to avoid">
              {recentMistakes.length === 0 ? <p className="text-sm text-muted">Mistakes appear as you add questions.</p> : (
                <ul className="space-y-2">
                  {recentMistakes.map(({ q, m }) => (
                    <li key={m.id} className="rounded-lg border border-line p-3 text-sm">
                      <div className="flex items-center gap-2"><Badge tone="bad" className="capitalize">{m.category}</Badge><Link to={`/questions/${q.id}`} className="font-medium hover:text-brand">{m.title}</Link></div>
                      <p className="mt-1 text-xs text-muted"><Rich text={truncate(m.preventionTip, 160)} /></p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <div className="space-y-5">
            <Section title="Progress by subject">
              {subjectPerf.length === 0 ? <p className="text-sm text-muted">Revise a question to see accuracy per subject.</p> : (
                <div className="space-y-3">
                  {subjectPerf.map((p) => (
                    <div key={p.key}><div className="mb-1 flex justify-between text-sm"><span className="font-medium">{p.label}</span><span className="text-xs text-muted">{p.accuracy === null ? "no attempts" : `${Math.round(p.accuracy * 100)}% · ${p.attempts} attempts`}</span></div><Bar value={p.accuracy ?? 0} tone={accTone(p.accuracy)} /></div>
                  ))}
                </div>
              )}
            </Section>
            <Section title="Weak concepts">
              {conceptPerf.length === 0 ? <p className="text-sm text-muted">No weak concepts detected yet.</p> : (
                <ul className="space-y-2 text-sm">{conceptPerf.map((c) => <li key={c.key} className="flex items-center justify-between gap-2"><Link to="/questions" params={{ conceptId: c.key }} className="font-medium hover:text-brand">{c.label}</Link><Badge tone="bad">{Math.round((c.accuracy ?? 0) * 100)}%</Badge></li>)}</ul>
              )}
            </Section>
            <Section title="Formula revision" actions={<Link to="/formulas" className="text-xs text-brand underline">Vault</Link>}>
              {formulas.length === 0 ? <p className="text-sm text-muted">Formulas from your weak questions show up here.</p> : (
                <ul className="space-y-3">{formulas.map((f) => <li key={f.id} className="text-sm"><div className="font-medium">{f.name}</div><div className="overflow-x-auto"><Tex tex={f.latex} fallback={f.expression} /></div></li>)}</ul>
              )}
            </Section>
            {hasSamples && <button className="btn btn-sm w-full" onClick={() => { if (confirm("Remove the sample questions?")) clearSamples(); }}>Remove sample data</button>}
          </div>
        </div>
        {done.length === 0 && <Empty title="No analysed questions yet" hint="Once a question finishes analysing it appears here." />}
      </div>
    </>
  );
}
