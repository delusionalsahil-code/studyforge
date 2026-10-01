import "server-only";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { AiError, aiConfig, embed } from "@/lib/ai/client";
import {
  FormulasSchema,
  SolutionSchema,
  Stage1Schema,
  Stage2Schema,
  TricksSchema,
  VerifySchema,
  type SolutionOut,
} from "@/lib/ai/schemas";
import { classifyStage1, classifyStage2, detectTricks, extractFormulas, extractQuestions, solveQuestion, verifySolution, type QCtx } from "@/lib/ai/stages";
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
} from "@/lib/classification";
import { findDuplicates } from "@/lib/duplicates";
import { firstDueDate } from "@/lib/srs";
import { loadTaxonomy, type Taxonomy } from "@/lib/taxonomy";
import { normalizeName, normalizeQuestionText, sha256, slugify, truncate } from "@/lib/text";

const STALE_MS = 5 * 60_000;
const staleDate = () => new Date(Date.now() - STALE_MS);

/* ------------------------------------------------------------------ */
/* Uploads                                                              */
/* ------------------------------------------------------------------ */
export async function uploadDataUrl(userId: string, uploadId: string): Promise<{ dataUrl: string; filename: string; mime: string; bytes: Buffer } | null> {
  const [u] = await db.select().from(S.uploads).where(and(eq(S.uploads.id, uploadId), eq(S.uploads.userId, userId))).limit(1);
  if (!u) return null;
  return { dataUrl: `data:${u.mime};base64,${u.data.toString("base64")}`, filename: u.filename, mime: u.mime, bytes: u.data };
}

/* ------------------------------------------------------------------ */
/* Question creation (+ duplicate gate)                                 */
/* ------------------------------------------------------------------ */
export async function createQuestionRecord(args: {
  userId: string;
  text: string;
  sourceType: "text" | "image" | "pdf" | "ai_generated";
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
  const dups = args.skipDuplicateCheck ? [] : await findDuplicates(args.userId, args.text);
  const dup = dups[0];
  const [row] = await db
    .insert(S.questions)
    .values({
      userId: args.userId,
      importId: args.importId ?? null,
      originalText: args.text.trim(),
      normalizedText: normalized,
      textHash: sha256(normalized),
      sourceType: args.sourceType,
      sourceName: args.sourceName || null,
      sourcePage: args.sourcePage || null,
      imageUploadId: args.imageUploadId ?? null,
      pdfUploadId: args.pdfUploadId ?? null,
      isAiGenerated: args.isAiGenerated ?? false,
      generatedFromId: args.generatedFromId ?? null,
      processingStatus: dup ? "duplicate_pending" : "queued",
      processingStage: "queued",
      duplicateOfId: dup?.id ?? null,
      duplicateScore: dup?.score ?? null,
    })
    .returning({ id: S.questions.id });
  return { id: row.id, duplicateOf: dup?.id ?? null };
}

/* ------------------------------------------------------------------ */
/* Import processing (extraction)                                       */
/* ------------------------------------------------------------------ */
async function setImport(id: string, set: Partial<typeof S.imports.$inferInsert>) {
  await db.update(S.imports).set({ ...set, heartbeatAt: new Date() }).where(eq(S.imports.id, id));
}

const MAX_QUESTIONS_PER_IMPORT = 100;

export async function runImportJob(importId: string): Promise<void> {
  const claimed = await db
    .update(S.imports)
    .set({ status: "processing", error: null, errorCode: null, heartbeatAt: new Date() })
    .where(
      and(
        eq(S.imports.id, importId),
        or(inArray(S.imports.status, ["queued", "failed"]), and(eq(S.imports.status, "processing"), lt(S.imports.heartbeatAt, staleDate()))),
      ),
    )
    .returning();
  const imp = claimed[0];
  if (!imp) return;

  try {
    const existing = await db.select({ id: S.questions.id }).from(S.questions).where(eq(S.questions.importId, imp.id));
    if (existing.length === 0) {
      await setImport(imp.id, { stage: "extracting" });
      const items = await extractItems(imp);
      if (!items.length) throw new AiError("UNREADABLE", "No questions could be found in this upload.");
      let n = 0;
      for (const it of items.slice(0, MAX_QUESTIONS_PER_IMPORT)) {
        await createQuestionRecord({
          userId: imp.userId,
          text: it.text,
          sourceType: imp.sourceType as "text" | "image" | "pdf",
          sourceName: imp.sourceName,
          sourcePage: it.page ?? imp.sourcePage,
          importId: imp.id,
          imageUploadId: imp.sourceType === "image" ? imp.uploadId : null,
          pdfUploadId: imp.sourceType === "pdf" ? imp.uploadId : null,
        });
        n++;
      }
      await setImport(imp.id, { questionCount: n });
    }
    await setImport(imp.id, { status: "completed", stage: "done" });
  } catch (e) {
    const code = e instanceof AiError ? e.code : "IMPORT_FAILED";
    const msg = e instanceof Error ? e.message : "Import failed";
    if (!(e instanceof AiError)) console.error("[import] failed", e);
    await setImport(imp.id, { status: "failed", error: msg, errorCode: code });
    return;
  }

  // analyse each extracted question one after another
  const qs = await db
    .select({ id: S.questions.id })
    .from(S.questions)
    .where(and(eq(S.questions.importId, imp.id), eq(S.questions.processingStatus, "queued")))
    .orderBy(S.questions.createdAt);
  for (const q of qs) await runQuestionPipeline(q.id);
}

async function extractItems(imp: typeof S.imports.$inferSelect): Promise<{ text: string; page?: string | null }[]> {
  if (imp.sourceType === "text") {
    const raw = (imp.rawText ?? "").trim();
    if (!raw) throw new AiError("UNREADABLE", "The pasted text was empty.");
    if (!imp.splitMultiple) return [{ text: raw }];
    const out = await extractQuestions({ text: raw, page: imp.sourcePage ?? undefined });
    if (out.unreadable && !out.questions.length) throw new AiError("UNREADABLE", out.reason || "No questions found in the text.");
    return out.questions;
  }
  if (!imp.uploadId) throw new AiError("UNREADABLE", "The uploaded file is missing.");
  const up = await uploadDataUrl(imp.userId, imp.uploadId);
  if (!up) throw new AiError("UNREADABLE", "The uploaded file could not be found.");

  if (imp.sourceType === "image") {
    const out = await extractQuestions({ image: up.dataUrl, page: imp.sourcePage ?? undefined });
    if (out.unreadable || !out.questions.length) {
      throw new AiError("UNREADABLE", out.reason || "The image is unreadable or contains no question. Try a sharper, well-lit photo.");
    }
    return out.questions;
  }

  // PDF: use the text layer when present, otherwise let the vision model read the file.
  let pages: string[] = [];
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(up.bytes));
    const res = await extractText(pdf, { mergePages: false });
    pages = res.text as string[];
  } catch {
    throw new AiError("UNSUPPORTED_PDF", "This PDF could not be opened (it may be encrypted or corrupted).");
  }
  const total = pages.reduce((a, p) => a + p.trim().length, 0);
  if (total < 40) {
    if (up.bytes.length > 20 * 1024 * 1024) throw new AiError("UNSUPPORTED_PDF", "This scanned PDF is too large to read. Upload pages as images instead.");
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
    await setImport(imp.id, { stage: "extracting" });
    const out = await extractQuestions({ text: c.text, page: c.from === c.to ? String(c.from) : `${c.from}-${c.to}` });
    all.push(...out.questions);
  }
  if (!all.length) throw new AiError("UNSUPPORTED_PDF", "No questions were found in this PDF.");
  return all;
}

/* ------------------------------------------------------------------ */
/* Per-question analysis pipeline (resumable)                           */
/* ------------------------------------------------------------------ */
async function setStage(id: string, stage: string) {
  await db.update(S.questions).set({ processingStage: stage, heartbeatAt: new Date() }).where(eq(S.questions.id, id));
}

export async function runQuestionPipeline(questionId: string): Promise<void> {
  const claimed = await db
    .update(S.questions)
    .set({ processingStatus: "processing", processingError: null, processingErrorCode: null, heartbeatAt: new Date() })
    .where(
      and(
        eq(S.questions.id, questionId),
        or(
          inArray(S.questions.processingStatus, ["queued", "failed"]),
          and(eq(S.questions.processingStatus, "processing"), lt(S.questions.heartbeatAt, staleDate())),
        ),
      ),
    )
    .returning();
  const q = claimed[0];
  if (!q) return;
  try {
    await runStages(q);
  } catch (e) {
    const code = e instanceof AiError ? e.code : "PIPELINE_FAILED";
    const msg = e instanceof Error ? e.message : "Processing failed";
    if (!(e instanceof AiError)) console.error("[pipeline] failed", questionId, e);
    await db
      .update(S.questions)
      .set({ processingStatus: "failed", processingError: truncate(msg, 600), processingErrorCode: code })
      .where(eq(S.questions.id, questionId));
  }
}

export function idsFromQuestion(q: typeof S.questions.$inferSelect, conceptIds: number[]): ClassIds {
  return {
    ...EMPTY_IDS,
    classId: q.classId,
    examId: q.examId,
    subjectId: q.subjectId,
    unitId: q.unitId,
    chapterId: q.chapterId,
    subchapterId: q.subchapterId,
    topicId: q.topicId,
    subtopicId: q.subtopicId,
    conceptId: q.conceptId,
    conceptIds,
    questionTypeId: q.questionTypeId,
  };
}

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

function solutionToText(s: SolutionOut): string {
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

async function runStages(q: typeof S.questions.$inferSelect) {
  const tax = await loadTaxonomy();
  const [user] = await db.select().from(S.users).where(eq(S.users.id, q.userId)).limit(1);
  await db.insert(S.questionAnalysis).values({ questionId: q.id }).onConflictDoNothing();
  const [an] = await db.select().from(S.questionAnalysis).where(eq(S.questionAnalysis.questionId, q.id));
  const save = async (patch: Partial<typeof S.questionAnalysis.$inferInsert>) => {
    Object.assign(an, patch);
    await db.update(S.questionAnalysis).set(patch).where(eq(S.questionAnalysis.questionId, q.id));
  };

  // diagrams: send the stored image to the model only when the question refers to a figure
  let images: string[] | undefined;
  if (q.imageUploadId && /\[(diagram|figure|graph|image)/i.test(q.originalText)) {
    const up = await uploadDataUrl(q.userId, q.imageUploadId);
    if (up) images = [up.dataUrl];
  }

  /* 1. classification */
  const userCorrected = q.classificationSource === "user";
  let cls: Resolved;
  if (userCorrected) {
    const cs = await db.select({ id: S.questionConcepts.conceptId }).from(S.questionConcepts).where(eq(S.questionConcepts.questionId, q.id));
    const ids = idsFromQuestion(q, cs.map((c) => c.id));
    cls = {
      ids,
      difficulty: (q.difficulty as Resolved["difficulty"]) ?? null,
      difficultyConfidence: q.difficultyConfidence,
      tags: [],
      levelConfidence: q.levelConfidence,
      classificationConfidence: q.classificationConfidence ?? 1,
      needsReview: false,
      reasons: [],
      suggestions: {},
    };
  } else {
    if (!an.classification) {
      await setStage(q.id, "classifying");
      const base: QCtx = { text: q.originalText };
      const s1 = await classifyStage1(base, renderStage1Context(tax), {
        exam: tax.get("exam", user?.defaultExamId)?.name,
        class: tax.get("class", user?.defaultClassId)?.name,
      });
      const r1 = resolveStage1(tax, s1);
      let s2 = null;
      if (r1.chapter) {
        s2 = await classifyStage2(
          { text: q.originalText, subject: r1.subject?.name, chapter: r1.chapter.name },
          renderChapterTree(tax, r1.chapter.id),
        );
      }
      await save({ classification: { stage1: s1, stage2: s2 } });
    }
    const cRaw = an.classification as { stage1: unknown; stage2: unknown };
    const s1 = Stage1Schema.parse(cRaw.stage1);
    const s2 = cRaw.stage2 ? Stage2Schema.parse(cRaw.stage2) : null;
    cls = resolveStage2(tax, resolveStage1(tax, s1), s2);
  }
  const qctx = ctxFrom(tax, q.originalText, cls.ids, cls.difficulty, images);

  /* 2. solution + independent verification */
  if (!an.solution) {
    await setStage(q.id, "solving");
    await save({ solution: await solveQuestion(qctx) });
  }
  const solution = SolutionSchema.parse(an.solution);
  if (!an.verification) {
    await setStage(q.id, "solving");
    await save({ verification: await verifySolution(qctx, solution.final_answer) });
  }
  const verification = VerifySchema.parse(an.verification);
  const solText = solutionToText(solution);

  /* 3. formulas */
  if (!an.formulas) {
    await setStage(q.id, "formulas");
    const existing = cls.ids.chapterId
      ? await db.select({ name: S.formulas.name }).from(S.formulas).where(and(eq(S.formulas.userId, q.userId), eq(S.formulas.chapterId, cls.ids.chapterId))).limit(60)
      : [];
    await save({ formulas: await extractFormulas(qctx, solText, existing.map((e) => e.name)) });
  }
  const formulasOut = FormulasSchema.parse(an.formulas);

  /* 4. tricks + common mistakes */
  if (!an.tricks) {
    await setStage(q.id, "tricks");
    await save({ tricks: await detectTricks(qctx, solText, solution.final_answer) });
  }
  const tricksOut = TricksSchema.parse(an.tricks);

  /* 5. save everything atomically */
  await setStage(q.id, "saving");
  const verified = verification.matches && solution.answerable;
  const reasons = [...cls.reasons];
  if (!solution.answerable) reasons.push(`Question may be incomplete or ambiguous: ${solution.issues || "see solution notes"}`);
  if (!verification.matches) reasons.push(`Independent check disagreed with the solution: ${verification.notes || verification.independent_answer}`);
  const needsReview = userCorrected ? !verified : cls.needsReview || !verified;

  // last line of defence: parent/child compatibility of the final classification
  const checked = validateIds(tax, cls.ids);
  const ids = checked.ok ? checked.ids : { ...EMPTY_IDS, classId: cls.ids.classId, examId: cls.ids.examId, subjectId: cls.ids.subjectId };

  const formulaIdList = await db.transaction(async (tx) => {
    await tx
      .insert(S.solutions)
      .values({
        questionId: q.id,
        kind: solution.solution_type,
        content: solution as unknown as Record<string, unknown>,
        finalAnswer: solution.final_answer,
        verification: verification as unknown as Record<string, unknown>,
        verified,
        hints: solution.hints,
        model: aiConfig().model,
      })
      .onConflictDoUpdate({
        target: S.solutions.questionId,
        set: {
          kind: solution.solution_type,
          content: solution as unknown as Record<string, unknown>,
          finalAnswer: solution.final_answer,
          verification: verification as unknown as Record<string, unknown>,
          verified,
          hints: solution.hints,
        },
      });

    // classification columns (never overwrite a user's correction)
    if (!userCorrected) {
      await tx.insert(S.classificationEvents).values({
        questionId: q.id,
        userId: q.userId,
        kind: "ai",
        after: { ids, difficulty: cls.difficulty, confidence: cls.levelConfidence, reasons: cls.reasons, suggestions: cls.suggestions, raw: an.classification },
      });
      await tx.delete(S.questionConcepts).where(eq(S.questionConcepts.questionId, q.id));
      if (ids.conceptIds.length) {
        await tx.insert(S.questionConcepts).values(ids.conceptIds.map((conceptId) => ({ questionId: q.id, conceptId, isPrimary: conceptId === ids.conceptId })));
      }
      // tags
      const tagNames = [...new Map(cls.tags.map((t) => [slugify(t), t.toLowerCase().trim()])).entries()].filter(([s]) => s).slice(0, 12);
      await tx.delete(S.questionTags).where(eq(S.questionTags.questionId, q.id));
      if (tagNames.length) {
        await tx.insert(S.tags).values(tagNames.map(([slug, name]) => ({ slug, name }))).onConflictDoNothing();
        const rows = await tx.select({ id: S.tags.id }).from(S.tags).where(inArray(S.tags.slug, tagNames.map(([s]) => s)));
        if (rows.length) await tx.insert(S.questionTags).values(rows.map((r) => ({ questionId: q.id, tagId: r.id }))).onConflictDoNothing();
      }
    }

    // formulas (deduplicated per user, then linked)
    const vault = await tx.select({ id: S.formulas.id, name: S.formulas.name, key: S.formulas.canonicalKey }).from(S.formulas).where(eq(S.formulas.userId, q.userId));
    const byKey = new Map(vault.map((v) => [v.key, v.id]));
    const byName = new Map(vault.map((v) => [normalizeName(v.name), v.id]));
    const linked: number[] = [];
    const chapterConcepts = tax.byLevel.concept.filter((c) => c.a.chapter === ids.chapterId);
    for (const f of formulasOut.formulas) {
      const key = canonicalFormulaKey(f.latex || f.expression);
      let id = byKey.get(key) ?? byName.get(normalizeName(f.name));
      if (!id) {
        const [row] = await tx
          .insert(S.formulas)
          .values({
            userId: q.userId,
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
          })
          .returning({ id: S.formulas.id });
        id = row.id;
        byKey.set(key, id);
        byName.set(normalizeName(f.name), id);
        const cIds = [...new Set(f.concepts.map((n) => matchNode(chapterConcepts, n)?.id).filter((x): x is number => Boolean(x)))];
        if (cIds.length) await tx.insert(S.formulaConcepts).values(cIds.map((conceptId) => ({ formulaId: id!, conceptId }))).onConflictDoNothing();
      }
      linked.push(id);
    }
    await tx.delete(S.questionFormulas).where(eq(S.questionFormulas.questionId, q.id));
    if (linked.length) await tx.insert(S.questionFormulas).values([...new Set(linked)].map((formulaId) => ({ questionId: q.id, formulaId }))).onConflictDoNothing();

    // tricks (only real ones) and common mistakes
    await tx.delete(S.tricks).where(eq(S.tricks.questionId, q.id));
    if (tricksOut.has_trick) {
      await tx.insert(S.tricks).values(
        tricksOut.tricks.map((t) => ({
          questionId: q.id,
          userId: q.userId,
          name: t.name,
          explanation: t.shortcut_explanation,
          whenItWorks: t.when_it_works,
          whyItWorks: t.why_it_works,
          limitations: t.limitations,
          normalMethod: t.normal_method,
          shortcutMethod: t.shortcut_method,
          validityCheck: t.validity_check,
        })),
      );
    }
    await tx.delete(S.commonMistakes).where(eq(S.commonMistakes.questionId, q.id));
    await tx.insert(S.commonMistakes).values(
      tricksOut.common_mistakes.map((m) => ({
        questionId: q.id,
        userId: q.userId,
        category: slugify(m.category || "other").replace(/-/g, " ") || "other",
        title: m.title,
        description: m.description,
        preventionTip: m.prevention_tip,
      })),
    );

    // revision schedule (Day 1 → 3 → 7 → 14 → 30, adaptive afterwards)
    await tx
      .insert(S.revisionState)
      .values({ questionId: q.id, userId: q.userId, dueAt: firstDueDate() })
      .onConflictDoNothing();

    await tx
      .update(S.questions)
      .set({
        ...(userCorrected
          ? {}
          : {
              classId: ids.classId,
              examId: ids.examId,
              subjectId: ids.subjectId,
              unitId: ids.unitId,
              chapterId: ids.chapterId,
              subchapterId: ids.subchapterId,
              topicId: ids.topicId,
              subtopicId: ids.subtopicId,
              conceptId: ids.conceptId,
              questionTypeId: ids.questionTypeId,
              difficulty: cls.difficulty,
              difficultyConfidence: cls.difficultyConfidence,
              classificationConfidence: cls.classificationConfidence,
              levelConfidence: cls.levelConfidence,
              classificationSource: "ai",
            }),
        reviewReasons: reasons,
        solutionStatus: verified ? "verified" : "unverified",
        aiVerified: verified,
        needsReview,
        hasTrick: tricksOut.has_trick,
        processingStatus: "completed",
        processingStage: "done",
        processingError: null,
        processingErrorCode: null,
      })
      .where(eq(S.questions.id, q.id));
    return linked;
  });
  void formulaIdList;

  // embedding for semantic search / duplicate detection (best effort)
  try {
    const tagText = cls.tags.join(" ");
    const e = await embed(`${q.normalizedText}\n${qctx.concepts?.join(", ") ?? ""} ${tagText}`);
    if (e) {
      await db
        .insert(S.questionEmbeddings)
        .values({ questionId: q.id, userId: q.userId, embedding: e.vector, model: e.model })
        .onConflictDoUpdate({ target: S.questionEmbeddings.questionId, set: { embedding: e.vector, model: e.model } });
    }
  } catch {
    /* embeddings are optional */
  }
}

export function canonicalFormulaKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\\(left|right|,|;|!|quad|qquad|displaystyle|mathrm|text)/g, "")
    .replace(/[\s{}$]/g, "")
    .replace(/\\cdot|\\times|\*/g, "")
    .trim();
}

/** Re-queue a question for analysis. `reset` discards earlier AI output so everything is regenerated. */
export async function requeueQuestion(questionId: string, userId: string, reset: boolean): Promise<boolean> {
  const [q] = await db.select().from(S.questions).where(and(eq(S.questions.id, questionId), eq(S.questions.userId, userId))).limit(1);
  if (!q) return false;
  const active = q.processingStatus === "processing" && q.heartbeatAt > staleDate();
  if (active) return false;
  if (reset) {
    await db.update(S.questionAnalysis).set({ classification: q.classificationSource === "user" ? undefined : null, solution: null, verification: null, formulas: null, tricks: null }).where(eq(S.questionAnalysis.questionId, questionId));
  }
  await db.update(S.questions).set({ processingStatus: "queued", processingError: null, processingErrorCode: null }).where(eq(S.questions.id, questionId));
  return true;
}

export async function countByStatus(userId: string) {
  const rows = await db
    .select({ status: S.questions.processingStatus, n: sql<number>`count(*)::int` })
    .from(S.questions)
    .where(eq(S.questions.userId, userId))
    .groupBy(S.questions.processingStatus);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
