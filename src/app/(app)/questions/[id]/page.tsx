import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { Rich, Tex } from "@/components/Rich";
import { ClassificationEditor, QuestionActions, QuestionProcessing, SimilarGenerator } from "@/components/QuestionClient";
import { Bar, DiffBadge, Skeleton, fmtDate, fmtDateTime, pct, relativeDue } from "@/components/ui";
import { isUuid } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getRelated } from "@/lib/queries";
import { breadcrumbFor, loadTaxonomy, pathText, toClient, type Taxonomy } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

type Params = { id: string };
export async function generateMetadata({ params }: { params: Promise<Params> }) {
  void params;
  return { title: "Question" };
}

const LEVEL_NAMES: Record<string, string> = { class: "Class", exam: "Exam", subject: "Subject", unit: "Unit", chapter: "Chapter", subchapter: "Subchapter", topic: "Topic", subtopic: "Subtopic", concept: "Concept" };

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="card" id={id}>
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((s, i) => (
        <li key={i}>
          <Rich text={s} />
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-0.5 leading-relaxed">{children}</div>
    </div>
  );
}

async function Related({ userId, questionId }: { userId: string; questionId: string }) {
  const [q] = await db.select().from(S.questions).where(eq(S.questions.id, questionId));
  const groups = await getRelated(userId, q);
  if (!groups.length) return <p className="text-sm text-muted">No related questions yet. Add more questions from this chapter to build practice sets.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((g) => (
        <div key={g.key}>
          <h3 className="mb-1.5 text-sm font-semibold">{g.label}</h3>
          <ul className="space-y-1.5">
            {g.items.map((r) => (
              <li key={r.id}>
                <Link href={`/questions/${r.id}`} className="block rounded-lg border border-line p-2.5 text-sm hover:bg-surface2">
                  <span className="line-clamp-2">
                    <Rich text={r.text} />
                  </span>
                  {r.difficulty && <span className="mt-1 block text-xs text-muted">{r.difficulty}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Breadcrumb({ tax, q, crumbs }: { tax: Taxonomy; q: typeof S.questions.$inferSelect; crumbs: ReturnType<typeof breadcrumbFor> }) {
  const has = new Set(crumbs.map((c) => c.level));
  const chapter = tax.get("chapter", q.chapterId);
  const unknown: string[] = [];
  if (!q.chapterId) unknown.push("chapter");
  else {
    const kids = tax.children("chapter", q.chapterId);
    if (kids.some((k) => k.level === "subchapter") && !q.subchapterId) unknown.push("subchapter");
    const topicsUnder = tax.byLevel.topic.some((t) => t.a.chapter === q.chapterId);
    if (topicsUnder && !q.topicId) unknown.push("topic");
    if (q.topicId && tax.children("topic", q.topicId).some((k) => k.level === "subtopic") && !q.subtopicId) unknown.push("subtopic");
    if (tax.byLevel.concept.some((c) => c.a.chapter === chapter?.id) && !q.conceptId) unknown.push("concept");
  }
  return (
    <nav aria-label="Classification" className="flex flex-wrap items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => (
        <span key={`${c.level}${c.id}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted">›</span>}
          <Link href={c.href} title={`${LEVEL_NAMES[c.level]} — click to see all questions here`} className="rounded-md bg-brand-soft px-2 py-1 font-medium text-brand hover:underline">
            {c.name}
          </Link>
        </span>
      ))}
      {unknown.map((l) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="text-muted">›</span>
          <span className="rounded-md border border-dashed border-warn/50 px-2 py-1 text-xs text-warn" title="Not determined — open “Edit classification” to set it">
            {LEVEL_NAMES[l]}: unknown / needs review
          </span>
        </span>
      ))}
      {!has.size && <span className="text-muted">Not classified yet</span>}
    </nav>
  );
}

export default async function QuestionPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireUser();
  const [q] = await db.select().from(S.questions).where(and(eq(S.questions.id, id), eq(S.questions.userId, user.id))).limit(1);
  if (!q) notFound();
  const tax = await loadTaxonomy();
  const tz = user.timezone;

  const [sol, formulas, tricks, mistakes, concepts, tags, events, state, history, generated, dup] = await Promise.all([
    db.select().from(S.solutions).where(eq(S.solutions.questionId, id)).limit(1),
    db
      .select({ f: S.formulas })
      .from(S.questionFormulas)
      .innerJoin(S.formulas, eq(S.formulas.id, S.questionFormulas.formulaId))
      .where(eq(S.questionFormulas.questionId, id)),
    db.select().from(S.tricks).where(eq(S.tricks.questionId, id)),
    db.select().from(S.commonMistakes).where(eq(S.commonMistakes.questionId, id)).orderBy(asc(S.commonMistakes.id)),
    db.select({ id: S.questionConcepts.conceptId, primary: S.questionConcepts.isPrimary }).from(S.questionConcepts).where(eq(S.questionConcepts.questionId, id)),
    db.select({ id: S.tags.id, name: S.tags.name }).from(S.questionTags).innerJoin(S.tags, eq(S.tags.id, S.questionTags.tagId)).where(eq(S.questionTags.questionId, id)),
    db.select().from(S.revisionEvents).where(eq(S.revisionEvents.questionId, id)).orderBy(desc(S.revisionEvents.createdAt)).limit(30),
    db.select().from(S.revisionState).where(eq(S.revisionState.questionId, id)).limit(1),
    db.select().from(S.classificationEvents).where(eq(S.classificationEvents.questionId, id)).orderBy(desc(S.classificationEvents.createdAt)),
    db.select().from(S.generatedQuestions).where(and(eq(S.generatedQuestions.sourceQuestionId, id), eq(S.generatedQuestions.userId, user.id))).orderBy(desc(S.generatedQuestions.createdAt)),
    q.duplicateOfId ? db.select({ id: S.questions.id, text: S.questions.originalText }).from(S.questions).where(and(eq(S.questions.id, q.duplicateOfId), eq(S.questions.userId, user.id))).limit(1) : Promise.resolve([]),
  ]);
  const solution = sol[0];
  const content = (solution?.content ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof content[k] === "string" ? (content[k] as string) : "");
  const arr = (k: string) => (Array.isArray(content[k]) ? (content[k] as unknown[]).map(String) : []);
  const verification = (solution?.verification ?? {}) as Record<string, unknown>;
  const rs = state[0];
  const crumbs = breadcrumbFor(tax, q);
  const aiEvent = history.find((h) => h.kind === "ai");
  const aiAfter = (aiEvent?.after ?? {}) as { ids?: Record<string, number | null>; suggestions?: Record<string, string[]> };
  const aiPath = aiEvent && q.classificationSource === "user" ? pathText(tax, { subjectId: aiAfter.ids?.subjectId, chapterId: aiAfter.ids?.chapterId, subchapterId: aiAfter.ids?.subchapterId, topicId: aiAfter.ids?.topicId, subtopicId: aiAfter.ids?.subtopicId, conceptId: aiAfter.ids?.conceptId }) : "";
  const corrections = history.filter((h) => h.kind === "user_correction");
  const done = q.processingStatus === "completed";
  const type = tax.get("question_type", q.questionTypeId)?.name;
  const conceptNodes = concepts.map((c) => ({ node: tax.get("concept", c.id), primary: c.primary })).filter((c) => c.node);
  const conf = q.levelConfidence ?? {};
  const confLevels: [string, string][] = [["exam", "Exam"], ["class", "Class"], ["subject", "Subject"], ["unit", "Unit"], ["chapter", "Chapter"], ["subchapter", "Subchapter"], ["topic", "Topic"], ["subtopic", "Subtopic"], ["concept", "Concept"]];
  const originalIsImage = Boolean(q.imageUploadId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/questions" className="text-muted hover:text-fg">
          ← All questions
        </Link>
        {done && (
          <Link href={`/revision/session?ids=${q.id}`} className="btn btn-primary">
            Revise this question
          </Link>
        )}
      </div>

      {/* 1. QUESTION */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <DiffBadge value={q.difficulty} confidence={q.difficultyConfidence} />
          {q.perceivedDifficulty && q.perceivedDifficulty !== q.difficulty && <span className="badge" title="Based on your own revision history">You find it: {q.perceivedDifficulty}</span>}
          {type && <span className="badge">{type}</span>}
          {q.isAiGenerated && <span className="badge text-brand">AI-generated</span>}
          {q.needsReview && done && <span className="badge border-warn/30 bg-warn/10 text-warn">Needs review</span>}
          {done && (q.aiVerified ? <span className="badge border-ok/30 bg-ok/10 text-ok">✓ AI-verified answer</span> : <span className="badge border-warn/30 bg-warn/10 text-warn">Answer not independently verified</span>)}
        </div>
        <div className="text-lg leading-relaxed">
          <Rich text={q.originalText} />
        </div>
        {originalIsImage && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted">Original image</summary>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/uploads/${q.imageUploadId}`} alt="Original uploaded question" className="mt-2 max-h-[480px] rounded-lg border border-line" loading="lazy" />
          </details>
        )}
        {q.pdfUploadId && (
          <p className="mt-3 text-sm">
            <a className="text-brand underline" href={`/api/uploads/${q.pdfUploadId}`} target="_blank" rel="noreferrer">
              Open original PDF
            </a>
          </p>
        )}
      </section>

      {!done && <QuestionProcessing id={q.id} status={q.processingStatus} stage={q.processingStage} error={q.processingError} stale={q.processingStatus === "processing" && Date.now() - q.heartbeatAt.getTime() > 5 * 60_000} duplicate={{ id: dup[0]?.id ?? null, text: dup[0]?.text.slice(0, 300) ?? null, score: q.duplicateScore }} />}

      {/* 2. METADATA */}
      <section className="card">
        <h2 className="section-title">Metadata</h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Source">{q.sourceName ?? <span className="text-muted">—</span>}{q.sourcePage ? ` · ${q.sourcePage}` : ""}</Field>
          <Field label="Added">{fmtDateTime(q.createdAt, tz)}</Field>
          <Field label="Input">{q.sourceType === "ai_generated" ? "AI generated" : q.sourceType}</Field>
          <Field label="Classification">
            {q.classificationSource === "user" ? <>Corrected by you · {fmtDate(q.userCorrectedAt, tz)}</> : <>AI · overall {pct(q.classificationConfidence)}</>}
          </Field>
        </dl>
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Link key={t.id} href={`/questions?tagId=${t.id}`} className="badge hover:bg-surface">
                #{t.name}
              </Link>
            ))}
          </div>
        )}
        {q.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface2 p-3 text-sm">{q.notes}</p>}
      </section>

      {/* 3. BREADCRUMB + correction */}
      {done && (
        <section className="card space-y-4">
          <h2 className="section-title">Where this question lives</h2>
          <Breadcrumb tax={tax} q={q} crumbs={crumbs} />
          {q.classificationSource === "ai" && Object.keys(conf).length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Confidence per level</summary>
              <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {confLevels
                  .filter(([k]) => conf[k] !== undefined)
                  .map(([k, label]) => (
                    <div key={k}>
                      <div className="flex justify-between text-xs">
                        <span>{label}</span>
                        <span className="tabular-nums text-muted">{conf[k] ? pct(conf[k]) : "unknown"}</span>
                      </div>
                      <Bar value={conf[k] ?? 0} tone={(conf[k] ?? 0) >= 0.8 ? "ok" : (conf[k] ?? 0) >= 0.6 ? "warn" : "bad"} />
                    </div>
                  ))}
              </div>
            </details>
          )}
          <ClassificationEditor
            questionId={q.id}
            tax={toClient(tax)}
            initial={{
              sel: { class: q.classId, exam: q.examId, subject: q.subjectId, unit: q.unitId, chapter: q.chapterId, subchapter: q.subchapterId, topic: q.topicId, subtopic: q.subtopicId },
              conceptIds: [...concepts].sort((a, b) => Number(b.primary) - Number(a.primary)).map((c) => c.id),
              questionTypeId: q.questionTypeId,
              difficulty: q.difficulty,
            }}
            suggestions={aiAfter.suggestions ?? {}}
            aiPath={aiPath}
            needsReview={q.needsReview}
            reasons={q.reviewReasons}
          />
          {corrections.length > 0 && <p className="text-xs text-muted">{corrections.length} correction{corrections.length > 1 ? "s" : ""} recorded — last on {fmtDateTime(corrections[0].createdAt, tz)}. The original AI classification is preserved.</p>}
        </section>
      )}

      {/* 4. SOLUTION */}
      {done && solution && (
        <Section title="Solution" id="solution">
          <div className="space-y-4">
            {!(content.answerable ?? true) && (
              <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
                The AI flagged this question as possibly incomplete or ambiguous: <Rich text={str("issues")} />
              </p>
            )}
            {arr("given").length > 0 && (
              <Field label="Given">
                <List items={arr("given")} />
              </Field>
            )}
            {str("required") && (
              <Field label={solution.kind === "numerical" ? "Find" : "Asked"}>
                <Rich text={str("required")} />
              </Field>
            )}
            {str("concept") && (
              <Field label={solution.kind === "theory" ? "Core concept" : solution.kind === "proof" ? "Starting principle" : "Relevant concept"}>
                <Rich text={str("concept")} />
              </Field>
            )}
            {arr("assumptions").length > 0 && (
              <Field label="Assumptions">
                <List items={arr("assumptions")} />
              </Field>
            )}
            <Field label="Approach">
              <Rich text={str("approach")} />
            </Field>
            <Field label={solution.kind === "proof" ? "Derivation" : solution.kind === "theory" ? "Explanation" : "Step-by-step"}>
              <ol className="space-y-2.5">
                {arr("steps").map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{i + 1}</span>
                    <Rich text={s} className="min-w-0 flex-1" />
                  </li>
                ))}
              </ol>
            </Field>
            {str("unit_handling") && (
              <Field label="Unit handling">
                <Rich text={str("unit_handling")} />
              </Field>
            )}
            <div className="rounded-xl border border-ok/30 bg-ok/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ok">Final answer</p>
              <div className="mt-1 text-lg font-medium">
                <Rich text={solution.finalAnswer} />
              </div>
            </div>
            {arr("important_points").length > 0 && (
              <Field label="Important points">
                <List items={arr("important_points")} />
              </Field>
            )}
            {str("exam_ready_answer") && (
              <Field label="Exam-ready answer">
                <Rich text={str("exam_ready_answer")} />
              </Field>
            )}
            {str("validity_conditions") && (
              <Field label="Conditions of validity">
                <Rich text={str("validity_conditions")} />
              </Field>
            )}
            <Field label="Quick verification">
              <Rich text={str("verification")} />
              <p className={`mt-2 text-xs ${solution.verified ? "text-ok" : "text-warn"}`}>
                {solution.verified ? "✓ An independent re-solve reached the same answer." : `⚠ Independent re-solve disagreed or the question was ambiguous: ${String(verification.notes ?? "") || String(verification.independent_answer ?? "")}`}
              </p>
            </Field>
          </div>
        </Section>
      )}

      {/* 5. FORMULAS */}
      {done && (
        <Section title="Key formula(s)">
          {formulas.length === 0 ? (
            <p className="text-sm text-muted">No standard formula was needed for this question.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {formulas.map(({ f }) => (
                <div key={f.id} className="rounded-lg border border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{f.name}</h3>
                    <Link href={`/questions?formulaId=${f.id}`} className="shrink-0 text-xs text-brand">
                      All questions →
                    </Link>
                  </div>
                  <div className="my-2 rounded-lg bg-surface2 px-3 py-2 text-center">
                    <Tex latex={f.latex} fallback={f.expression} />
                  </div>
                  {f.variables.length > 0 && (
                    <ul className="space-y-0.5 text-sm">
                      {f.variables.map((v) => (
                        <li key={v.symbol}>
                          <b>
                            <Rich text={`$${v.symbol.replace(/\$/g, "")}$`} />
                          </b>{" "}
                          — {v.meaning}
                          {v.unit ? <span className="text-muted"> ({v.unit})</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {f.whenToUse && <p className="mt-2 text-sm"><span className="text-muted">Use when:</span> {f.whenToUse}</p>}
                  {f.restrictions && <p className="mt-1 text-sm"><span className="text-muted">Valid when:</span> {f.restrictions}</p>}
                  <p className="mt-2 text-xs text-muted">{pathText(tax, f)}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 6. SHORTCUT */}
      {done && (
        <Section title="Shortcut / trick">
          {tricks.length === 0 ? (
            <p className="text-sm text-muted">No special shortcut identified.</p>
          ) : (
            <div className="space-y-4">
              {tricks.map((t) => (
                <div key={t.id} className="rounded-lg border border-ok/30 bg-ok/5 p-4">
                  <h3 className="font-semibold text-ok">⚡ {t.name}</h3>
                  <div className="mt-2 space-y-3 text-sm">
                    <Field label="Shortcut"><Rich text={t.explanation} /></Field>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Normal method"><Rich text={t.normalMethod} /></Field>
                      <Field label="Shortcut method"><Rich text={t.shortcutMethod} /></Field>
                    </div>
                    <Field label="When it works"><Rich text={t.whenItWorks} /></Field>
                    <Field label="Why it works"><Rich text={t.whyItWorks} /></Field>
                    <Field label="Limitations"><Rich text={t.limitations} /></Field>
                    <Field label="Checked on this question"><Rich text={t.validityCheck} /></Field>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 7. MISTAKES */}
      {done && (
        <Section title="Common mistakes">
          {mistakes.length === 0 ? (
            <p className="text-sm text-muted">None recorded.</p>
          ) : (
            <ul className="space-y-3">
              {mistakes.map((m) => (
                <li key={m.id} className="rounded-lg border border-line p-3">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="badge capitalize">{m.category}</span>
                    <Rich text={m.title} />
                  </p>
                  <p className="mt-1 text-sm"><Rich text={m.description} /></p>
                  <p className="mt-1 text-sm text-ok">Prevent it: <Rich text={m.preventionTip} /></p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* 8. CONCEPTS */}
      {done && (
        <Section title="Concepts">
          {conceptNodes.length === 0 ? (
            <p className="text-sm text-muted">No concept from the taxonomy could be matched confidently. Use “Edit classification” to add some.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {conceptNodes.map(({ node, primary }) => (
                <Link key={node!.id} href={`/questions?conceptId=${node!.id}&chapterId=${node!.a.chapter ?? ""}&subjectId=${node!.a.subject ?? ""}`} className={`rounded-full border px-3 py-1 text-sm hover:bg-surface2 ${primary ? "border-brand/40 bg-brand-soft text-brand" : "border-line"}`}>
                  {node!.name}
                  {primary ? " ★" : ""}
                </Link>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 9. RELATED (lazy) */}
      {done && (
        <Section title="Related questions">
          <Suspense fallback={<div className="grid gap-3 md:grid-cols-2"><Skeleton /><Skeleton /></div>}>
            <Related userId={user.id} questionId={q.id} />
          </Suspense>
        </Section>
      )}

      {/* similar generator */}
      {done && (
        <Section title="Practice variations (AI-generated)">
          <SimilarGenerator
            questionId={q.id}
            initial={generated.map((g) => ({ id: g.id, text: g.text, variation: g.variation, expectedAnswer: g.expectedAnswer, solutionOutline: g.solutionOutline, savedQuestionId: g.savedQuestionId }))}
          />
        </Section>
      )}

      {/* 10. REVISION HISTORY */}
      {done && (
        <Section title="Revision history">
          {events.length === 0 ? (
            <p className="text-sm text-muted">Not revised yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted">
                  <tr>
                    <th className="py-1.5 pr-4">When</th>
                    <th className="pr-4">Rating</th>
                    <th className="pr-4">Hints</th>
                    <th className="pr-4">Time</th>
                    <th>Next interval</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <td className="py-1.5 pr-4">{fmtDateTime(e.createdAt, tz)}</td>
                      <td className="pr-4 capitalize">{e.rating}</td>
                      <td className="pr-4">{e.hintsUsed}</td>
                      <td className="pr-4">{e.timeSpentSec ? `${Math.round(e.timeSpentSec / 60)} min` : "—"}</td>
                      <td>{e.intervalAfter === 0 ? "10 min" : `${e.intervalAfter} d`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* 11. NEXT REVISION */}
      {done && rs && (
        <Section title="Next revision">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-2xl font-semibold">{rs.status === "mastered" ? "Mastered" : relativeDue(rs.dueAt)}</p>
              <p className="text-sm text-muted">
                {fmtDateTime(rs.dueAt, tz)} · interval {rs.intervalDays < 1 ? "<1" : Math.round(rs.intervalDays)} d · ease {rs.ease.toFixed(2)} · {rs.repetitions} reviews · {rs.lapses} lapses
              </p>
            </div>
            <Link href={`/revision/session?ids=${q.id}`} className="btn btn-primary">
              Revise now
            </Link>
          </div>
        </Section>
      )}

      <Section title="Manage">
        <QuestionActions id={q.id} notes={q.notes} />
      </Section>
    </div>
  );
}
