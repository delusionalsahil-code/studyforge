import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { ApiError } from "@/lib/api";
import { slugify } from "@/lib/text";
import type { Anc, ClientTaxonomy, Level } from "@/lib/taxonomy-types";

export interface TaxNode {
  id: number;
  level: Level;
  name: string;
  slug: string;
  description: string | null;
  orderIndex: number;
  active: boolean;
  parent: { level: Level; id: number } | null;
  a: Anc;
}

export interface Taxonomy {
  byLevel: Record<Level, TaxNode[]>;
  get(level: Level, id: number | null | undefined): TaxNode | undefined;
  children(level: Level, id: number): TaxNode[];
}

const LEVELS: Level[] = ["curriculum", "exam", "class", "subject", "unit", "chapter", "subchapter", "topic", "subtopic", "concept", "question_type"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TABLE: Record<Level, any> = {
  curriculum: S.curricula,
  exam: S.exams,
  class: S.classes,
  subject: S.subjects,
  unit: S.units,
  chapter: S.chapters,
  subchapter: S.subchapters,
  topic: S.topics,
  subtopic: S.subtopics,
  concept: S.concepts,
  question_type: S.questionTypes,
};

let cache: { at: number; data: Taxonomy } | null = null;
let seeding: Promise<void> | null = null;

export function invalidateTaxonomy() {
  cache = null;
}

async function ensureSeeded() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(S.curricula);
  if (n > 0) return;
  seeding ??= import("@/lib/taxonomy-seed")
    .then((m) => m.seedTaxonomy())
    .finally(() => {
      seeding = null;
    });
  await seeding;
}

export async function loadTaxonomy(force = false): Promise<Taxonomy> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.data;
  await ensureSeeded();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<Level, any[]> = {} as never;
  await Promise.all(
    LEVELS.map(async (l) => {
      const t = TABLE[l];
      rows[l] = await db.select().from(t).orderBy(t.orderIndex, t.id);
    }),
  );

  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, [] as TaxNode[]])) as Record<Level, TaxNode[]>;
  const map = new Map<string, TaxNode>();
  const add = (level: Level, r: { id: number; name: string; slug: string; description: string | null; orderIndex: number; active: boolean }, parent: TaxNode["parent"], a: Anc) => {
    const node: TaxNode = { id: r.id, level, name: r.name, slug: r.slug, description: r.description, orderIndex: r.orderIndex, active: r.active, parent, a };
    byLevel[level].push(node);
    map.set(`${level}:${r.id}`, node);
    return node;
  };
  const g = (level: Level, id: number | null | undefined) => (id ? map.get(`${level}:${id}`) : undefined);

  for (const r of rows.curriculum) add("curriculum", r, null, {});
  for (const r of rows.class) add("class", r, null, {});
  for (const r of rows.question_type) add("question_type", r, null, {});
  for (const r of rows.exam) add("exam", r, { level: "curriculum", id: r.parentId }, { curriculum: r.parentId });
  for (const r of rows.subject) add("subject", r, { level: "curriculum", id: r.parentId }, { curriculum: r.parentId });
  for (const r of rows.unit) {
    const s = g("subject", r.parentId);
    add("unit", r, { level: "subject", id: r.parentId }, { curriculum: s?.a.curriculum, subject: r.parentId });
  }
  for (const r of rows.chapter) {
    const s = g("subject", r.subjectId);
    add("chapter", r, r.parentId ? { level: "unit", id: r.parentId } : { level: "subject", id: r.subjectId }, {
      curriculum: s?.a.curriculum,
      subject: r.subjectId,
      ...(r.parentId ? { unit: r.parentId } : {}),
    });
  }
  const chapterAnc = (chapterId: number): Anc => {
    const c = g("chapter", chapterId);
    return { ...(c?.a ?? {}), chapter: chapterId };
  };
  for (const r of rows.subchapter) add("subchapter", r, { level: "chapter", id: r.parentId }, chapterAnc(r.parentId));
  for (const r of rows.topic) {
    add("topic", r, r.parentId ? { level: "subchapter", id: r.parentId } : { level: "chapter", id: r.chapterId }, {
      ...chapterAnc(r.chapterId),
      ...(r.parentId ? { subchapter: r.parentId } : {}),
    });
  }
  for (const r of rows.subtopic) {
    const t = g("topic", r.parentId);
    add("subtopic", r, { level: "topic", id: r.parentId }, { ...(t?.a ?? chapterAnc(r.chapterId)), topic: r.parentId });
  }
  for (const r of rows.concept) {
    const base: Anc = chapterAnc(r.chapterId);
    let anc: Anc = base;
    let parent: TaxNode["parent"] = { level: "chapter", id: r.chapterId };
    if (r.subtopicId) {
      const st = g("subtopic", r.subtopicId);
      anc = { ...(st?.a ?? base), subtopic: r.subtopicId };
      parent = { level: "subtopic", id: r.subtopicId };
    } else if (r.topicId) {
      const t = g("topic", r.topicId);
      anc = { ...(t?.a ?? base), topic: r.topicId };
      parent = { level: "topic", id: r.topicId };
    }
    add("concept", r, parent, anc);
  }

  const kids = new Map<string, TaxNode[]>();
  for (const l of LEVELS) {
    for (const n of byLevel[l]) {
      if (!n.parent) continue;
      const k = `${n.parent.level}:${n.parent.id}`;
      const arr = kids.get(k) ?? [];
      arr.push(n);
      kids.set(k, arr);
    }
  }

  const data: Taxonomy = {
    byLevel,
    get: (level, id) => g(level, id),
    children: (level, id) => kids.get(`${level}:${id}`) ?? [],
  };
  cache = { at: Date.now(), data };
  return data;
}

/** Slim, active-only payload for client components (dependent filters/selects). */
export function toClient(tax: Taxonomy, includeInactive = false): ClientTaxonomy {
  const out: ClientTaxonomy = {};
  for (const l of LEVELS) {
    out[l] = tax.byLevel[l].filter((n) => includeInactive || n.active).map((n) => ({ id: n.id, name: n.name, a: n.a }));
  }
  return out;
}

/** Ordered path (class → ... → concept) of a question's classification, for breadcrumbs. */
export interface Crumb {
  level: Level;
  id: number;
  name: string;
  href: string;
}
export function breadcrumbFor(
  tax: Taxonomy,
  q: {
    classId: number | null;
    examId: number | null;
    subjectId: number | null;
    unitId: number | null;
    chapterId: number | null;
    subchapterId: number | null;
    topicId: number | null;
    subtopicId: number | null;
    conceptId: number | null;
  },
): Crumb[] {
  const seq: [Level, string, number | null][] = [
    ["class", "classId", q.classId],
    ["exam", "examId", q.examId],
    ["subject", "subjectId", q.subjectId],
    ["unit", "unitId", q.unitId],
    ["chapter", "chapterId", q.chapterId],
    ["subchapter", "subchapterId", q.subchapterId],
    ["topic", "topicId", q.topicId],
    ["subtopic", "subtopicId", q.subtopicId],
    ["concept", "conceptId", q.conceptId],
  ];
  const crumbs: Crumb[] = [];
  const params: string[] = [];
  for (const [level, key, id] of seq) {
    if (!id) continue;
    const node = tax.get(level, id);
    if (!node) continue;
    params.push(`${key}=${id}`);
    crumbs.push({ level, id, name: node.name, href: `/questions?${params.join("&")}` });
  }
  return crumbs;
}

/** Full text path used on cards (e.g. "Physics › Current Electricity › Electrical Resistance"). */
export function pathText(tax: Taxonomy, ids: { subjectId?: number | null; chapterId?: number | null; subchapterId?: number | null; topicId?: number | null; subtopicId?: number | null; conceptId?: number | null }): string {
  const parts = [
    tax.get("subject", ids.subjectId)?.name,
    tax.get("chapter", ids.chapterId)?.name,
    tax.get("subchapter", ids.subchapterId)?.name,
    tax.get("topic", ids.topicId)?.name,
    tax.get("subtopic", ids.subtopicId)?.name,
    tax.get("concept", ids.conceptId)?.name,
  ].filter(Boolean);
  return parts.join(" › ");
}

/* ----------------------------- admin operations ----------------------------- */

const PARENT_RULES: Record<Level, Level[]> = {
  curriculum: [],
  class: [],
  question_type: [],
  exam: ["curriculum"],
  subject: ["curriculum"],
  unit: ["subject"],
  chapter: ["subject", "unit"],
  subchapter: ["chapter"],
  topic: ["chapter", "subchapter"],
  subtopic: ["topic"],
  concept: ["chapter", "topic", "subtopic"],
};

export function allowedParents(level: Level): Level[] {
  return PARENT_RULES[level];
}

export async function createNode(input: {
  level: Level;
  parent?: { level: Level; id: number } | null;
  name: string;
  description?: string | null;
  orderIndex?: number;
}) {
  const tax = await loadTaxonomy(true);
  const { level } = input;
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "Name is required", "VALIDATION");
  const allowed = PARENT_RULES[level];
  let parent: TaxNode | undefined;
  if (allowed.length) {
    parent = input.parent ? tax.get(input.parent.level, input.parent.id) : undefined;
    if (!parent || !allowed.includes(parent.level)) {
      throw new ApiError(400, `A ${level.replace("_", " ")} must sit under: ${allowed.join(" or ")}.`, "VALIDATION");
    }
  }
  const slug = slugify(name);
  if (!slug) throw new ApiError(400, "Name must contain letters or digits", "VALIDATION");
  const siblings = parent ? tax.children(parent.level, parent.id).filter((c) => c.level === level) : tax.byLevel[level];
  const base = {
    name,
    slug,
    description: input.description?.trim() || null,
    orderIndex: input.orderIndex ?? (siblings.length ? Math.max(...siblings.map((s) => s.orderIndex)) + 1 : 0),
  };
  const a = parent?.a ?? {};
  let values: Record<string, unknown>;
  switch (level) {
    case "curriculum":
    case "class":
    case "question_type":
      values = base;
      break;
    case "exam":
    case "subject":
    case "unit":
    case "subchapter":
      values = { ...base, parentId: parent!.id };
      break;
    case "chapter":
      values = parent!.level === "unit" ? { ...base, subjectId: parent!.a.subject, parentId: parent!.id } : { ...base, subjectId: parent!.id };
      break;
    case "topic":
      values = parent!.level === "subchapter" ? { ...base, chapterId: parent!.a.chapter, parentId: parent!.id } : { ...base, chapterId: parent!.id };
      break;
    case "subtopic":
      values = { ...base, parentId: parent!.id, chapterId: a.chapter };
      break;
    case "concept":
      values =
        parent!.level === "subtopic"
          ? { ...base, chapterId: a.chapter, topicId: a.topic, subtopicId: parent!.id }
          : parent!.level === "topic"
            ? { ...base, chapterId: a.chapter, topicId: parent!.id }
            : { ...base, chapterId: parent!.id };
      break;
  }
  try {
    const [row] = (await db.insert(TABLE[level]).values(values).returning()) as unknown as Record<string, unknown>[];
    invalidateTaxonomy();
    return row;
  } catch (e) {
    if (isPgError(e, "23505")) throw new ApiError(409, `"${name}" already exists under this parent.`, "CONFLICT");
    throw e;
  }
}

export async function updateNode(level: Level, id: number, patch: { name?: string; description?: string | null; orderIndex?: number; active?: boolean }) {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new ApiError(400, "Name is required", "VALIDATION");
    set.name = name;
    set.slug = slugify(name);
  }
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.orderIndex !== undefined) set.orderIndex = patch.orderIndex;
  if (patch.active !== undefined) set.active = patch.active;
  if (!Object.keys(set).length) throw new ApiError(400, "Nothing to update", "VALIDATION");
  try {
    const rows = (await db.update(TABLE[level]).set(set).where(eq(TABLE[level].id, id)).returning()) as unknown as Record<string, unknown>[];
    if (!rows.length) throw new ApiError(404, "Taxonomy entry not found", "NOT_FOUND");
    invalidateTaxonomy();
    return rows[0];
  } catch (e) {
    if (isPgError(e, "23505")) throw new ApiError(409, "Another entry with that name already exists here.", "CONFLICT");
    throw e;
  }
}

export async function deleteNode(level: Level, id: number) {
  try {
    const rows = (await db.delete(TABLE[level]).where(eq(TABLE[level].id, id)).returning()) as unknown as unknown[];
    if (!rows.length) throw new ApiError(404, "Taxonomy entry not found", "NOT_FOUND");
    invalidateTaxonomy();
  } catch (e) {
    if (isPgError(e, "23503")) {
      throw new ApiError(409, "This entry (or something beneath it) is used by saved questions or formulas. Deactivate it instead of deleting.", "IN_USE");
    }
    throw e;
  }
}

function isPgError(e: unknown, code: string): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 3 && cur; i++) {
    if (typeof cur === "object" && (cur as { code?: string }).code === code) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}
