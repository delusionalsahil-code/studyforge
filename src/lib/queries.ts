import { interpretQuery, semanticIds } from "./search";
import { weightedAccuracy, type Rating } from "./srs";
import type { DB, Question, RevState, ReviewEvent } from "./store";
import type { Taxonomy } from "./taxonomy";
import { HIERARCHY, LEVEL_PARAM, type HierarchyLevel, type Level } from "./taxonomy-types";
import { normalizeName } from "./text";

export const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};
export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export const completed = (d: DB) => d.questions.filter((q) => q.processingStatus === "completed");
export const isDue = (rs: RevState | undefined) => !!rs && new Date(rs.dueAt) <= endOfToday();
export const isOverdue = (rs: RevState | undefined) => !!rs && new Date(rs.dueAt) < startOfToday();
export const isWeak = (rs: RevState | undefined) => !!rs && rs.status !== "mastered" && (rs.lastRating === "again" || rs.lastRating === "hard" || rs.ease < 2.1 || rs.lapses >= 2);
export const isMastered = (rs: RevState | undefined) => rs?.status === "mastered";

export function dueQuestions(d: DB, subjectId?: number | null): Question[] {
  return completed(d)
    .filter((q) => isDue(d.revision[q.id]) && (!subjectId || q.ids.subjectId === subjectId))
    .sort((a, b) => +new Date(d.revision[a.id].dueAt) - +new Date(d.revision[b.id].dueAt));
}
export function weakQuestions(d: DB, subjectId?: number | null): Question[] {
  return completed(d).filter((q) => isWeak(d.revision[q.id]) && (!subjectId || q.ids.subjectId === subjectId));
}

export function streak(reviews: ReviewEvent[]): number {
  const days = new Set(reviews.map((r) => dayKey(new Date(r.at))));
  let n = 0;
  const cur = new Date();
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1); // today not yet reviewed doesn't break the streak
  while (days.has(dayKey(cur))) {
    n++;
    cur.setDate(cur.getDate() - 1);
  }
  return n;
}

/* ------------------------------ library filtering ------------------------------ */
export type Params = Record<string, string>;
export const PAGE_SIZE = 20;

export interface FilterResult {
  rows: Question[];
  total: number;
  chips: string[];
  semantic: boolean;
}

const NODE_FIELD: Record<HierarchyLevel, (q: Question) => number | null> = {
  class: (q) => q.ids.classId,
  exam: (q) => q.ids.examId,
  subject: (q) => q.ids.subjectId,
  unit: (q) => q.ids.unitId,
  chapter: (q) => q.ids.chapterId,
  subchapter: (q) => q.ids.subchapterId,
  topic: (q) => q.ids.topicId,
  subtopic: (q) => q.ids.subtopicId,
  concept: (q) => q.ids.conceptId,
};

/** Pure, synchronous filter (text search is lexical; semantic ids can be supplied by the caller). */
export function filterQuestions(d: DB, tax: Taxonomy, p: Params, semantic: string[] | null = null): FilterResult {
  let rows = d.questions.filter((q) => q.processingStatus !== "duplicate_pending");
  const chips: string[] = [];
  for (const lv of HIERARCHY) {
    const v = Number(p[LEVEL_PARAM[lv]]);
    if (!v) continue;
    rows = rows.filter((q) => (lv === "concept" ? q.ids.conceptIds.includes(v) || q.ids.conceptId === v : NODE_FIELD[lv](q) === v));
  }
  if (p.type) rows = rows.filter((q) => q.ids.questionTypeId === Number(p.type));
  if (p.difficulty) rows = rows.filter((q) => q.difficulty === p.difficulty);
  if (p.formula) rows = rows.filter((q) => q.formulaIds.includes(p.formula));
  if (p.trick === "1") rows = rows.filter((q) => q.hasTrick);
  if (p.review === "1") rows = rows.filter((q) => q.needsReview);
  if (p.generated === "1") rows = rows.filter((q) => q.isAiGenerated);
  if (p.source) {
    const s = normalizeName(p.source);
    rows = rows.filter((q) => q.sourceType === p.source || normalizeName(q.sourceName ?? "").includes(s));
  }
  const apply = (status: string) => {
    if (status === "weak") rows = rows.filter((q) => isWeak(d.revision[q.id]));
    else if (status === "mastered") rows = rows.filter((q) => isMastered(d.revision[q.id]));
    else if (status === "due") rows = rows.filter((q) => isDue(d.revision[q.id]));
  };
  if (p.status) apply(p.status);

  let semanticUsed = false;
  const text = (p.q ?? "").trim();
  if (text) {
    const it = interpretQuery(text, tax);
    chips.push(...it.chips);
    if (it.difficulty) rows = rows.filter((q) => q.difficulty === it.difficulty);
    if (it.status) apply(it.status);
    if (it.trick) rows = rows.filter((q) => q.hasTrick);
    if (it.typeId) rows = rows.filter((q) => q.ids.questionTypeId === it.typeId);
    const nodeMatch = (q: Question) =>
      it.nodes.length === 0 ||
      it.nodes.some(({ level, ids }) => {
        const own = level === "concept" ? q.ids.conceptIds : [NODE_FIELD[level as HierarchyLevel]?.(q)];
        return own.some((x) => x != null && ids.includes(x));
      });
    const terms = it.terms.map((t) => normalizeName(t)).filter(Boolean);
    const lexical = (q: Question) => {
      if (!terms.length) return true;
      const hay = normalizeName(`${q.originalText} ${q.tags.join(" ")} ${q.ids.conceptIds.map((c) => tax.get("concept", c)?.name).join(" ")} ${q.formulaIds.map((f) => d.formulas.find((x) => x.id === f)?.name).join(" ")}`);
      return terms.every((t) => hay.includes(t));
    };
    if (semantic && semantic.length) {
      semanticUsed = true;
      const rank = new Map(semantic.map((id, i) => [id, i]));
      rows = rows
        .filter((q) => rank.has(q.id) || (it.nodes.length > 0 && nodeMatch(q)) || (terms.length > 0 && lexical(q)))
        .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    } else {
      rows = rows.filter((q) => (it.nodes.length ? nodeMatch(q) || lexical(q) : lexical(q)));
    }
  }
  const sort = p.sort ?? "new";
  if (!semanticUsed) {
    if (sort === "due") rows = [...rows].sort((a, b) => +new Date(d.revision[a.id]?.dueAt ?? 8.64e15) - +new Date(d.revision[b.id]?.dueAt ?? 8.64e15));
    else if (sort === "old") rows = [...rows].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    else rows = [...rows].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }
  return { rows, total: rows.length, chips, semantic: semanticUsed };
}

export { semanticIds };

/* -------------------------------- analytics -------------------------------- */
export interface Perf {
  key: string;
  label: string;
  questions: number;
  attempts: number;
  correct: number;
  hard: number;
  incorrect: number;
  accuracy: number | null;
  weak: boolean;
}

const emptyCounts = () => ({ again: 0, hard: 0, good: 0, easy: 0, mastered: 0 });

export function performanceBy(d: DB, groupOf: (q: Question) => { key: string; label: string }[]): Perf[] {
  const map = new Map<string, { label: string; qs: Set<string>; c: ReturnType<typeof emptyCounts> }>();
  const qById = new Map(d.questions.map((q) => [q.id, q]));
  for (const q of d.questions) {
    for (const g of groupOf(q)) {
      const e = map.get(g.key) ?? { label: g.label, qs: new Set<string>(), c: emptyCounts() };
      e.qs.add(q.id);
      map.set(g.key, e);
    }
  }
  for (const r of d.reviews) {
    const q = qById.get(r.questionId);
    if (!q) continue;
    for (const g of groupOf(q)) map.get(g.key)!.c[r.rating]++;
  }
  return [...map.entries()]
    .map(([key, e]) => {
      const attempts = e.c.again + e.c.hard + e.c.good + e.c.easy + e.c.mastered;
      const accuracy = weightedAccuracy(e.c);
      return { key, label: e.label, questions: e.qs.size, attempts, correct: e.c.good + e.c.easy + e.c.mastered, hard: e.c.hard, incorrect: e.c.again, accuracy, weak: accuracy !== null && attempts >= 2 && accuracy < 0.6 };
    })
    .sort((a, b) => (a.accuracy ?? 2) - (b.accuracy ?? 2) || b.attempts - a.attempts);
}

export function ratingCounts(reviews: ReviewEvent[]): Record<Rating, number> {
  return reviews.reduce((acc, r) => ((acc[r.rating]++, acc)), emptyCounts() as Record<Rating, number>);
}

export function recurringMistakes(d: DB) {
  // mistakes attached to questions the user struggled with, grouped by category
  const weakIds = new Set(completed(d).filter((q) => isWeak(d.revision[q.id])).map((q) => q.id));
  const map = new Map<string, { category: string; count: number; weakCount: number; examples: { questionId: string; title: string }[] }>();
  for (const q of completed(d)) {
    for (const m of q.mistakes) {
      const e = map.get(m.category) ?? { category: m.category, count: 0, weakCount: 0, examples: [] };
      e.count++;
      if (weakIds.has(q.id)) e.weakCount++;
      if (e.examples.length < 3) e.examples.push({ questionId: q.id, title: m.title });
      map.set(m.category, e);
    }
  }
  return [...map.values()].sort((a, b) => b.weakCount - a.weakCount || b.count - a.count);
}

export const levelLabelFor = (tax: Taxonomy, level: Level, id: number | null) => (id ? tax.get(level, id)?.name ?? "Unknown" : "Unclassified");
