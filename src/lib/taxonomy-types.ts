/** Client-safe taxonomy types + pure helpers (no server imports). */
export type Level =
  | "curriculum"
  | "exam"
  | "class"
  | "subject"
  | "unit"
  | "chapter"
  | "subchapter"
  | "topic"
  | "subtopic"
  | "concept"
  | "question_type";

export type AncKey = "curriculum" | "subject" | "unit" | "chapter" | "subchapter" | "topic" | "subtopic";
export type Anc = Partial<Record<AncKey, number>>;

export interface ClientNode {
  id: number;
  name: string;
  a: Anc;
}
export type ClientTaxonomy = Partial<Record<Level, ClientNode[]>>;

/** Classification hierarchy (order matters). */
export const HIERARCHY = ["class", "exam", "subject", "unit", "chapter", "subchapter", "topic", "subtopic", "concept"] as const;
export type HierarchyLevel = (typeof HIERARCHY)[number];

export const LEVEL_LABEL: Record<Level, string> = {
  curriculum: "Curriculum",
  exam: "Exam",
  class: "Class",
  subject: "Subject",
  unit: "Unit",
  chapter: "Chapter",
  subchapter: "Subchapter",
  topic: "Topic",
  subtopic: "Subtopic",
  concept: "Concept",
  question_type: "Question type",
};

export const LEVEL_PLURAL: Record<Level, string> = {
  curriculum: "Curricula",
  exam: "Exams",
  class: "Classes",
  subject: "Subjects",
  unit: "Units",
  chapter: "Chapters",
  subchapter: "Subchapters",
  topic: "Topics",
  subtopic: "Subtopics",
  concept: "Concepts",
  question_type: "Question types",
};

/** URL param / form key for each hierarchy level. */
export const LEVEL_PARAM: Record<HierarchyLevel, string> = {
  class: "classId",
  exam: "examId",
  subject: "subjectId",
  unit: "unitId",
  chapter: "chapterId",
  subchapter: "subchapterId",
  topic: "topicId",
  subtopic: "subtopicId",
  concept: "conceptId",
};

const KEY_RANK: Record<AncKey, number> = { curriculum: 0, subject: 1, unit: 2, chapter: 3, subchapter: 4, topic: 5, subtopic: 6 };
const LEVEL_RANK: Partial<Record<Level, number>> = {
  exam: 1,
  subject: 1,
  unit: 2,
  chapter: 3,
  subchapter: 4,
  topic: 5,
  subtopic: 6,
  concept: 7,
};

export type Selection = Partial<Record<HierarchyLevel, number | null | undefined>>;

/**
 * Dependent options: only nodes that sit under what's already selected
 * (Physics → only Physics chapters, chapter → only its subchapters, ...).
 */
export function optionsFor(tax: ClientTaxonomy, level: HierarchyLevel, sel: Selection): ClientNode[] {
  const all = tax[level] ?? [];
  if (level === "class") return all;
  const find = (l: Level, id?: number | null) => (id ? tax[l]?.find((n) => n.id === id) : undefined);
  const want: Anc = {};
  const curriculum = find("exam", sel.exam)?.a.curriculum ?? find("subject", sel.subject)?.a.curriculum;
  if (curriculum) want.curriculum = curriculum;
  for (const k of ["subject", "unit", "chapter", "subchapter", "topic", "subtopic"] as const) {
    const v = sel[k];
    if (v) want[k] = v;
  }
  const rank = LEVEL_RANK[level] ?? 0;
  return all.filter((n) => {
    for (const k of Object.keys(want) as AncKey[]) {
      if (KEY_RANK[k] >= rank) continue;
      if (n.a[k] !== want[k]) return false;
    }
    return true;
  });
}

/** Clears every selection deeper than `level`. */
export function clearBelow(sel: Selection, level: HierarchyLevel): Selection {
  const idx = HIERARCHY.indexOf(level);
  const out: Selection = { ...sel };
  // class and exam are siblings at the top; only clear levels below subject when those change
  const start = level === "class" ? HIERARCHY.length : level === "exam" ? HIERARCHY.indexOf("subject") : idx + 1;
  for (let i = start; i < HIERARCHY.length; i++) {
    if (level === "exam" && HIERARCHY[i] === "subject") continue; // subject may stay if still valid; handled by caller
    out[HIERARCHY[i]] = null;
  }
  return out;
}

export const DIFFICULTIES = ["Easy", "Medium", "Hard", "Very Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
