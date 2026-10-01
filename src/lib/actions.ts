import { AiError } from "./ai/client";
import { generateSimilar, type SimilarMode } from "./ai/stages";
import { assertValidIds, type ClassIds } from "./classification";
import { createQuestionRecord, runImportJob, runQuestionPipeline } from "./pipeline";
import { scheduleNext, type Rating } from "./srs";
import { bumpTaxonomy, deleteUpload, getDB, getTax, mutate, nowIso, saveUpload, uid, type ImportJob, type Question } from "./store";
import { allowedParents, type NodeRow, type TaxNode } from "./taxonomy";
import type { Difficulty, Level } from "./taxonomy-types";
import { LEVEL_LABEL } from "./taxonomy-types";
import { nameSimilarity, normalizeName, slugify } from "./text";

export class UserError extends Error {}

/* ------------------------------ imports -------------------------------- */
export interface ImportInput {
  kind: "text" | "image" | "pdf";
  text?: string;
  file?: { filename: string; mime: string; dataUrl: string; size: number };
  sourceName?: string;
  sourcePage?: string;
  split?: boolean;
}

export function startImport(inp: ImportInput): string {
  if (inp.kind === "text" && !(inp.text ?? "").trim()) throw new UserError("Type or paste a question first.");
  if (inp.kind !== "text" && !inp.file) throw new UserError("Choose a file to upload.");
  const upload = inp.file ? saveUpload(inp.file) : null;
  const job: ImportJob = {
    id: uid(),
    sourceType: inp.kind,
    sourceName: inp.sourceName?.trim() || null,
    sourcePage: inp.sourcePage?.trim() || null,
    rawText: inp.kind === "text" ? inp.text!.trim() : null,
    uploadId: upload?.id ?? null,
    splitMultiple: Boolean(inp.split),
    status: "queued",
    stage: "uploading",
    error: null,
    errorCode: null,
    questionCount: 0,
    createdAt: nowIso(),
  };
  mutate((d) => void d.imports.unshift(job));
  void runImportJob(job.id);
  return job.id;
}
export const retryImport = (id: string) => void runImportJob(id);
export const retryQuestion = (id: string) => void runQuestionPipeline(id);

export function discardImport(id: string) {
  mutate((d) => {
    d.imports = d.imports.filter((i) => i.id !== id);
  });
}

export function deleteQuestion(id: string) {
  mutate((d) => {
    const q = d.questions.find((x) => x.id === id);
    if (!q) return;
    d.questions = d.questions.filter((x) => x.id !== id);
    delete d.revision[id];
    delete d.embeddings[id];
    d.reviews = d.reviews.filter((r) => r.questionId !== id);
    d.classEvents = d.classEvents.filter((r) => r.questionId !== id);
    d.generated = d.generated.filter((g) => g.fromId !== id);
    const stillUsed = (uploadId: string | null) => uploadId && d.questions.some((x) => x.imageUploadId === uploadId || x.pdfUploadId === uploadId);
    for (const u of [q.imageUploadId, q.pdfUploadId]) if (u && !stillUsed(u)) deleteUpload(u);
  });
}

/** Duplicate gate: keep both, discard the new one, or merge its metadata into the existing question. */
export function resolveDuplicate(id: string, action: "save" | "discard" | "merge") {
  const q = getDB().questions.find((x) => x.id === id);
  if (!q || q.processingStatus !== "duplicate_pending") return;
  if (action === "save") {
    mutate((d) => {
      const x = d.questions.find((y) => y.id === id)!;
      x.processingStatus = "queued";
      x.updatedAt = nowIso();
    });
    void runQuestionPipeline(id);
    return;
  }
  if (action === "merge" && q.duplicateOfId) {
    mutate((d) => {
      const target = d.questions.find((y) => y.id === q.duplicateOfId);
      if (target) {
        if (!target.sourceName && q.sourceName) target.sourceName = q.sourceName;
        if (!target.sourcePage && q.sourcePage) target.sourcePage = q.sourcePage;
        if (!target.imageUploadId && q.imageUploadId) target.imageUploadId = q.imageUploadId;
        target.updatedAt = nowIso();
      }
    });
  }
  mutate((d) => {
    d.questions = d.questions.filter((y) => y.id !== id);
  });
}

/* --------------------------- user correction --------------------------- */
export function applyCorrection(id: string, input: ClassIds, difficulty: Difficulty | null) {
  const tax = getTax();
  let ids: ClassIds;
  try {
    ids = assertValidIds(tax, input);
  } catch (e) {
    throw new UserError(e instanceof Error ? e.message : "Invalid classification");
  }
  mutate((d) => {
    const q = d.questions.find((x) => x.id === id);
    if (!q) return;
    // the original AI classification stays in classEvents; the correction is a new event
    const conf: Record<string, number> = {};
    const chain: [string, number | null][] = [
      ["class", ids.classId], ["exam", ids.examId], ["subject", ids.subjectId], ["unit", ids.unitId], ["chapter", ids.chapterId],
      ["subchapter", ids.subchapterId], ["topic", ids.topicId], ["subtopic", ids.subtopicId], ["concept", ids.conceptId], ["question_type", ids.questionTypeId],
    ];
    for (const [k, v] of chain) if (v) conf[k] = 1;
    d.classEvents.push({ id: uid(), questionId: id, kind: "user", at: nowIso(), ids, difficulty: difficulty ?? q.difficulty, confidence: conf, reasons: ["Corrected by user"] });
    q.ids = ids;
    if (difficulty) q.difficulty = difficulty;
    q.levelConfidence = conf;
    q.classificationConfidence = 1;
    q.classificationSource = "user";
    q.reviewReasons = q.reviewReasons.filter((r) => /incomplete|disagreed/i.test(r));
    q.needsReview = !q.aiVerified && q.processingStatus === "completed" && q.reviewReasons.length > 0;
    q.suggestions = {};
    q.updatedAt = nowIso();
  });
}

export function markReviewed(id: string) {
  mutate((d) => {
    const q = d.questions.find((x) => x.id === id);
    if (q) {
      q.needsReview = false;
      q.reviewReasons = [];
      q.updatedAt = nowIso();
    }
  });
}

/* ------------------------------- revision ------------------------------ */
export function submitReview(id: string, rating: Rating, hintsUsed: number, timeSpentSec: number) {
  mutate((d) => {
    const prev = d.revision[id];
    if (!prev) return;
    const next = scheduleNext(prev, { rating, hintsUsed, timeSpentSec });
    d.revision[id] = { ...prev, ...next, dueAt: next.dueAt.toISOString(), lastRating: rating, lastReviewedAt: nowIso() };
    d.reviews.push({ id: uid(), questionId: id, rating, hintsUsed, timeSpentSec, intervalDays: next.intervalDays, dueAt: next.dueAt.toISOString(), at: nowIso() });
  });
}

/* --------------------------- similar questions ------------------------- */
export async function generateSimilarFor(id: string, mode: SimilarMode, count: number) {
  const q = getDB().questions.find((x) => x.id === id);
  if (!q?.solution) throw new UserError("Analyse this question first.");
  const tax = getTax();
  const out = await generateSimilar(
    {
      text: q.originalText,
      subject: tax.get("subject", q.ids.subjectId)?.name,
      chapter: tax.get("chapter", q.ids.chapterId)?.name,
      topic: tax.get("topic", q.ids.topicId)?.name,
      concepts: q.ids.conceptIds.map((c) => tax.get("concept", c)?.name).filter((n): n is string => Boolean(n)),
      difficulty: q.difficulty ?? undefined,
    },
    mode,
    count,
    q.solution.finalAnswer,
  );
  const rows = out.questions.map((g) => ({
    id: uid(),
    fromId: id,
    mode,
    text: g.text,
    variation: g.variation,
    expectedAnswer: g.expected_answer,
    solutionOutline: g.solution_outline,
    savedQuestionId: null,
    createdAt: nowIso(),
  }));
  mutate((d) => void d.generated.unshift(...rows));
  return rows.length;
}

export async function saveGenerated(gid: string): Promise<string> {
  const g = getDB().generated.find((x) => x.id === gid);
  if (!g) throw new UserError("Generated question not found.");
  if (g.savedQuestionId) return g.savedQuestionId;
  const src = getDB().questions.find((x) => x.id === g.fromId);
  const { id } = await createQuestionRecord({ text: g.text, sourceType: "ai_generated", sourceName: "AI-generated", isAiGenerated: true, generatedFromId: g.fromId, skipDuplicateCheck: true });
  mutate((d) => {
    const x = d.generated.find((y) => y.id === gid);
    if (x) x.savedQuestionId = id;
    void src;
  });
  void runQuestionPipeline(id);
  return id;
}

export function discardGenerated(gid: string) {
  mutate((d) => {
    d.generated = d.generated.filter((g) => g.id !== gid);
  });
}

/* ------------------------------ taxonomy admin ------------------------- */

/** Names must be unique inside the scope the AI matches against (chapters per subject; deeper levels per chapter). */
function scopeSiblings(tax: ReturnType<typeof getTax>, level: Level, parent: TaxNode | { level: Level; id: number; a: TaxNode["a"] } | null | undefined, excludeId?: number): TaxNode[] {
  let list: TaxNode[];
  if (!parent) list = tax.byLevel[level];
  else if (level === "chapter") {
    const subjectId = parent.level === "subject" ? parent.id : parent.a.subject;
    list = tax.byLevel.chapter.filter((c) => c.a.subject === subjectId);
  } else if (["subchapter", "topic", "subtopic", "concept"].includes(level)) {
    const chapterId = parent.level === "chapter" ? parent.id : parent.a.chapter;
    list = tax.byLevel[level].filter((c) => c.a.chapter === chapterId);
  } else list = tax.children(parent.level, parent.id).filter((c) => c.level === level);
  return list.filter((n) => n.id !== excludeId);
}
function touchNodes(d: { nodes: NodeRow[] }) {
  d.nodes = [...d.nodes];
  bumpTaxonomy();
}

export function createNode(input: { level: Level; parent?: { level: Level; id: number } | null; name: string; description?: string | null }) {
  const tax = getTax();
  const { level } = input;
  const name = input.name.trim();
  if (!name) throw new UserError("Name is required.");
  const allowed = allowedParents(level);
  let parent: TaxNode | undefined;
  if (allowed.length) {
    parent = input.parent ? tax.get(input.parent.level, input.parent.id) : undefined;
    if (!parent || !allowed.includes(parent.level)) throw new UserError(`A ${LEVEL_LABEL[level].toLowerCase()} must sit under: ${allowed.map((l) => LEVEL_LABEL[l].toLowerCase()).join(" or ")}.`);
  }
  const slug = slugify(name);
  if (!slug) throw new UserError("Name must contain letters or digits.");
  const clash = scopeSiblings(tax, level, parent).find((s) => normalizeName(s.name) === normalizeName(name) || nameSimilarity(s.name, name) >= 0.95);
  if (clash) throw new UserError(`"${clash.name}" already exists in this scope — canonical names must be unique.`);
  mutate((d) => {
    const maxOrder = d.nodes.reduce((m, n) => Math.max(m, n.orderIndex), 0);
    d.nodes.push({
      id: d.nextNodeId++,
      level,
      name,
      slug,
      description: input.description?.trim() || null,
      orderIndex: maxOrder + 1,
      active: true,
      parentLevel: parent?.level ?? null,
      parentId: parent?.id ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    touchNodes(d);
  });
}

export function updateNode(level: Level, id: number, patch: { name?: string; description?: string | null; active?: boolean }) {
  const tax = getTax();
  const node = tax.get(level, id);
  if (!node) throw new UserError("Node not found.");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new UserError("Name is required.");
    const parentNode = node.parent ? tax.get(node.parent.level, node.parent.id) : null;
    const clash = scopeSiblings(tax, level, parentNode, id).find((s) => normalizeName(s.name) === normalizeName(name));
    if (clash) throw new UserError(`"${clash.name}" already exists here.`);
    patch.name = name;
  }
  mutate((d) => {
    const row = d.nodes.find((n) => n.level === level && n.id === id);
    if (!row) return;
    if (patch.name !== undefined) {
      row.name = patch.name;
      row.slug = slugify(patch.name);
    }
    if (patch.description !== undefined) row.description = patch.description?.trim() || null;
    if (patch.active !== undefined) row.active = patch.active;
    row.updatedAt = nowIso();
    touchNodes(d);
  });
}

export function nodeUsage(level: Level, id: number): number {
  const d = getDB();
  const key = (
    { class: "classId", exam: "examId", subject: "subjectId", unit: "unitId", chapter: "chapterId", subchapter: "subchapterId", topic: "topicId", subtopic: "subtopicId", concept: "conceptId", question_type: "questionTypeId" } as Record<string, keyof ClassIds>
  )[level];
  if (!key) return 0;
  return d.questions.filter((q) => (level === "concept" ? q.ids.conceptIds.includes(id) : q.ids[key] === id)).length;
}

export function deleteNode(level: Level, id: number) {
  const tax = getTax();
  if (tax.children(level, id).length) throw new UserError("This node has children. Delete or move them first (or deactivate it instead).");
  if (nodeUsage(level, id) > 0) throw new UserError("Questions are linked to this node. Deactivate it instead of deleting.");
  mutate((d) => {
    d.nodes = d.nodes.filter((n) => !(n.level === level && n.id === id));
    bumpTaxonomy();
  });
}

export { AiError };
export type { Question };
