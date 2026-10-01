import { useMemo, useState } from "react";
import { HierarchySelects } from "../components/Hierarchy";
import { Rich, Tex } from "../components/Rich";
import { Stepper } from "../components/Stepper";
import { Badge, Bar, DifficultyBadge, Empty, ErrorBox, Section, Spinner, Tabs, accTone, toast } from "../components/ui";
import { UserError, applyCorrection, deleteQuestion, discardGenerated, generateSimilarFor, markReviewed, retryQuestion, saveGenerated } from "../lib/actions";
import { aiConfigured } from "../lib/ai/client";
import type { SimilarMode } from "../lib/ai/stages";
import { EMPTY_IDS, type ClassIds } from "../lib/classification";
import { isDue, isMastered, isWeak } from "../lib/queries";
import { Link, go } from "../lib/router";
import { getUpload, useDB, useTax, type Question } from "../lib/store";
import { breadcrumbFor, toClient } from "../lib/taxonomy";
import { DIFFICULTIES, LEVEL_LABEL, type Difficulty, type HierarchyLevel, type Selection } from "../lib/taxonomy-types";

const CONF_LEVELS: [string, string][] = [["class", "Class"], ["exam", "Exam"], ["subject", "Subject"], ["unit", "Unit"], ["chapter", "Chapter"], ["subchapter", "Subchapter"], ["topic", "Topic"], ["subtopic", "Subtopic"], ["concept", "Concept"], ["question_type", "Question type"]];

export default function QuestionPage({ id }: { id: string }) {
  const db = useDB();
  const q = db.questions.find((x) => x.id === id);
  if (!q) return <Empty title="Question not found" hint="It may have been deleted." action={{ to: "/questions", label: "Back to library" }} />;
  return <Detail q={q} key={q.id} />;
}

function Detail({ q }: { q: Question }) {
  const db = useDB();
  const tax = useTax();
  const rs = db.revision[q.id];
  const crumbs = breadcrumbFor(tax, q.ids);
  const upload = getUpload(q.imageUploadId);
  const reviews = db.reviews.filter((r) => r.questionId === q.id).sort((a, b) => +new Date(b.at) - +new Date(a.at));
  const formulas = q.formulaIds.map((f) => db.formulas.find((x) => x.id === f)).filter((f): f is NonNullable<typeof f> => Boolean(f));
  const [editing, setEditing] = useState(false);
  const done = q.processingStatus === "completed";
  const sol = q.solution?.content;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/questions" className="text-sm text-muted hover:text-fg">← Question library</Link>
        <div className="flex gap-2">
          {done && rs && <Link to="/revision/session" params={{ ids: q.id }} className="btn btn-sm btn-primary">Revise now</Link>}
          <button className="btn btn-sm" onClick={() => { if (confirm("Delete this question and its revision history?")) { deleteQuestion(q.id); go("/questions"); } }}>Delete</button>
        </div>
      </div>

      {/* 1. question */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {done && <DifficultyBadge value={q.difficulty} />}
          {q.difficultyConfidence !== null && done && <Badge title="Confidence in the difficulty estimate">~{Math.round(q.difficultyConfidence * 100)}% sure</Badge>}
          {tax.get("question_type", q.ids.questionTypeId) && <Badge>{tax.get("question_type", q.ids.questionTypeId)!.name}</Badge>}
          {q.aiVerified && <Badge tone="good">Answer verified</Badge>}
          {done && !q.aiVerified && <Badge tone="warn">Unverified answer</Badge>}
          {q.needsReview && <Badge tone="warn">Needs review</Badge>}
          {q.isAiGenerated && <Badge tone="brand">AI-generated</Badge>}
          {q.isSample && <Badge>Sample data</Badge>}
          {rs && isMastered(rs) && <Badge tone="good">Mastered</Badge>}
          {rs && isWeak(rs) && <Badge tone="bad">Weak</Badge>}
          {q.tags.map((t) => <Badge key={t} className="!font-medium">#{t}</Badge>)}
        </div>
        <div className="text-[15px] leading-relaxed"><Rich text={q.originalText} /></div>
        {upload && <img src={upload.dataUrl} alt="Original upload" className="mt-4 max-h-96 rounded-lg border border-line object-contain" />}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-line pt-3 text-xs text-muted sm:grid-cols-4">
          <div><dt className="inline">Source: </dt><dd className="inline text-fg">{q.sourceName || q.sourceType}{q.sourcePage ? ` · p.${q.sourcePage}` : ""}</dd></div>
          <div><dt className="inline">Input: </dt><dd className="inline text-fg">{q.sourceType.replace("_", " ")}</dd></div>
          <div><dt className="inline">Added: </dt><dd className="inline text-fg">{new Date(q.createdAt).toLocaleString()}</dd></div>
          <div><dt className="inline">Status: </dt><dd className="inline text-fg">{q.processingStatus}</dd></div>
        </dl>
      </div>

      {!done && (
        <div className="card space-y-3">
          <Stepper stage={q.processingStage} status={q.processingStatus} failed={q.processingStatus === "failed"} />
          {q.processingStatus === "failed" && (
            <>
              <ErrorBox title="Analysis stopped">{q.processingError}</ErrorBox>
              <button className="btn btn-primary btn-sm" onClick={() => retryQuestion(q.id)}>Retry (resumes at the failed stage)</button>
            </>
          )}
          {q.processingStatus !== "failed" && <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Working on it…</div>}
        </div>
      )}

      {/* 2. breadcrumb + classification */}
      {done && (
        <Section title="Classification" hint="Class → Exam → Subject → Unit → Chapter → Subchapter → Topic → Subtopic → Concept" actions={<button className="btn btn-sm" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Correct classification"}</button>}>
          {crumbs.length ? (
            <nav aria-label="Classification breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
              {crumbs.map((c, i) => (
                <span key={c.level} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted">›</span>}
                  <Link to="/questions" params={c.params} title={`${LEVEL_LABEL[c.level]} — show all questions here`} className="rounded-md bg-surface-2 px-2 py-1 font-medium hover:bg-brand-soft hover:text-brand">{c.name}</Link>
                </span>
              ))}
            </nav>
          ) : <p className="text-sm text-muted">Unclassified — use “Correct classification” to place it.</p>}

          {/* levels that could not be determined are shown explicitly, never invented */}
          {(["subchapter", "topic", "subtopic", "concept"] as const).filter((k) => !q.ids[`${k}Id` as keyof ClassIds]).length > 0 && (
            <p className="mt-2 text-xs text-warn">Unknown / needs review: {(["subchapter", "topic", "subtopic", "concept"] as const).filter((k) => !q.ids[`${k}Id` as keyof ClassIds]).join(", ")}</p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 md:grid-cols-3">
            {CONF_LEVELS.filter(([k]) => q.levelConfidence[k] !== undefined).map(([k, label]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-[11px] text-muted"><span>{label}</span><span>{Math.round((q.levelConfidence[k] ?? 0) * 100)}%</span></div>
                <Bar value={q.levelConfidence[k] ?? 0} tone={accTone(q.levelConfidence[k] ?? 0)} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Classified by {q.classificationSource === "user" ? "you (manual correction)" : "AI"}; the original AI classification is kept in history.</p>

          {q.reviewReasons.length > 0 && (
            <div className="mt-3 rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm text-warn">
              <div className="mb-1 font-semibold">Why this needs review</div>
              <ul className="list-disc space-y-0.5 pl-5">{q.reviewReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              {Object.keys(q.suggestions).length > 0 && (
                <div className="mt-2 text-xs">Suggested categories (not in taxonomy): {Object.entries(q.suggestions).map(([k, v]) => `${k}: ${v.join(", ")}`).join(" · ")}. An admin can add them under <Link to="/admin/taxonomy" className="underline">Taxonomy</Link>.</div>
              )}
              <button className="btn btn-sm mt-2" onClick={() => { markReviewed(q.id); toast("Marked as reviewed", "good"); }}>Mark as reviewed</button>
            </div>
          )}
          {editing && <CorrectionEditor q={q} onDone={() => setEditing(false)} />}
          <ClassHistory q={q} />
        </Section>
      )}

      {/* 3. solution */}
      {done && sol && q.solution && <SolutionView q={q} />}

      {/* 4. formulas */}
      {done && (
        <Section title="Key formulas" hint="Linked to your Formula Vault — a formula is stored once and reused across questions.">
          {formulas.length === 0 ? <p className="text-sm text-muted">No standalone formulas were identified for this question.</p> : (
            <div className="grid gap-3 md:grid-cols-2">
              {formulas.map((f) => (
                <div key={f.id} className="rounded-lg border border-line p-3">
                  <Link to="/formulas" params={{ formula: f.id }} className="text-sm font-semibold hover:text-brand">{f.name}</Link>
                  <div className="my-2 overflow-x-auto text-base"><Tex tex={f.latex} fallback={f.expression} display /></div>
                  <ul className="space-y-0.5 text-xs text-muted">
                    {f.variables.map((v) => <li key={v.symbol}><span className="font-mono text-fg">{v.symbol}</span> — {v.meaning}{v.unit ? ` (${v.unit})` : ""}</li>)}
                  </ul>
                  {f.whenToUse && <p className="mt-2 text-xs"><b>Use when:</b> {f.whenToUse}</p>}
                  {f.restrictions && <p className="text-xs text-muted"><b>Conditions:</b> {f.restrictions}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 5. tricks */}
      {done && (
        <Section title="Shortcut / trick">
          {q.tricks.length === 0 ? <p className="text-sm text-muted">No special shortcut identified.</p> : q.tricks.map((t) => (
            <div key={t.id} className="mb-3 rounded-lg border border-good/30 bg-good-soft/40 p-4 last:mb-0">
              <div className="mb-1 flex items-center gap-2"><Badge tone="good">Valid shortcut</Badge><h3 className="font-semibold">{t.name}</h3></div>
              <div className="text-sm"><Rich text={t.explanation} /></div>
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <Field k="When it works" v={t.whenItWorks} /><Field k="Why it works" v={t.whyItWorks} />
                <Field k="Limitations" v={t.limitations} /><Field k="Check on this question" v={t.validityCheck} />
                <Field k="Normal method" v={t.normalMethod} /><Field k="Shortcut method" v={t.shortcutMethod} />
              </dl>
            </div>
          ))}
        </Section>
      )}

      {/* 6. mistakes */}
      {done && q.mistakes.length > 0 && (
        <Section title="Common mistakes">
          <div className="grid gap-3 md:grid-cols-2">
            {q.mistakes.map((m) => (
              <div key={m.id} className="rounded-lg border border-line p-3">
                <Badge tone="bad" className="mb-1 capitalize">{m.category}</Badge>
                <h3 className="text-sm font-semibold">{m.title}</h3>
                <p className="mt-1 text-sm text-muted"><Rich text={m.description} /></p>
                <p className="mt-2 rounded-md bg-good-soft px-2.5 py-1.5 text-xs text-good"><b>Prevent it:</b> <Rich text={m.preventionTip} /></p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 7. concepts */}
      {done && (
        <Section title="Concepts">
          {q.ids.conceptIds.length === 0 ? <p className="text-sm text-muted">No concept could be matched to the taxonomy — correct the classification to add one.</p> : (
            <div className="flex flex-wrap gap-2">
              {q.ids.conceptIds.map((c) => <Link key={c} to="/questions" params={{ conceptId: c }} className="rounded-full border border-line px-3 py-1 text-sm hover:border-brand hover:text-brand">{tax.get("concept", c)?.name}</Link>)}
            </div>
          )}
        </Section>
      )}

      {done && <Related q={q} />}
      {done && <SimilarGenerator q={q} />}

      {/* revision */}
      {done && (
        <Section title="Revision history">
          {rs && (
            <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-surface-2 p-3 text-sm">
              <span><b>Next revision:</b> {new Date(rs.dueAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}{isDue(rs) && <Badge tone="warn" className="ml-2">Due</Badge>}</span>
              <span className="text-muted">Interval {rs.intervalDays || "<1"} d · ease {rs.ease.toFixed(2)} · lapses {rs.lapses} · {rs.status}</span>
            </div>
          )}
          {reviews.length === 0 ? <p className="text-sm text-muted">Not revised yet. Day 1 → 3 → 7 → 14 → 30, then it adapts to how you rate each attempt.</p> : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="py-1 pr-4">When</th><th className="pr-4">Rating</th><th className="pr-4">Hints</th><th className="pr-4">Time</th><th>Next in</th></tr></thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-1.5 pr-4">{new Date(r.at).toLocaleDateString()}</td>
                      <td className="pr-4"><Badge tone={r.rating === "again" ? "bad" : r.rating === "hard" ? "warn" : "good"} className="capitalize">{r.rating}</Badge></td>
                      <td className="pr-4">{r.hintsUsed}</td><td className="pr-4">{Math.round(r.timeSpentSec / 60)} min</td><td>{r.intervalDays === 0 ? "10 min" : `${r.intervalDays} d`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt><dd className="mt-0.5"><Rich text={v} /></dd></div>;
}

/* ------------------------------ solution ------------------------------ */
function SolutionView({ q }: { q: Question }) {
  const s = q.solution!.content;
  const theory = s.solution_type !== "numerical";
  return (
    <Section title="Solution" hint={`${s.solution_type === "numerical" ? "Numerical" : s.solution_type === "theory" ? "Theory" : "Proof / derivation"} · generated once and stored${q.solution!.model === "sample-data" ? " · sample" : ` by ${q.solution!.model}`}`}
      actions={q.aiVerified ? <Badge tone="good">Independently verified</Badge> : <Badge tone="warn">Not verified</Badge>}>
      <div className="space-y-4 text-sm leading-relaxed">
        {!s.answerable && <ErrorBox title="The AI flagged this question">{s.issues || "It may be incomplete or ambiguous."}</ErrorBox>}
        {s.given.length > 0 && <Block title="Given"><ul className="list-disc space-y-0.5 pl-5">{s.given.map((g, i) => <li key={i}><Rich text={g} /></li>)}</ul></Block>}
        {s.required && <Block title={theory ? "Asked" : "Find"}><Rich text={s.required} /></Block>}
        {s.concept && <Block title={s.solution_type === "proof" ? "Starting principle" : theory ? "Core concept" : "Relevant concept"}><Rich text={s.concept} /></Block>}
        {s.assumptions.length > 0 && <Block title="Assumptions"><ul className="list-disc pl-5">{s.assumptions.map((a, i) => <li key={i}><Rich text={a} /></li>)}</ul></Block>}
        <Block title="Approach"><Rich text={s.approach} /></Block>
        <Block title={theory ? "Explanation" : "Step-by-step"}>
          <ol className="space-y-2">
            {s.steps.map((st, i) => (
              <li key={i} className="flex gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">{i + 1}</span><div className="min-w-0"><Rich text={st} /></div></li>
            ))}
          </ol>
        </Block>
        {s.unit_handling && <Block title="Unit handling"><Rich text={s.unit_handling} /></Block>}
        {s.important_points.length > 0 && <Block title="Important points"><ul className="list-disc pl-5">{s.important_points.map((a, i) => <li key={i}><Rich text={a} /></li>)}</ul></Block>}
        <div className="rounded-lg border border-brand/30 bg-brand-soft p-3"><div className="text-xs font-semibold uppercase tracking-wide text-brand">Final answer</div><div className="mt-1 text-base font-semibold"><Rich text={s.final_answer} /></div></div>
        {s.exam_ready_answer && <Block title="Exam-ready answer"><Rich text={s.exam_ready_answer} /></Block>}
        {s.validity_conditions && <Block title="Conditions of validity"><Rich text={s.validity_conditions} /></Block>}
        <Block title="Quick verification"><Rich text={s.verification} /></Block>
        {q.solution!.verificationNotes && !q.aiVerified && <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-warn"><b>Checker notes:</b> <Rich text={q.solution!.verificationNotes} /></div>}
      </div>
    </Section>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>{children}</div>;
}

/* ------------------------- classification history ------------------------- */
function ClassHistory({ q }: { q: Question }) {
  const db = useDB();
  const tax = useTax();
  const ev = db.classEvents.filter((e) => e.questionId === q.id).sort((a, b) => +new Date(a.at) - +new Date(b.at));
  if (ev.length < 2 && !ev.some((e) => e.kind === "user")) return null;
  const name = (e: (typeof ev)[number]) =>
    (["subject", "chapter", "subchapter", "topic", "subtopic", "concept"] as const)
      .map((l) => tax.get(l, e.ids[`${l}Id` as keyof ClassIds] as number | null)?.name)
      .filter(Boolean)
      .join(" › ");
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">Classification history ({ev.length})</summary>
      <ul className="mt-2 space-y-1.5">
        {ev.map((e) => (
          <li key={e.id} className="rounded-md bg-surface-2 px-3 py-2 text-xs"><Badge tone={e.kind === "user" ? "brand" : "neutral"}>{e.kind === "user" ? "Your correction" : "AI"}</Badge> <span className="text-muted">{new Date(e.at).toLocaleString()}</span><div className="mt-1">{name(e) || "—"}</div></li>
        ))}
      </ul>
    </details>
  );
}

/* --------------------------- correction editor ---------------------------- */
function CorrectionEditor({ q, onDone }: { q: Question; onDone: () => void }) {
  const tax = useTax();
  const ctax = useMemo(() => toClient(tax), [tax]);
  const [sel, setSel] = useState<Selection>({
    class: q.ids.classId, exam: q.ids.examId, subject: q.ids.subjectId, unit: q.ids.unitId, chapter: q.ids.chapterId,
    subchapter: q.ids.subchapterId, topic: q.ids.topicId, subtopic: q.ids.subtopicId, concept: q.ids.conceptId,
  });
  const [type, setType] = useState<number | null>(q.ids.questionTypeId);
  const [diff, setDiff] = useState<Difficulty | "">(q.difficulty ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const ids: ClassIds = {
      ...EMPTY_IDS,
      classId: sel.class ?? null, examId: sel.exam ?? null, subjectId: sel.subject ?? null, unitId: sel.unit ?? null, chapterId: sel.chapter ?? null,
      subchapterId: sel.subchapter ?? null, topicId: sel.topic ?? null, subtopicId: sel.subtopic ?? null, conceptId: sel.concept ?? null,
      conceptIds: sel.concept ? [sel.concept] : [], questionTypeId: type,
    };
    try {
      applyCorrection(q.id, ids, diff || null);
      toast("Classification corrected — the AI's original is kept in history", "good");
      onDone();
    } catch (e) {
      setError(e instanceof UserError ? e.message : "Could not save the correction.");
    }
  };
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-brand/30 p-4">
      <p className="text-xs text-muted">Options are dependent: each level only lists nodes under the one above. Levels you leave empty are stored as “unknown / needs review”.</p>
      <HierarchySelects tax={ctax} value={sel} onChange={setSel} levels={["class", "exam", "subject", "unit", "chapter", "subchapter", "topic", "subtopic", "concept"] as HierarchyLevel[]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Question type</label><select className="input" value={type ?? ""} onChange={(e) => setType(e.target.value ? Number(e.target.value) : null)}><option value="">Unknown</option>{(ctax.question_type ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="label">Difficulty</label><select className="input" value={diff} onChange={(e) => setDiff(e.target.value as Difficulty | "")}><option value="">Unchanged</option>{DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}</select></div>
      </div>
      {error && <ErrorBox title="Not allowed">{error}</ErrorBox>}
      <div className="flex gap-2"><button className="btn btn-primary btn-sm" onClick={save}>Save correction</button><button className="btn btn-sm" onClick={onDone}>Cancel</button></div>
    </div>
  );
}

/* ------------------------------ related ------------------------------- */
function Related({ q }: { q: Question }) {
  const db = useDB();
  const tax = useTax();
  type Key = "concept" | "topic" | "subchapter" | "chapter" | "formula" | "difficulty";
  const groups = useMemo(() => {
    const others = db.questions.filter((x) => x.id !== q.id && x.processingStatus === "completed");
    return {
      concept: others.filter((x) => q.ids.conceptIds.some((c) => x.ids.conceptIds.includes(c))),
      topic: others.filter((x) => q.ids.topicId && x.ids.topicId === q.ids.topicId),
      subchapter: others.filter((x) => q.ids.subchapterId && x.ids.subchapterId === q.ids.subchapterId),
      chapter: others.filter((x) => q.ids.chapterId && x.ids.chapterId === q.ids.chapterId),
      formula: others.filter((x) => q.formulaIds.some((f) => x.formulaIds.includes(f))),
      difficulty: others.filter((x) => q.ids.chapterId && x.ids.chapterId === q.ids.chapterId && x.difficulty === q.difficulty),
    } as Record<Key, Question[]>;
  }, [db.questions, q]);
  const items: { key: Key; label: string }[] = [{ key: "concept", label: "Same concept" }, { key: "topic", label: "Same topic" }, { key: "subchapter", label: "Same subchapter" }, { key: "chapter", label: "Same chapter" }, { key: "formula", label: "Same formula" }, { key: "difficulty", label: "Similar difficulty" }];
  const first = items.find((i) => groups[i.key].length)?.key ?? "concept";
  const [tab, setTab] = useState<Key>(first);
  const list = groups[tab].slice(0, 8);
  return (
    <Section title="Related questions">
      <Tabs<Key> value={tab} onChange={setTab} items={items.map((i) => ({ ...i, count: groups[i.key].length }))} />
      <div className="mt-3 space-y-2">
        {list.length === 0 ? <p className="text-sm text-muted">Nothing here yet — add more questions in {tax.get("chapter", q.ids.chapterId)?.name ?? "this area"} to build a practice set.</p> : list.map((x) => (
          <Link key={x.id} to={`/questions/${x.id}`} className="block rounded-lg border border-line p-3 text-sm hover:border-brand/50"><div className="line-clamp-2"><Rich text={x.originalText} /></div></Link>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------- similar generator ----------------------------- */
const MODES: [SimilarMode, string][] = [["values", "Same concept, different values"], ["wording", "Different wording / scenario"], ["harder", "Increase difficulty"], ["easier", "Decrease difficulty"], ["mix", "Mix"]];
function SimilarGenerator({ q }: { q: Question }) {
  const db = useDB();
  const [mode, setMode] = useState<SimilarMode>("values");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const gen = db.generated.filter((g) => g.fromId === q.id);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const n = await generateSimilarFor(q.id, mode, count);
      toast(`Generated ${n} question${n === 1 ? "" : "s"} (labelled AI-generated)`, "good");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Generate similar questions" hint="AI-generated questions are stored separately and labelled; save the ones you want in your library.">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="label">Variation</label><select className="input" value={mode} onChange={(e) => setMode(e.target.value as SimilarMode)}>{MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="label">How many</label><select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></div>
        <button className="btn btn-primary" disabled={busy || !aiConfigured()} onClick={run}>{busy && <Spinner />} Generate Similar Question</button>
      </div>
      {!aiConfigured() && <p className="mt-2 text-xs text-warn">Add your AI key in <Link to="/settings" className="underline">Settings</Link> to generate questions.</p>}
      {err && <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>}
      <div className="mt-4 space-y-3">
        {gen.map((g) => (
          <div key={g.id} className="rounded-lg border border-line p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2"><Badge tone="brand">AI-generated</Badge><span className="text-xs text-muted">{g.variation}</span></div>
            <div className="text-sm"><Rich text={g.text} /></div>
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-xs font-semibold text-muted">Expected answer & outline</summary><div className="mt-1"><b>Answer:</b> <Rich text={g.expectedAnswer} /></div><div className="mt-1 text-muted"><Rich text={g.solutionOutline} /></div></details>
            <div className="mt-2 flex gap-2">
              {g.savedQuestionId ? <Link to={`/questions/${g.savedQuestionId}`} className="btn btn-sm">Open saved question</Link> : <button className="btn btn-sm btn-primary" onClick={async () => { try { await saveGenerated(g.id); toast("Saved — analysing in the background", "good"); } catch (e) { toast(e instanceof Error ? e.message : "Could not save", "bad"); } }}>Save to library</button>}
              {!g.savedQuestionId && <button className="btn btn-sm" onClick={() => discardGenerated(g.id)}>Discard</button>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
