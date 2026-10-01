import { JEE_SEED } from "./jeeSeedText";
import { slugify } from "./text";
import type { Anc, AncKey, ClientTaxonomy, Level } from "./taxonomy-types";

/** Persisted taxonomy row (flat, parent/child). Everything else (ancestors, children) is derived. */
export interface NodeRow {
  id: number;
  level: Level;
  name: string;
  slug: string;
  description: string | null;
  orderIndex: number;
  active: boolean;
  parentLevel: Level | null;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

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

export const LEVELS: Level[] = ["curriculum", "exam", "class", "subject", "unit", "chapter", "subchapter", "topic", "subtopic", "concept", "question_type"];
const ANC_KEYS: AncKey[] = ["curriculum", "subject", "unit", "chapter", "subchapter", "topic", "subtopic"];

export function buildTaxonomy(rows: NodeRow[]): Taxonomy {
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, [] as TaxNode[]])) as Record<Level, TaxNode[]>;
  const map = new Map<string, TaxNode>();
  const sorted = [...rows].sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);
  // parents always come from a shallower level, so level order guarantees parents exist
  for (const level of LEVELS) {
    for (const r of sorted.filter((x) => x.level === level)) {
      const p = r.parentLevel && r.parentId ? map.get(`${r.parentLevel}:${r.parentId}`) : undefined;
      const a: Anc = {};
      if (p) {
        Object.assign(a, p.a);
        if ((ANC_KEYS as string[]).includes(p.level)) a[p.level as AncKey] = p.id;
      }
      const node: TaxNode = {
        id: r.id,
        level,
        name: r.name,
        slug: r.slug,
        description: r.description,
        orderIndex: r.orderIndex,
        active: r.active,
        parent: p ? { level: p.level, id: p.id } : null,
        a,
      };
      byLevel[level].push(node);
      map.set(`${level}:${r.id}`, node);
    }
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
  return {
    byLevel,
    get: (level, id) => (id ? map.get(`${level}:${id}`) : undefined),
    children: (level, id) => kids.get(`${level}:${id}`) ?? [],
  };
}

export function toClient(tax: Taxonomy, includeInactive = false): ClientTaxonomy {
  const out: ClientTaxonomy = {};
  for (const l of LEVELS) out[l] = tax.byLevel[l].filter((n) => includeInactive || n.active).map((n) => ({ id: n.id, name: n.name, a: n.a }));
  return out;
}

export interface Crumb {
  level: Level;
  id: number;
  name: string;
  /** query params that reproduce this prefix of the hierarchy in the question library */
  params: Record<string, string>;
}

export function breadcrumbFor(
  tax: Taxonomy,
  q: { classId: number | null; examId: number | null; subjectId: number | null; unitId: number | null; chapterId: number | null; subchapterId: number | null; topicId: number | null; subtopicId: number | null; conceptId: number | null },
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
  const params: Record<string, string> = {};
  for (const [level, key, id] of seq) {
    if (!id) continue;
    const node = tax.get(level, id);
    if (!node) continue;
    params[key] = String(id);
    crumbs.push({ level, id, name: node.name, params: { ...params } });
  }
  return crumbs;
}

export function pathText(
  tax: Taxonomy,
  ids: { subjectId?: number | null; chapterId?: number | null; subchapterId?: number | null; topicId?: number | null; subtopicId?: number | null; conceptId?: number | null },
): string {
  return [
    tax.get("subject", ids.subjectId)?.name,
    tax.get("chapter", ids.chapterId)?.name,
    tax.get("subchapter", ids.subchapterId)?.name,
    tax.get("topic", ids.topicId)?.name,
    tax.get("subtopic", ids.subtopicId)?.name,
    tax.get("concept", ids.conceptId)?.name,
  ]
    .filter(Boolean)
    .join(" › ");
}

/* ----------------------------- admin rules ----------------------------- */
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
export const allowedParents = (level: Level): Level[] => PARENT_RULES[level];

/* -------------------------------- seeding ------------------------------ */
const QUESTION_TYPES = [
  "Numerical", "Conceptual", "Theoretical", "Assertion Reason", "Multiple Choice", "Multiple Correct", "Integer Answer", "Match the Following",
  "True/False", "Diagram Based", "Graph Based", "Derivation", "Proof", "Reaction Based", "Calculation Heavy", "Application Based", "Mixed",
];
const RANK: Record<string, number> = { "#": 0, U: 1, C: 2, S: 3, T: 4, ST: 5, K: 6 };

export function seedRows(): { rows: NodeRow[]; nextId: number } {
  const now = new Date().toISOString();
  const rows: NodeRow[] = [];
  let id = 1;
  let order = 0;
  const add = (level: Level, name: string, parent: { level: Level; id: number } | null, description: string | null = null) => {
    const row: NodeRow = { id: id++, level, name, slug: slugify(name), description, orderIndex: order++, active: true, parentLevel: parent?.level ?? null, parentId: parent?.id ?? null, createdAt: now, updatedAt: now };
    rows.push(row);
    return row;
  };
  const jee = add("curriculum", "JEE", null, "Joint Entrance Examination (Main & Advanced)");
  const cbse = add("curriculum", "CBSE", null, "CBSE school curriculum (taxonomy can be added in the admin manager)");
  add("exam", "JEE Main", { level: "curriculum", id: jee.id });
  add("exam", "JEE Advanced", { level: "curriculum", id: jee.id });
  add("exam", "CBSE Board", { level: "curriculum", id: cbse.id });
  add("class", "Class 11", null);
  add("class", "Class 12", null);
  QUESTION_TYPES.forEach((n) => add("question_type", n, null));

  const st: Record<number, { level: Level; id: number } | undefined> = {};
  const LV: Record<string, Level> = { "#": "subject", U: "unit", C: "chapter", S: "subchapter", T: "topic", ST: "subtopic", K: "concept" };
  for (const raw of JEE_SEED.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(#|ST|U|C|S|T|K) (.+)$/);
    if (!m) throw new Error(`Bad seed line: ${line}`);
    const marker = m[1];
    const rank = RANK[marker];
    for (const name of m[2].split(";").map((x) => x.trim()).filter(Boolean)) {
      for (let r = rank + 1; r <= 6; r++) st[r] = undefined;
      let parent: { level: Level; id: number } | null;
      switch (marker) {
        case "#": parent = { level: "curriculum", id: jee.id }; break;
        case "U": parent = st[0] ?? null; break;
        case "C": parent = st[1] ?? st[0] ?? null; break;
        case "S": parent = st[2] ?? null; break;
        case "T": parent = st[3] ?? st[2] ?? null; break;
        case "ST": parent = st[4] ?? null; break;
        default: parent = st[5] ?? st[4] ?? st[2] ?? null;
      }
      const row = add(LV[marker], name, parent);
      st[rank] = { level: row.level, id: row.id };
    }
    if (m[2].includes(";") && (rank === 4 || rank === 5)) st[rank] = undefined;
  }
  return { rows, nextId: id };
}
