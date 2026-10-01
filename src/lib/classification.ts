import { ApiError } from "./errors";
import { clamp01, nameSimilarity, normalizeName } from "./text";
import type { TaxNode, Taxonomy } from "./taxonomy";
import type { Difficulty } from "./taxonomy-types";

export const CONFIDENCE_THRESHOLD = 0.6;

export interface ClassIds {
  classId: number | null;
  examId: number | null;
  subjectId: number | null;
  unitId: number | null;
  chapterId: number | null;
  subchapterId: number | null;
  topicId: number | null;
  subtopicId: number | null;
  conceptId: number | null; // primary concept
  conceptIds: number[]; // all concepts (includes primary)
  questionTypeId: number | null;
}

export const EMPTY_IDS: ClassIds = {
  classId: null,
  examId: null,
  subjectId: null,
  unitId: null,
  chapterId: null,
  subchapterId: null,
  topicId: null,
  subtopicId: null,
  conceptId: null,
  conceptIds: [],
  questionTypeId: null,
};

export interface Stage1Raw {
  exam: string;
  class: string;
  subject: string;
  unit: string;
  chapter: string;
  confidence: Record<string, number>;
}
export interface Stage2Raw {
  subchapter: string;
  topic: string;
  subtopic: string;
  concepts: string[];
  question_type: string;
  difficulty: Difficulty;
  difficulty_confidence: number;
  tags: string[];
  confidence: Record<string, number>;
  suggestions: Record<string, string | string[]>;
}

export interface Resolved {
  ids: ClassIds;
  difficulty: Difficulty | null;
  difficultyConfidence: number | null;
  tags: string[];
  levelConfidence: Record<string, number>;
  classificationConfidence: number;
  needsReview: boolean;
  reasons: string[];
  suggestions: Record<string, string[]>;
}

const UNKNOWN = new Set(["", "unknown", "n/a", "na", "none", "null", "needs review", "unknown / needs review", "not applicable", "-"]);
export const isUnknown = (s: string | null | undefined) => UNKNOWN.has(normalizeName(s ?? ""));

/** Match free text to canonical taxonomy entries. Never invents a spelling: returns the canonical node or null. */
export function matchNode(candidates: TaxNode[], name: string): TaxNode | null {
  if (isUnknown(name)) return null;
  const n = normalizeName(name);
  const exact = candidates.find((c) => normalizeName(c.name) === n || c.slug === n.replace(/ /g, "-"));
  if (exact) return exact;
  let best: TaxNode | null = null;
  let bestScore = 0;
  let second = 0;
  for (const c of candidates) {
    const s = nameSimilarity(c.name, name);
    if (s > bestScore) {
      second = bestScore;
      bestScore = s;
      best = c;
    } else if (s > second) second = s;
  }
  // Fuzzy matches (typos, "Current Elect.", pluralisation) must be clearly better than any alternative.
  return best && bestScore >= 0.82 && bestScore - second >= 0.04 ? best : null;
}

const active = (tax: Taxonomy, level: Parameters<Taxonomy["children"]>[0]) => tax.byLevel[level].filter((n) => n.active);

export interface Stage1Resolved {
  classNode: TaxNode | null;
  exam: TaxNode | null;
  subject: TaxNode | null;
  unit: TaxNode | null;
  chapter: TaxNode | null;
  conf: Record<string, number>;
  reasons: string[];
  suggestions: Record<string, string[]>;
}

export function resolveStage1(tax: Taxonomy, raw: Stage1Raw): Stage1Resolved {
  const reasons: string[] = [];
  const suggestions: Record<string, string[]> = {};
  const conf: Record<string, number> = {};

  const pick = (key: string, label: string, cands: TaxNode[], name: string): TaxNode | null => {
    const node = matchNode(cands, name);
    const c = clamp01(raw.confidence[key] ?? 0.5);
    if (!node) {
      conf[key] = 0;
      if (!isUnknown(name)) {
        suggestions[key] = [name];
        reasons.push(`${label} "${name}" does not exist in the taxonomy`);
      } else if (cands.length) reasons.push(`${label} could not be determined`);
      return null;
    }
    conf[key] = c;
    if (c < CONFIDENCE_THRESHOLD) reasons.push(`Low confidence for ${label.toLowerCase()} (${Math.round(c * 100)}%)`);
    return node;
  };

  const classNode = pick("class", "Class", active(tax, "class"), raw.class);
  const exam = pick("exam", "Exam", active(tax, "exam"), raw.exam);
  const subjects = active(tax, "subject").filter((s) => !exam || s.a.curriculum === exam.a.curriculum);
  const subject = pick("subject", "Subject", subjects, raw.subject);

  let unit: TaxNode | null = null;
  let chapter: TaxNode | null = null;
  if (subject) {
    const units = active(tax, "unit").filter((u) => u.a.subject === subject.id);
    unit = matchNode(units, raw.unit);
    conf.unit = unit ? clamp01(raw.confidence.unit ?? 0.5) : 0;
    const chapters = active(tax, "chapter").filter((c) => c.a.subject === subject.id);
    chapter = (unit ? matchNode(chapters.filter((c) => c.a.unit === unit!.id), raw.chapter) : null) ?? matchNode(chapters, raw.chapter);
    if (chapter) {
      conf.chapter = clamp01(raw.confidence.chapter ?? 0.5);
      if (chapter.a.unit && chapter.a.unit !== unit?.id) {
        unit = tax.get("unit", chapter.a.unit) ?? null;
        conf.unit = Math.min(conf.unit || 0.7, 0.7);
        if (raw.unit && !isUnknown(raw.unit) && normalizeName(raw.unit) !== normalizeName(unit?.name ?? "")) {
          reasons.push(`Unit corrected to "${unit?.name}" to match chapter "${chapter.name}"`);
        }
      }
      if (conf.chapter < CONFIDENCE_THRESHOLD) reasons.push(`Low confidence for chapter (${Math.round(conf.chapter * 100)}%)`);
    } else {
      conf.chapter = 0;
      // Impossible combination check: chapter exists, but under another subject?
      const other = active(tax, "chapter").find((c) => c.a.subject !== subject.id && matchNode([c], raw.chapter));
      if (other) {
        const otherSubject = tax.get("subject", other.a.subject);
        reasons.push(`Rejected: chapter "${other.name}" belongs to ${otherSubject?.name}, not ${subject.name}`);
      } else if (!isUnknown(raw.chapter)) {
        suggestions.chapter = [raw.chapter];
        reasons.push(`Chapter "${raw.chapter}" does not exist in the taxonomy`);
      } else reasons.push("Chapter could not be determined");
    }
  } else if (!isUnknown(raw.chapter)) {
    suggestions.chapter = [raw.chapter];
  }
  return { classNode, exam, subject, unit, chapter, conf, reasons, suggestions };
}

export function resolveStage2(tax: Taxonomy, s1: Stage1Resolved, raw: Stage2Raw | null): Resolved {
  const ids: ClassIds = {
    ...EMPTY_IDS,
    classId: s1.classNode?.id ?? null,
    examId: s1.exam?.id ?? null,
    subjectId: s1.subject?.id ?? null,
    unitId: s1.unit?.id ?? null,
    chapterId: s1.chapter?.id ?? null,
  };
  const reasons = [...s1.reasons];
  const suggestions = { ...s1.suggestions };
  const conf: Record<string, number> = { ...s1.conf };
  let difficulty: Difficulty | null = null;
  let difficultyConfidence: number | null = null;
  let tags: string[] = [];

  const chapter = s1.chapter;
  if (raw && chapter) {
    const c = (k: string) => clamp01(raw.confidence[k] ?? 0.5);
    const lowCheck = (k: string, label: string) => {
      if (conf[k] < CONFIDENCE_THRESHOLD) reasons.push(`Low confidence for ${label} (${Math.round(conf[k] * 100)}%)`);
    };
    const unmatched = (k: string, label: string, name: string) => {
      conf[k] = 0;
      if (!isUnknown(name)) {
        suggestions[k] = [...(suggestions[k] ?? []), name];
        reasons.push(`${label} "${name}" does not exist under this chapter in the taxonomy`);
      }
    };

    const subchapters = active(tax, "subchapter").filter((n) => n.a.chapter === chapter.id);
    const topicsAll = active(tax, "topic").filter((n) => n.a.chapter === chapter.id);
    let sub = matchNode(subchapters, raw.subchapter);
    let topic: TaxNode | null = null;
    const topicRestricted = sub ? topicsAll.filter((t) => t.a.subchapter === sub!.id) : topicsAll;
    topic = matchNode(topicRestricted, raw.topic) ?? (sub ? matchNode(topicsAll, raw.topic) : null);
    if (topic?.a.subchapter && topic.a.subchapter !== sub?.id) {
      const real = tax.get("subchapter", topic.a.subchapter) ?? null;
      if (sub) reasons.push(`Subchapter corrected to "${real?.name}" to match topic "${topic.name}"`);
      sub = real;
      conf.subchapter = Math.min(c("subchapter") || 0.7, c("topic"), 0.75);
    } else if (sub) conf.subchapter = c("subchapter");
    if (!sub) {
      if (subchapters.length) {
        // chapters that have subchapters, but topic sits directly under chapter -> fine; otherwise unknown
        conf.subchapter = 0;
        if (!isUnknown(raw.subchapter)) unmatched("subchapter", "Subchapter", raw.subchapter);
        else if (!topic || topic.a.subchapter) reasons.push("Subchapter could not be determined");
      }
    } else lowCheck("subchapter", "subchapter");

    if (topic) {
      conf.topic = c("topic");
      lowCheck("topic", "topic");
    } else {
      conf.topic = 0;
      if (!isUnknown(raw.topic)) unmatched("topic", "Topic", raw.topic);
      else if (topicsAll.length) reasons.push("Topic could not be determined");
    }

    const subtopics = active(tax, "subtopic").filter((n) => (topic ? n.a.topic === topic.id : n.a.chapter === chapter.id));
    let subtopic = matchNode(subtopics, raw.subtopic);
    if (subtopic && !topic) {
      topic = tax.get("topic", subtopic.a.topic) ?? null;
      if (topic) conf.topic = Math.min(c("subtopic"), 0.7);
      if (topic?.a.subchapter && !sub) sub = tax.get("subchapter", topic.a.subchapter) ?? null;
    }
    if (subtopic) {
      conf.subtopic = c("subtopic");
      lowCheck("subtopic", "subtopic");
    } else {
      conf.subtopic = 0;
      if (!isUnknown(raw.subtopic)) unmatched("subtopic", "Subtopic", raw.subtopic);
      subtopic = null;
    }

    // concepts: any concept from this chapter (a question can draw on several topics)
    const conceptPool = active(tax, "concept").filter((n) => n.a.chapter === chapter.id);
    const matched: TaxNode[] = [];
    for (const name of raw.concepts) {
      const node = matchNode(conceptPool, name);
      if (node && !matched.includes(node)) matched.push(node);
      else if (!node && !isUnknown(name)) suggestions.concepts = [...(suggestions.concepts ?? []), name];
    }
    const compatible = (n: TaxNode) => (!n.a.subtopic || !subtopic || n.a.subtopic === subtopic.id) && (!n.a.topic || !topic || n.a.topic === topic.id);
    const primary = matched.find(compatible) ?? null;
    if (matched.length && !primary) {
      reasons.push(`Concept "${matched[0].name}" belongs to a different topic/subtopic than the one chosen — kept only as a related concept`);
    }
    if (primary) {
      conf.concept = c("concept");
      lowCheck("concept", "concept");
      if (!topic && primary.a.topic) {
        topic = tax.get("topic", primary.a.topic) ?? null;
        if (topic) {
          conf.topic = Math.min(conf.concept, 0.7);
          if (topic.a.subchapter && !sub) sub = tax.get("subchapter", topic.a.subchapter) ?? null;
        }
      }
    } else conf.concept = 0;

    ids.subchapterId = sub?.id ?? null;
    ids.topicId = topic?.id ?? null;
    ids.subtopicId = subtopic?.id ?? null;
    ids.conceptId = primary?.id ?? null;
    ids.conceptIds = matched.map((m) => m.id);

    const qt = matchNode(active(tax, "question_type"), raw.question_type);
    ids.questionTypeId = qt?.id ?? null;
    conf.question_type = qt ? c("question_type") : 0;
    if (!qt) reasons.push(isUnknown(raw.question_type) ? "Question type could not be determined" : `Question type "${raw.question_type}" is not recognised`);

    difficulty = raw.difficulty;
    difficultyConfidence = clamp01(raw.difficulty_confidence);
    conf.difficulty = difficultyConfidence;
    tags = raw.tags;
    for (const [k, v] of Object.entries(raw.suggestions ?? {})) {
      const arr = (Array.isArray(v) ? v : [v]).filter((x) => x && !isUnknown(x));
      if (arr.length && !suggestions[k]) suggestions[k] = arr;
    }
  }

  // Final safety net: parent-child compatibility of the full combination.
  // On conflict, drop only the deepest offending levels and keep the valid upper hierarchy.
  let finalIds = ids;
  const attempts: [string, (x: ClassIds) => ClassIds][] = [
    ["", (x) => x],
    ["concepts", (x) => ({ ...x, conceptId: null, conceptIds: [] })],
    ["subtopic", (x) => ({ ...x, conceptId: null, conceptIds: [], subtopicId: null })],
    ["topic", (x) => ({ ...x, conceptId: null, conceptIds: [], subtopicId: null, topicId: null })],
    ["subchapter", (x) => ({ ...x, conceptId: null, conceptIds: [], subtopicId: null, topicId: null, subchapterId: null })],
    ["chapter", (x) => ({ ...EMPTY_IDS, classId: x.classId, examId: x.examId, subjectId: x.subjectId, questionTypeId: x.questionTypeId })],
  ];
  let lastError = "";
  let resolvedOk = false;
  for (const [dropped, fn] of attempts) {
    const check = validateIds(tax, fn(ids));
    if (check.ok) {
      finalIds = check.ids;
      resolvedOk = true;
      if (dropped) reasons.push(`Rejected impossible combination (${lastError}); the ${dropped} level was left unknown`);
      break;
    }
    if (!lastError) lastError = check.error;
  }
  if (!resolvedOk) finalIds = { ...EMPTY_IDS, classId: ids.classId, examId: ids.examId, subjectId: ids.subjectId };
  for (const [lvl, dropped] of [["concept", !finalIds.conceptId && ids.conceptId], ["subtopic", !finalIds.subtopicId && ids.subtopicId], ["topic", !finalIds.topicId && ids.topicId], ["subchapter", !finalIds.subchapterId && ids.subchapterId]] as const) {
    if (dropped) conf[lvl] = 0;
  }

  const present = ["class", "exam", "subject", "chapter", "subchapter", "topic", "subtopic", "concept"].filter((k) => (conf[k] ?? 0) > 0);
  const classificationConfidence = present.length ? present.reduce((a, k) => a + conf[k], 0) / present.length : 0;
  const uniqueReasons = [...new Set(reasons)];
  return {
    ids: finalIds,
    difficulty,
    difficultyConfidence,
    tags,
    levelConfidence: conf,
    classificationConfidence,
    needsReview: uniqueReasons.length > 0 || !finalIds.chapterId,
    reasons: uniqueReasons,
    suggestions,
  };
}

/**
 * Validates that every selected node exists, is active, and is compatible with its parents.
 * Missing ancestors are filled in from the deepest selected node.
 */
export function validateIds(tax: Taxonomy, input: ClassIds, opts: { allowInactive?: boolean } = {}): { ok: true; ids: ClassIds } | { ok: false; error: string } {
  const ids: ClassIds = { ...input, conceptIds: [...input.conceptIds] };
  const get = (level: Parameters<Taxonomy["get"]>[0], id: number | null) => {
    if (!id) return null;
    const n = tax.get(level, id);
    if (!n) throw new Error(`Unknown ${level} id ${id}`);
    if (!n.active && !opts.allowInactive) throw new Error(`${n.name} is inactive`);
    return n;
  };
  try {
    const cls = get("class", ids.classId);
    const exam = get("exam", ids.examId);
    let subject = get("subject", ids.subjectId);
    let unit = get("unit", ids.unitId);
    const chapter = get("chapter", ids.chapterId);
    let sub = get("subchapter", ids.subchapterId);
    let topic = get("topic", ids.topicId);
    const subtopic = get("subtopic", ids.subtopicId);
    get("question_type", ids.questionTypeId);
    void cls;

    // fill upwards
    if (subtopic) {
      const t = tax.get("topic", subtopic.a.topic);
      if (topic && topic.id !== subtopic.a.topic) throw new Error(`subtopic "${subtopic.name}" does not belong to topic "${topic.name}"`);
      topic = t ?? null;
      ids.topicId = topic?.id ?? null;
      if (!ids.chapterId) ids.chapterId = subtopic.a.chapter ?? null;
    }
    if (topic) {
      if (chapter && topic.a.chapter !== chapter.id) throw new Error(`topic "${topic.name}" does not belong to chapter "${chapter.name}"`);
      if (topic.a.subchapter) {
        if (sub && sub.id !== topic.a.subchapter) throw new Error(`topic "${topic.name}" does not belong to subchapter "${sub.name}"`);
        sub = tax.get("subchapter", topic.a.subchapter) ?? null;
        ids.subchapterId = sub?.id ?? null;
      }
      ids.chapterId = topic.a.chapter ?? ids.chapterId;
    }
    const chapterNode = tax.get("chapter", ids.chapterId);
    if (sub) {
      if (chapterNode && sub.a.chapter !== chapterNode.id) throw new Error(`subchapter "${sub.name}" does not belong to chapter "${chapterNode.name}"`);
      ids.chapterId = sub.a.chapter ?? ids.chapterId;
    }
    const chapterFinal = tax.get("chapter", ids.chapterId);
    if (chapterFinal) {
      if (unit && chapterFinal.a.unit !== unit.id) throw new Error(`chapter "${chapterFinal.name}" does not belong to unit "${unit.name}"`);
      unit = chapterFinal.a.unit ? (tax.get("unit", chapterFinal.a.unit) ?? null) : null;
      ids.unitId = unit?.id ?? null;
      if (subject && chapterFinal.a.subject !== subject.id) {
        throw new Error(`chapter "${chapterFinal.name}" belongs to ${tax.get("subject", chapterFinal.a.subject)?.name}, not ${subject.name}`);
      }
      subject = tax.get("subject", chapterFinal.a.subject) ?? null;
      ids.subjectId = subject?.id ?? null;
    } else if (unit) {
      if (subject && unit.a.subject !== subject.id) throw new Error(`unit "${unit.name}" does not belong to subject "${subject.name}"`);
      subject = tax.get("subject", unit.a.subject) ?? null;
      ids.subjectId = subject?.id ?? null;
    }
    if (subject && exam && subject.a.curriculum !== exam.a.curriculum) {
      throw new Error(`subject "${subject.name}" is not part of the curriculum of exam "${exam.name}"`);
    }
    // concepts
    const concepts = ids.conceptIds.map((id) => get("concept", id)!).filter(Boolean);
    for (const c of concepts) {
      if (ids.chapterId && c.a.chapter !== ids.chapterId) throw new Error(`concept "${c.name}" does not belong to the selected chapter`);
      if (!ids.chapterId) ids.chapterId = c.a.chapter ?? null;
    }
    const primary = get("concept", ids.conceptId);
    if (primary) {
      if (ids.topicId && primary.a.topic && primary.a.topic !== ids.topicId) throw new Error(`concept "${primary.name}" does not belong to the selected topic`);
      if (ids.subtopicId && primary.a.subtopic && primary.a.subtopic !== ids.subtopicId) throw new Error(`concept "${primary.name}" does not belong to the selected subtopic`);
      if (!ids.conceptIds.includes(primary.id)) ids.conceptIds.unshift(primary.id);
    }
    if (!ids.chapterId && (ids.subchapterId || ids.topicId || ids.subtopicId || ids.conceptId)) throw new Error("a deeper level was chosen without a chapter");
    if (!ids.subjectId && ids.chapterId) ids.subjectId = tax.get("chapter", ids.chapterId)?.a.subject ?? null;
    return { ok: true, ids };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid classification" };
  }
}

export function assertValidIds(tax: Taxonomy, input: ClassIds): ClassIds {
  const r = validateIds(tax, input);
  if (!r.ok) throw new ApiError(422, `Invalid classification: ${r.error}`, "INVALID_CLASSIFICATION");
  return r.ids;
}

/* ------------------------- prompt context rendering ------------------------- */

export function renderStage1Context(tax: Taxonomy): string {
  const lines: string[] = [];
  lines.push("EXAMS: " + active(tax, "exam").map((e) => `${e.name} (curriculum: ${tax.get("curriculum", e.a.curriculum)?.name})`).join(" | "));
  lines.push("CLASSES: " + active(tax, "class").map((c) => c.name).join(" | "));
  lines.push("SUBJECTS → UNITS → CHAPTERS:");
  for (const s of active(tax, "subject")) {
    lines.push(`Subject: ${s.name} (curriculum: ${tax.get("curriculum", s.a.curriculum)?.name})`);
    for (const k of tax.children("subject", s.id).filter((n) => n.active)) {
      if (k.level === "unit") {
        lines.push(`  Unit: ${k.name}`);
        for (const ch of tax.children("unit", k.id).filter((n) => n.active)) lines.push(`    Chapter: ${ch.name}`);
      } else if (k.level === "chapter") lines.push(`  Chapter (no unit): ${k.name}`);
    }
  }
  return lines.join("\n");
}

export function renderChapterTree(tax: Taxonomy, chapterId: number): string {
  const ch = tax.get("chapter", chapterId);
  if (!ch) return "";
  const lines: string[] = [`Chapter: ${ch.name}`];
  const walk = (node: TaxNode, depth: number) => {
    for (const k of tax.children(node.level, node.id).filter((n) => n.active)) {
      const label = k.level === "subchapter" ? "Subchapter" : k.level === "topic" ? "Topic" : k.level === "subtopic" ? "Subtopic" : "Concept";
      lines.push(`${"  ".repeat(depth)}${label}: ${k.name}`);
      walk(k, depth + 1);
    }
  };
  walk(ch, 1);
  lines.push("QUESTION TYPES: " + active(tax, "question_type").map((q) => q.name).join(" | "));
  return lines.join("\n");
}
