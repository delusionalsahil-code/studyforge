import "server-only";
import { and, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import * as S from "@/db/schema";
import { semanticIds, interpretQuery, type Interpretation } from "@/lib/search";
import { weightedAccuracy } from "@/lib/srs";
import { loadTaxonomy, type TaxNode, type Taxonomy } from "@/lib/taxonomy";
import { tokenSimilarity } from "@/lib/text";

/* ----------------------------- time helpers ----------------------------- */
export const startOfToday = (tz: string) => sql`((now() at time zone ${tz}::text)::date at time zone ${tz}::text)`;
export const endOfToday = (tz: string) => sql`(((now() at time zone ${tz}::text)::date + 1) at time zone ${tz}::text)`;

const weakCond = sql`(rs.status <> 'mastered' and (rs.last_rating in ('again','hard') or rs.ease < 2.1 or rs.lapses >= 2))`;

/* ------------------------------- library -------------------------------- */
export interface LibraryFilters {
  classId?: number;
  examId?: number;
  subjectId?: number;
  unitId?: number;
  chapterId?: number;
  subchapterId?: number;
  topicId?: number;
  subtopicId?: number;
  conceptId?: number;
  typeId?: number;
  difficulty?: string;
  formulaId?: number;
  trick?: boolean;
  review?: boolean;
  status?: "weak" | "mastered" | "due" | "new" | "failed";
  source?: string;
  tagId?: number;
  q?: string;
  page: number;
}

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | string[] | undefined) => {
  const n = Number(first(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export function parseFilters(sp: SP): LibraryFilters {
  const status = first(sp.status);
  const difficulty = first(sp.difficulty);
  return {
    classId: num(sp.classId),
    examId: num(sp.examId),
    subjectId: num(sp.subjectId),
    unitId: num(sp.unitId),
    chapterId: num(sp.chapterId),
    subchapterId: num(sp.subchapterId),
    topicId: num(sp.topicId),
    subtopicId: num(sp.subtopicId),
    conceptId: num(sp.conceptId),
    typeId: num(sp.typeId),
    formulaId: num(sp.formulaId),
    tagId: num(sp.tagId),
    difficulty: difficulty && ["Easy", "Medium", "Hard", "Very Hard"].includes(difficulty) ? difficulty : undefined,
    trick: first(sp.trick) === "1" || undefined,
    review: first(sp.review) === "1" || undefined,
    status: status && ["weak", "mastered", "due", "new", "failed"].includes(status) ? (status as LibraryFilters["status"]) : undefined,
    source: first(sp.source)?.trim() || undefined,
    q: first(sp.q)?.trim().slice(0, 200) || undefined,
    page: num(sp.page) ?? 1,
  };
}

const Q = S.questions;

export interface LibraryRow {
  id: string;
  text: string;
  difficulty: string | null;
  needsReview: boolean;
  hasTrick: boolean;
  processingStatus: string;
  createdAt: Date;
  subjectId: number | null;
  chapterId: number | null;
  subchapterId: number | null;
  topicId: number | null;
  conceptId: number | null;
  questionTypeId: number | null;
  sourceName: string | null;
  isAiGenerated: boolean;
  dueAt: Date | null;
  revStatus: string | null;
}

export async function listQuestions(userId: string, f: LibraryFilters, tz: string, pageSize = 20) {
  const tax = await loadTaxonomy();
  const where: (SQL | undefined)[] = [eq(Q.userId, userId)];
  const eqs: [AnyPgColumn, number | undefined][] = [
    [Q.classId, f.classId],
    [Q.examId, f.examId],
    [Q.subjectId, f.subjectId],
    [Q.unitId, f.unitId],
    [Q.chapterId, f.chapterId],
    [Q.subchapterId, f.subchapterId],
    [Q.topicId, f.topicId],
    [Q.subtopicId, f.subtopicId],
    [Q.questionTypeId, f.typeId],
  ];
  for (const [col, v] of eqs) if (v) where.push(eq(col, v));
  if (f.difficulty) where.push(eq(Q.difficulty, f.difficulty));
  if (f.conceptId) where.push(sql`exists (select 1 from question_concepts qc where qc.question_id = ${Q.id} and qc.concept_id = ${f.conceptId})`);
  if (f.formulaId) where.push(sql`exists (select 1 from question_formulas qf where qf.question_id = ${Q.id} and qf.formula_id = ${f.formulaId})`);
  if (f.tagId) where.push(sql`exists (select 1 from question_tags qt where qt.question_id = ${Q.id} and qt.tag_id = ${f.tagId})`);
  if (f.trick) where.push(eq(Q.hasTrick, true));
  if (f.review) where.push(eq(Q.needsReview, true));
  if (f.source) {
    where.push(or(sql`${Q.sourceName} ilike ${"%" + f.source + "%"}`, eq(Q.sourceType, f.source)));
  }

  let interp: Interpretation | null = null;
  let status = f.status;
  if (f.q) {
    interp = interpretQuery(f.q, tax);
    if (interp.difficulty && !f.difficulty) where.push(eq(Q.difficulty, interp.difficulty));
    if (interp.trick) where.push(eq(Q.hasTrick, true));
    if (interp.typeId && !f.typeId) where.push(eq(Q.questionTypeId, interp.typeId));
    if (interp.status && !status) status = interp.status;
    if (interp.terms.length) {
      const like = "%" + interp.terms.join("%") + "%";
      const anyOf: (SQL | undefined)[] = [
        and(...interp.terms.map((t) => sql`${Q.originalText} ilike ${"%" + t + "%"}`)),
        sql`exists (select 1 from question_tags qt join tags t on t.id = qt.tag_id where qt.question_id = ${Q.id} and replace(t.name, '-', ' ') ilike ${like})`,
        sql`exists (select 1 from question_formulas qf join formulas fo on fo.id = qf.formula_id where qf.question_id = ${Q.id} and (fo.name ilike ${like} or fo.expression ilike ${like}))`,
      ];
      const colFor: Record<string, AnyPgColumn | undefined> = {
        subject: Q.subjectId,
        chapter: Q.chapterId,
        subchapter: Q.subchapterId,
        topic: Q.topicId,
        subtopic: Q.subtopicId,
      };
      for (const n of interp.nodes) {
        if (n.level === "concept") {
          anyOf.push(sql`exists (select 1 from question_concepts qc where qc.question_id = ${Q.id} and qc.concept_id in (${sql.join(n.ids.map((i) => sql`${i}`), sql`, `)}))`);
        } else if (colFor[n.level]) anyOf.push(inArray(colFor[n.level]!, n.ids));
      }
      const sem = await semanticIds(userId, f.q);
      if (sem.length) anyOf.push(inArray(Q.id, sem));
      where.push(or(...anyOf));
    }
  }

  if (status === "weak") where.push(sql`exists (select 1 from revision_state rs where rs.question_id = ${Q.id} and ${weakCond})`);
  else if (status === "mastered") where.push(sql`exists (select 1 from revision_state rs where rs.question_id = ${Q.id} and rs.status = 'mastered')`);
  else if (status === "due") where.push(sql`exists (select 1 from revision_state rs where rs.question_id = ${Q.id} and rs.due_at < ${endOfToday(tz)})`);
  else if (status === "new") where.push(sql`exists (select 1 from revision_state rs where rs.question_id = ${Q.id} and rs.repetitions = 0 and rs.last_reviewed_at is null)`);
  else if (status === "failed") where.push(inArray(Q.processingStatus, ["failed", "duplicate_pending"]));

  const cond = and(...where);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(Q).where(cond);
  const page = Math.max(1, Math.min(f.page, Math.max(1, Math.ceil(n / pageSize))));
  const rows = await db
    .select({
      id: Q.id,
      text: Q.originalText,
      difficulty: Q.difficulty,
      needsReview: Q.needsReview,
      hasTrick: Q.hasTrick,
      processingStatus: Q.processingStatus,
      createdAt: Q.createdAt,
      subjectId: Q.subjectId,
      chapterId: Q.chapterId,
      subchapterId: Q.subchapterId,
      topicId: Q.topicId,
      conceptId: Q.conceptId,
      questionTypeId: Q.questionTypeId,
      sourceName: Q.sourceName,
      isAiGenerated: Q.isAiGenerated,
      dueAt: S.revisionState.dueAt,
      revStatus: S.revisionState.status,
    })
    .from(Q)
    .leftJoin(S.revisionState, eq(S.revisionState.questionId, Q.id))
    .where(cond)
    .orderBy(desc(Q.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows: rows as LibraryRow[], total: n, page, pages: Math.max(1, Math.ceil(n / pageSize)), interp };
}

/* ------------------------------ related -------------------------------- */
export interface RelatedItem {
  id: string;
  text: string;
  difficulty: string | null;
}

export async function getRelated(userId: string, q: typeof Q.$inferSelect) {
  const base = and(eq(Q.userId, userId), ne(Q.id, q.id), eq(Q.processingStatus, "completed"));
  const sel = { id: Q.id, text: Q.originalText, difficulty: Q.difficulty };
  const run = (cond: SQL | undefined) => db.select(sel).from(Q).where(and(base, cond)).orderBy(desc(Q.createdAt)).limit(5);
  const groups: { key: string; label: string; items: RelatedItem[] }[] = [];
  const add = (key: string, label: string, items: RelatedItem[]) => items.length && groups.push({ key, label, items });

  const [chapter, subchapter, topic, concept, formula, difficulty, pattern] = await Promise.all([
    q.chapterId ? run(eq(Q.chapterId, q.chapterId)) : [],
    q.subchapterId ? run(eq(Q.subchapterId, q.subchapterId)) : [],
    q.topicId ? run(eq(Q.topicId, q.topicId)) : [],
    run(sql`exists (select 1 from question_concepts a join question_concepts b on a.concept_id = b.concept_id where a.question_id = ${Q.id} and b.question_id = ${q.id})`),
    run(sql`exists (select 1 from question_formulas a join question_formulas b on a.formula_id = b.formula_id where a.question_id = ${Q.id} and b.question_id = ${q.id})`),
    q.difficulty && q.subjectId ? run(and(eq(Q.difficulty, q.difficulty), eq(Q.subjectId, q.subjectId))) : [],
    q.questionTypeId && q.subjectId
      ? db.select({ ...sel, norm: Q.normalizedText }).from(Q).where(and(base, eq(Q.questionTypeId, q.questionTypeId), eq(Q.subjectId, q.subjectId))).limit(150)
      : [],
  ]);
  const patternRanked = (pattern as (RelatedItem & { norm: string })[])
    .map((r) => ({ r, s: tokenSimilarity(q.normalizedText, r.norm) }))
    .filter((x) => x.s > 0.15)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map((x) => ({ id: x.r.id, text: x.r.text, difficulty: x.r.difficulty }));
  add("chapter", "Same chapter", chapter);
  add("subchapter", "Same subchapter", subchapter);
  add("topic", "Same topic", topic);
  add("concept", "Same concept", concept);
  add("formula", "Same formula", formula);
  add("difficulty", "Similar difficulty (same subject)", difficulty);
  add("pattern", "Similar question pattern", patternRanked);
  return groups;
}

/* ----------------------------- performance ------------------------------ */
export type PerfLevel = "subject" | "unit" | "chapter" | "subchapter" | "topic" | "subtopic" | "concept" | "formula";

export interface PerfRow {
  id: number;
  name: string;
  path: string;
  questions: number;
  attempts: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  mastered: number;
  correct: number;
  accuracy: number | null;
  avgTime: number | null;
  verdict: "weak" | "developing" | "strong" | "untested";
  href: string;
}

const PERF_SQL: Record<PerfLevel, { join: string; table: string; param: string }> = {
  subject: { join: "join subjects t on t.id = q.subject_id", table: "subjects", param: "subjectId" },
  unit: { join: "join units t on t.id = q.unit_id", table: "units", param: "unitId" },
  chapter: { join: "join chapters t on t.id = q.chapter_id", table: "chapters", param: "chapterId" },
  subchapter: { join: "join subchapters t on t.id = q.subchapter_id", table: "subchapters", param: "subchapterId" },
  topic: { join: "join topics t on t.id = q.topic_id", table: "topics", param: "topicId" },
  subtopic: { join: "join subtopics t on t.id = q.subtopic_id", table: "subtopics", param: "subtopicId" },
  concept: { join: "join question_concepts qc on qc.question_id = q.id join concepts t on t.id = qc.concept_id", table: "concepts", param: "conceptId" },
  formula: { join: "join question_formulas qf on qf.question_id = q.id join formulas t on t.id = qf.formula_id", table: "formulas", param: "formulaId" },
};

function ancestorPath(tax: Taxonomy, level: PerfLevel, node: TaxNode | undefined): string {
  if (!node || level === "formula") return "";
  const a = node.a;
  const parts = [
    level !== "subject" ? tax.get("subject", a.subject)?.name : undefined,
    level !== "chapter" && level !== "subject" && level !== "unit" ? tax.get("chapter", a.chapter)?.name : undefined,
    level === "topic" || level === "subtopic" || level === "concept" ? tax.get("subchapter", a.subchapter)?.name : undefined,
    level === "subtopic" || level === "concept" ? tax.get("topic", a.topic)?.name : undefined,
  ].filter(Boolean);
  return parts.join(" › ");
}

export async function getPerformance(userId: string, level: PerfLevel, limit = 200): Promise<PerfRow[]> {
  const tax = await loadTaxonomy();
  const cfg = PERF_SQL[level];
  const res = await db.execute(
    sql.raw(`
    select t.id, t.name,
      count(distinct q.id)::int as questions,
      count(e.id)::int as attempts,
      (count(*) filter (where e.rating = 'again'))::int as again,
      (count(*) filter (where e.rating = 'hard'))::int as hard,
      (count(*) filter (where e.rating = 'good'))::int as good,
      (count(*) filter (where e.rating = 'easy'))::int as easy,
      (count(*) filter (where e.rating = 'mastered'))::int as mastered,
      avg(e.time_spent_sec) filter (where e.time_spent_sec > 0) as avg_time
    from questions q
    ${cfg.join}
    left join revision_events e on e.question_id = q.id
    where q.user_id = '${userId.replace(/[^0-9a-f-]/gi, "")}' and q.processing_status = 'completed'
    group by t.id, t.name
    order by attempts desc, questions desc
    limit ${Math.floor(limit)}`),
  );
  const rows = res.rows as Record<string, unknown>[];
  return rows.map((r) => {
    const counts = { again: Number(r.again), hard: Number(r.hard), good: Number(r.good), easy: Number(r.easy), mastered: Number(r.mastered) };
    const attempts = Number(r.attempts);
    const accuracy = weightedAccuracy(counts);
    const node = level === "formula" ? undefined : tax.get(level, Number(r.id));
    const verdict: PerfRow["verdict"] = attempts < 3 || accuracy === null ? (attempts ? "developing" : "untested") : accuracy < 0.6 ? "weak" : accuracy >= 0.85 ? "strong" : "developing";
    return {
      id: Number(r.id),
      name: String(r.name),
      path: ancestorPath(tax, level, node),
      questions: Number(r.questions),
      attempts,
      ...counts,
      correct: counts.good + counts.easy + counts.mastered,
      accuracy,
      avgTime: r.avg_time == null ? null : Math.round(Number(r.avg_time)),
      verdict,
      href: `/questions?${cfg.param}=${r.id}`,
    };
  });
}

/* ------------------------------- dashboard ------------------------------ */
export async function getRevisionOverview(userId: string, tz: string) {
  const tax = await loadTaxonomy();
  const due = await db.execute(sql`
    select q.subject_id as subject_id, count(*)::int as n,
      (count(*) filter (where rs.due_at < ${startOfToday(tz)}))::int as overdue
    from revision_state rs join questions q on q.id = rs.question_id
    where rs.user_id = ${userId} and q.processing_status = 'completed' and rs.due_at < ${endOfToday(tz)}
    group by q.subject_id order by n desc`);
  const dueRows = (due.rows as { subject_id: number | null; n: number; overdue: number }[]).map((r) => ({
    subjectId: r.subject_id,
    subject: r.subject_id ? (tax.get("subject", r.subject_id)?.name ?? "Unclassified") : "Unclassified",
    n: Number(r.n),
    overdue: Number(r.overdue),
  }));
  const upcoming = await db.execute(sql`
    select ((rs.due_at at time zone ${tz}::text)::date)::text as day, count(*)::int as n
    from revision_state rs join questions q on q.id = rs.question_id
    where rs.user_id = ${userId} and q.processing_status = 'completed' and rs.due_at >= ${endOfToday(tz)} and rs.due_at < ${endOfToday(tz)} + interval '7 days'
    group by 1 order by 1`);
  const counts = await db.execute(sql`
    select
      (count(*) filter (where rs.status = 'mastered'))::int as mastered,
      (count(*) filter (where ${weakCond}))::int as weak,
      (count(*) filter (where rs.due_at < ${startOfToday(tz)}))::int as overdue,
      count(*)::int as total
    from revision_state rs join questions q on q.id = rs.question_id
    where rs.user_id = ${userId} and q.processing_status = 'completed'`);
  const streakRows = await db.execute(sql`
    select distinct ((created_at at time zone ${tz}::text)::date)::text as day from revision_events where user_id = ${userId} order by day desc limit 400`);
  const todayRow = await db.execute(sql`select ((now() at time zone ${tz}::text)::date)::text as today`);
  const today = String((todayRow.rows[0] as { today: string }).today);
  const days = new Set((streakRows.rows as { day: string }[]).map((r) => r.day));
  let streak = 0;
  const d = new Date(today + "T00:00:00Z");
  if (!days.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const c = counts.rows[0] as { mastered: number; weak: number; overdue: number; total: number };
  return {
    today,
    due: dueRows,
    totalDue: dueRows.reduce((a, r) => a + r.n, 0),
    overdue: Number(c.overdue),
    upcoming: (upcoming.rows as { day: string; n: number }[]).map((r) => ({ day: r.day, n: Number(r.n) })),
    mastered: Number(c.mastered),
    weak: Number(c.weak),
    total: Number(c.total),
    streak,
    revisedToday: days.has(today) ? Number(((await db.execute(sql`select count(*)::int as n from revision_events where user_id = ${userId} and created_at >= ${startOfToday(tz)}`)).rows[0] as { n: number }).n) : 0,
  };
}

export async function getSubjectProgress(userId: string) {
  const tax = await loadTaxonomy();
  const res = await db.execute(sql`
    select q.subject_id, count(*)::int as total,
      (count(*) filter (where rs.status = 'mastered'))::int as mastered,
      (count(*) filter (where rs.repetitions > 0))::int as revised
    from questions q left join revision_state rs on rs.question_id = q.id
    where q.user_id = ${userId} and q.processing_status = 'completed'
    group by q.subject_id order by total desc`);
  return (res.rows as { subject_id: number | null; total: number; mastered: number; revised: number }[]).map((r) => ({
    subject: r.subject_id ? (tax.get("subject", r.subject_id)?.name ?? "Unclassified") : "Unclassified",
    total: Number(r.total),
    mastered: Number(r.mastered),
    revised: Number(r.revised),
  }));
}

export async function getRecentQuestions(userId: string, limit = 6) {
  return db
    .select({ id: Q.id, text: Q.originalText, difficulty: Q.difficulty, subjectId: Q.subjectId, chapterId: Q.chapterId, status: Q.processingStatus, createdAt: Q.createdAt, needsReview: Q.needsReview })
    .from(Q)
    .where(and(eq(Q.userId, userId), ne(Q.processingStatus, "duplicate_pending")))
    .orderBy(desc(Q.createdAt))
    .limit(limit);
}

export async function getFormulasForRevision(userId: string, tz: string, limit = 5) {
  const res = await db.execute(sql`
    select f.id, f.name, f.latex, f.expression, count(distinct q.id)::int as n
    from formulas f
    join question_formulas qf on qf.formula_id = f.id
    join questions q on q.id = qf.question_id
    join revision_state rs on rs.question_id = q.id
    where f.user_id = ${userId} and (rs.due_at < ${endOfToday(tz)} or ${weakCond})
    group by f.id order by n desc, f.id desc limit ${limit}`);
  return res.rows as { id: number; name: string; latex: string; expression: string; n: number }[];
}

export async function getRecentMistakes(userId: string, limit = 5) {
  return db
    .select({ id: S.commonMistakes.id, title: S.commonMistakes.title, description: S.commonMistakes.description, tip: S.commonMistakes.preventionTip, category: S.commonMistakes.category, questionId: S.commonMistakes.questionId })
    .from(S.commonMistakes)
    .where(eq(S.commonMistakes.userId, userId))
    .orderBy(desc(S.commonMistakes.createdAt))
    .limit(limit);
}

export async function getOverallStats(userId: string) {
  const res = await db.execute(sql`
    select count(*)::int as attempts,
      (count(*) filter (where rating in ('good','easy','mastered')))::int as correct,
      (count(*) filter (where rating = 'hard'))::int as hard,
      (count(*) filter (where rating = 'again'))::int as again,
      coalesce(avg(time_spent_sec) filter (where time_spent_sec > 0), 0)::int as avg_time,
      coalesce(sum(hints_used), 0)::int as hints
    from revision_events where user_id = ${userId}`);
  const r = res.rows[0] as { attempts: number; correct: number; hard: number; again: number; avg_time: number; hints: number };
  const attempts = Number(r.attempts);
  return {
    attempts,
    correct: Number(r.correct),
    hard: Number(r.hard),
    again: Number(r.again),
    avgTime: Number(r.avg_time),
    hints: Number(r.hints),
    accuracy: attempts ? (Number(r.correct) + Number(r.hard) * 0.5) / attempts : null,
  };
}

export async function getActivity(userId: string, tz: string, days = 14) {
  const res = await db.execute(sql`
    select ((created_at at time zone ${tz}::text)::date)::text as day, count(*)::int as n,
      (count(*) filter (where rating in ('good','easy','mastered')))::int as ok
    from revision_events where user_id = ${userId} and created_at >= now() - ${days + " days"}::interval
    group by 1 order by 1`);
  return (res.rows as { day: string; n: number; ok: number }[]).map((r) => ({ day: r.day, n: Number(r.n), ok: Number(r.ok) }));
}

export async function getRecurringMistakes(userId: string, limit = 8) {
  const res = await db.execute(sql`
    select m.category, m.title, count(o.id)::int as times, min(m.question_id::text) as question_id
    from mistake_occurrences o join common_mistakes m on m.id = o.mistake_id
    where o.user_id = ${userId}
    group by m.category, m.title order by times desc limit ${limit}`);
  return res.rows as { category: string; title: string; times: number; question_id: string }[];
}

export async function activeProcessingCount(userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(Q)
    .where(and(eq(Q.userId, userId), inArray(Q.processingStatus, ["queued", "processing"])));
  return r.n;
}
