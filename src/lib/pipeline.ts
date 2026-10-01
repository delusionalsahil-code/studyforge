import { AiError, aiConfig, embed } from "./ai/client";
import { FormulasSchema, SolutionSchema, Stage1Schema, Stage2Schema, TricksSchema, VerifySchema, type SolutionOut } from "./ai/schemas";
import { classifyStage1, classifyStage2, detectTricks, extractFormulas, extractQuestions, solveQuestion, verifySolution, type QCtx } from "./ai/stages";
import {
  EMPTY_IDS,
  matchNode,
  renderChapterTree,
  renderStage1Context,
  resolveStage1,
  resolveStage2,
  validateIds,
  type ClassIds,
  type Resolved,
} from "./classification";
import { findDuplicates } from "./duplicates";
import { firstDueDate } from "./srs";
import { getDB, getTax, getUpload, mutate, newQuestion, nowIso, uid, type Formula, type ImportJob, type Question } from "./store";
import type { Taxonomy } from "./taxonomy";
import { normalizeName, normalizeQuestionText, sha256, slugify, truncate } from "./text";

const running = new Set<string>();
const MAX_QUESTIONS_PER_IMPORT = 100;

/* ------------------------------------------------------------------ */
/* Question creation (+ duplicate gate)                                 */
/* ------------------------------------------------------------------ */
export async function createQuestionRecord(args: {
  text: string;
  sourceType: Question["sourceType"];
  sourceName?: string | null;
  sourcePage?: string | null;
  importId?: string | null;
  imageUploadId?: string | null;
  pdfUploadId?: string | null;
  isAiGenerated?: boolean;
  generatedFromId?: string | null;
  skipDuplicateCheck?: boolean;
}): Promise<{ id: string; duplicateOf: string | null }> {
  const normalized = normalizeQuestionText(args.text);
  const dups = args.skipDuplicateCheck ? [] : await findDuplicates(args.text);
  const dup = dups[0];
  const q = newQuestion({
    originalText: args.text.trim(),
    normalizedText: normalized,
    textHash: sha256(normalized),
    sourceType: args.sourceType,
    sourceName: args.sourceName || null,
    sourcePage: args.sourcePage || null,
    importId: args.importId ?? null,
    imageUploadId: args.imageUploadId ?? null,
    pdfUploadId: args.pdfUploadId ?? null,
    isAiGenerated: args.isAiGenerated ?? false,
    generatedFromId: args.generatedFromId ?? null,
    processingStatus: dup ? "duplicate_pending" : "queued",
    duplicateOfId: dup?.id ?? null,
    duplicateScore: dup?.score ?? null,
  });
  mutate((d) => {
    d.questions.unshift(q);
  });
  return { id: q.id, duplicateOf: dup?.id ?? null };
}

const patchQ = (id: string, fn: (q: Question) => void) =>
  mutate((d) => {
    const q = d.questions.find((x) => x.id === id);
    if (q) {
      fn(q);
      q.updatedAt = nowIso();
    }
  });
const patchImport = (id: string, fn: (i: ImportJob) => void) =>
  mutate((d) => {
    const i = d.imports.find((x) => x.id === id);
    if (i) fn(i);
  });

/* ------------------------------------------------------------------ */
/* Import processing (extraction)                                       */
/* ------------------------------------------------------------------ */
export async function runImportJob(importId: string): Promise<void> {
  const key = `import:${importId}`;
  if (running.has(key)) return;
  const imp = getDB().imports.find((i) => i.id === importId);
  if (!imp || !(imp.status === "queued" || imp.status === "failed")) return;
  running.add(key);
  try {
    patchImport(importId, (i) => {
      i.status = "processing";
      i.error = null;
      i.errorCode = null;
      i.stage = "extracting";
    });
    const existing = getDB().questions.filter((q) => q.importId === importId);
    if (existing.length === 0) {
      let items: { text: string; page?: string | null }[];
      try {
        items = await extractItems(imp);
        if (!items.length) throw new AiError("UNREADABLE", "No questions could be found in this upload.");
      } catch (e) {
        const code = e instanceof AiError ? e.code : "IMPORT_FAILED";
        const msg = e instanceof Error ? e.message : "Import failed";
        patchImport(importId, (i) => {
          i.status = "failed";
          i.error = msg;
          i.errorCode = code;
        });
        return;
      }
      let n = 0;
      for (const it of items.slice(0, MAX_QUESTIONS_PER_IMPORT)) {
        await createQuestionRecord({
          text: it.text,
          sourceType: imp.sourceType,
          sourceName: imp.sourceName,
          sourcePage: it.page ?? imp.sourcePage,
          importId,
          imageUploadId: imp.sourceType === "image" ? imp.uploadId : null,
          pdfUploadId: imp.sourceType === "pdf" ? imp.uploadId : null,
        });
        n++;
      }
      patchImport(importId, (i) => {
        i.questionCount = n;
      });
    }
    patchImport(importId, (i) => {
      i.status = "completed";
      i.stage = "done";
    });
  } finally {
    running.delete(key);
  }
  // analyse the extracted questions one after another
  const qs = getDB().questions.filter((q) => q.importId === importId && q.processingStatus === "queued").reverse();
  for (const q of qs) await runQuestionPipeline(q.id);
}

async function extractItems(imp: ImportJob): Promise<{ text: string; page?: string | null }[]> {
  if (imp.sourceType === "text") {
    const raw = (imp.rawText ?? "").trim();
    if (!raw) throw new AiError("UNREADABLE", "The pasted text was empty.");
    if (!imp.splitMultiple) return [{ text: raw }];
    const out = await extractQuestions({ text: raw, page: imp.sourcePage ?? undefined });
    if (out.unreadable && !out.questions.length) throw new AiError("UNREADABLE", out.reason || "No questions found in the text.");
    return out.questions;
  }
  const up = getUpload(imp.uploadId);
  if (!up) throw new AiError("UNREADABLE", "The uploaded file could not be found.");
  if (imp.sourceType === "image") {
    const out = await extractQuestions({ image: up.dataUrl, page: imp.sourcePage ?? undefined });
    if (out.unreadable || !out.questions.length) throw new AiError("UNREADABLE", out.reason || "The image is unreadable or contains no question. Try a sharper, well-lit photo.");
    return out.questions;
  }
  // PDF: use the text layer when present, otherwise let a vision-capable model read the file.
  let pages: string[] = [];
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buf = await (await fetch(up.dataUrl)).arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const res = await extractText(pdf, { mergePages: false });
    pages = res.text as string[];
  } catch {
    throw new AiError("UNSUPPORTED_PDF", "This PDF could not be opened (it may be encrypted or corrupted).");
  }
  const total = pages.reduce((a, p) => a + p.trim().length, 0);
  if (total < 40) {
    if (up.size > 15 * 1024 * 1024) throw new AiError("UNSUPPORTED_PDF", "This scanned PDF is too large to read. Upload the pages as images instead.");
    const out = await extractQuestions({ pdf: { filename: up.filename, dataUrl: up.dataUrl } });
    if (out.unreadable || !out.questions.length) throw new AiError("UNSUPPORTED_PDF", out.reason || "No readable questions were found in this scanned PDF.");
    return out.questions;
  }
  const chunks: { text: string; from: number; to: number }[] = [];
  let cur = { text: "", from: 1, to: 1 };
  pages.forEach((p, i) => {
    if (cur.text && cur.text.length + p.length > 9000) {
      chunks.push(cur);
      cur = { text: "", from: i + 1, to: i + 1 };
    }
    cur.text += `\n[Page ${i + 1}]\n${p}`;
    cur.to = i + 1;
  });
  if (cur.text.trim()) chunks.push(cur);
  const all: { text: string; page?: string | null }[] = [];
  for (const c of chunks) {
    const out = await extractQuestions({ text: c.text, page: c.from === c.to ? String(c.from) : `${c.from}-${c.to}` });
    all.push(...out.questions);
  }
  if (!all.length) throw new AiError("UNSUPPORTED_PDF", "No questions were found in this PDF.");
  return all;
}

/* ------------------------------------------------------------------ */
/* Per-question analysis pipeline (resumable)                           */
/* ------------------------------------------------------------------ */
export async function runQuestionPipeline(questionId: string): Promise<void> {
  if (running.has(questionId)) return;
  const q = getDB().questions.find((x) => x.id === questionId);
  if (!q || !(q.processingStatus === "queued" || q.processingStatus === "failed")) return;
  running.add(questionId);
  patchQ(questionId, (x) => {
    x.processingStatus = "processing";
    x.processingError = null;
    x.processingErrorCode = null;
  });
  try {
    await runStages(questionId);
  } catch (e) {
    const code = e instanceof AiError ? e.code : "PIPELINE_FAILED";
    const msg = e instanceof Error ? e.message : "Processing failed";
    if (!(e instanceof AiError)) console.error("[pipeline] failed", questionId, e);
    patchQ(questionId, (x) => {
      x.processingStatus = "failed";
      x.processingError = truncate(msg, 600);
      x.processingErrorCode = code;
    });
  } finally {
    running.delete(questionId);
  }
}

export const isRunning = (id: string) => running.has(id);

export function ctxFrom(tax: Taxonomy, text: string, ids: ClassIds, difficulty: string | null, images?: string[]): QCtx {
  return {
    text,
    images,
    subject: tax.get("subject", ids.subjectId)?.name,
    chapter: tax.get("chapter", ids.chapterId)?.name,
    topic: tax.get("topic", ids.topicId)?.name,
    concepts: ids.conceptIds.map((id) => tax.get("concept", id)?.name).filter((n): n is string => Boolean(n)),
    questionType: tax.get("question_type", ids.questionTypeId)?.name,
    difficulty: difficulty ?? undefined,
  };
}

export function solutionToText(s: SolutionOut): string {
  return [
    s.concept && `Concept: ${s.concept}`,
    s.given.length && `Given: ${s.given.join("; ")}`,
    s.required && `Required: ${s.required}`,
    `Approach: ${s.approach}`,
    ...s.steps.map((st, i) => `Step ${i + 1}: ${st}`),
    `Final answer: ${s.final_answer}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function canonicalFormulaKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\\(left|right|,|;|!|quad|qquad|displaystyle|mathrm|text)/g, "")
    .replace(/[\s{}$]/g, "")
    .replace(/\\cdot|\\times|\*/g, "·")
    .trim();
}

async function runStages(questionId: string) {
  const tax = getTax();
  const get = () => getDB().questions.find((x) => x.id === questionId)!;
  const q0 = get();
  const save = (patch: Question["analysis"]) => patchQ(questionId, (x) => void Object.assign(x.analysis, patch));
  const stage = (s: string) => patchQ(questionId, (x) => void (x.processingStage = s));
  const userCorrected = q0.classificationSource === "user";

  const images = q0.imageUploadId && /figure|diagram|graph|shown|circuit|image|picture|\[Diagram/i.test(q0.originalText) ? [getUpload(q0.imageUploadId)?.dataUrl].filter((x): x is string => Boolean(x)) : undefined;

  /* 1. hierarchical classification (stage 1: exam..chapter, stage 2: subchapter..concept) */
  let cls: Resolved;
  if (userCorrected) {
    cls = {
      ids: { ...q0.ids },
      difficulty: q0.difficulty,
      difficultyConfidence: q0.difficultyConfidence,
      tags: q0.tags,
      levelConfidence: q0.levelConfidence,
      classificationConfidence: q0.classificationConfidence ?? 1,
      needsReview: false,
      reasons: [],
      suggestions: {},
    };
  } else {
    if (!get().analysis.classification) {
      stage("classifying");
      const s = getDB().settings;
      const s1 = await classifyStage1({ text: q0.originalText, images }, renderStage1Context(tax), { exam: s.defaultExam, class: s.defaultClass });
      const r1 = resolveStage1(tax, s1);
      let s2 = null;
      if (r1.chapter) {
        s2 = await classifyStage2({ text: q0.originalText, subject: r1.subject?.name, chapter: r1.chapter.name }, renderChapterTree(tax, r1.chapter.id));
      }
      save({ classification: { stage1: s1, stage2: s2 } });
    }
    const raw = get().analysis.classification as { stage1: unknown; stage2: unknown };
    cls = resolveStage2(tax, resolveStage1(tax, Stage1Schema.parse(raw.stage1)), raw.stage2 ? Stage2Schema.parse(raw.stage2) : null);
  }
  const qctx = ctxFrom(tax, q0.originalText, cls.ids, cls.difficulty, images);

  /* 2. solution + independent verification */
  if (!get().analysis.solution) {
    stage("solving");
    save({ solution: await solveQuestion(qctx) });
  }
  const solution = SolutionSchema.parse(get().analysis.solution);
  if (!get().analysis.verification) {
    stage("solving");
    save({ verification: await verifySolution(qctx, solution.final_answer) });
  }
  const verification = VerifySchema.parse(get().analysis.verification);
  const solText = solutionToText(solution);

  /* 3. formulas */
  if (!get().analysis.formulas) {
    stage("formulas");
    const existing = getDB().formulas.filter((f) => cls.ids.chapterId && f.chapterId === cls.ids.chapterId).slice(0, 60).map((f) => f.name);
    save({ formulas: await extractFormulas(qctx, solText, existing) });
  }
  const formulasOut = FormulasSchema.parse(get().analysis.formulas);

  /* 4. tricks + common mistakes */
  if (!get().analysis.tricks) {
    stage("tricks");
    save({ tricks: await detectTricks(qctx, solText, solution.final_answer) });
  }
  const tricksOut = TricksSchema.parse(get().analysis.tricks);

  /* 5. save everything */
  stage("saving");
  const verified = verification.matches && solution.answerable;
  const reasons = [...cls.reasons];
  if (!solution.answerable) reasons.push(`Question may be incomplete or ambiguous: ${solution.issues || "see solution notes"}`);
  if (!verification.matches) reasons.push(`Independent check disagreed with the solution: ${verification.notes || verification.independent_answer}`);
  const needsReview = userCorrected ? !verified : cls.needsReview || !verified;
  const checked = validateIds(tax, cls.ids);
  const ids: ClassIds = checked.ok ? checked.ids : { ...EMPTY_IDS, conceptIds: [], classId: cls.ids.classId, examId: cls.ids.examId, subjectId: cls.ids.subjectId };

  const tagList = [...new Map(cls.tags.map((t) => [slugify(t), t.toLowerCase().trim()])).entries()].filter(([s]) => s).slice(0, 12).map(([, n]) => n);

  mutate((d) => {
    const q = d.questions.find((x) => x.id === questionId);
    if (!q) return;
    // formulas: deduplicated per user vault, then linked
    const byKey = new Map(d.formulas.map((f) => [f.canonicalKey, f]));
    const byName = new Map(d.formulas.map((f) => [normalizeName(f.name), f]));
    const chapterConcepts = tax.byLevel.concept.filter((c) => c.a.chapter === ids.chapterId);
    const linked: string[] = [];
    for (const f of formulasOut.formulas) {
      const key = canonicalFormulaKey(f.latex || f.expression);
      let row: Formula | undefined = byKey.get(key) ?? byName.get(normalizeName(f.name));
      if (!row) {
        row = {
          id: uid(),
          canonicalKey: key,
          name: f.name,
          expression: f.expression,
          latex: f.latex,
          variables: f.variables,
          units: f.units,
          whenToUse: f.when_to_use,
          restrictions: f.restrictions,
          subjectId: ids.subjectId,
          chapterId: ids.chapterId,
          topicId: ids.topicId,
          subtopicId: ids.subtopicId,
          conceptIds: [...new Set(f.concepts.map((n) => matchNode(chapterConcepts, n)?.id).filter((x): x is number => Boolean(x)))],
          createdAt: nowIso(),
        };
        d.formulas.push(row);
        byKey.set(key, row);
        byName.set(normalizeName(f.name), row);
      }
      linked.push(row.id);
    }
    q.formulaIds = [...new Set(linked)];

    q.solution = {
      content: solution,
      finalAnswer: solution.final_answer,
      verified,
      verificationNotes: verification.notes || verification.independent_working,
      hints: solution.hints,
      model: aiConfig().model,
      createdAt: nowIso(),
    };
    q.tricks = tricksOut.has_trick
      ? tricksOut.tricks.map((t) => ({
          id: uid(),
          name: t.name,
          explanation: t.shortcut_explanation,
          whenItWorks: t.when_it_works,
          whyItWorks: t.why_it_works,
          limitations: t.limitations,
          normalMethod: t.normal_method,
          shortcutMethod: t.shortcut_method,
          validityCheck: t.validity_check,
        }))
      : [];
    q.mistakes = tricksOut.common_mistakes.map((m) => ({
      id: uid(),
      category: slugify(m.category || "other").replace(/-/g, " ") || "other",
      title: m.title,
      description: m.description,
      preventionTip: m.prevention_tip,
    }));
    q.hasTrick = tricksOut.has_trick;
    if (!userCorrected) {
      d.classEvents.push({ id: uid(), questionId, kind: "ai", at: nowIso(), ids, difficulty: cls.difficulty, confidence: cls.levelConfidence, reasons: cls.reasons });
      q.ids = ids;
      q.difficulty = cls.difficulty;
      q.difficultyConfidence = cls.difficultyConfidence;
      q.classificationConfidence = cls.classificationConfidence;
      q.levelConfidence = cls.levelConfidence;
      q.classificationSource = "ai";
      q.tags = tagList;
      q.suggestions = cls.suggestions;
    }
    q.reviewReasons = reasons;
    q.solutionStatus = verified ? "verified" : "unverified";
    q.aiVerified = verified;
    q.needsReview = needsReview;
    q.processingStatus = "completed";
    q.processingStage = "done";
    q.processingError = null;
    q.processingErrorCode = null;
    q.updatedAt = nowIso();
    // revision schedule (Day 1 → 3 → 7 → 14 → 30, adaptive afterwards)
    if (!d.revision[questionId]) {
      d.revision[questionId] = { questionId, intervalDays: 1, ease: 2.5, step: 0, repetitions: 0, lapses: 0, status: "new", dueAt: firstDueDate().toISOString(), lastRating: null, lastReviewedAt: null };
    }
  });

  // embedding for semantic search / duplicate detection (best effort)
  try {
    const e = await embed(`${q0.normalizedText}\n${qctx.concepts?.join(", ") ?? ""} ${tagList.join(" ")}`);
    if (e) mutate((d) => void (d.embeddings[questionId] = e.vector));
  } catch {
    /* embeddings are optional */
  }
}
