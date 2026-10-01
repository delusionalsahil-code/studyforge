import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as S from "@/db/schema";
import { json, routeP } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { assertValidIds, type ClassIds } from "@/lib/classification";
import { idsFromQuestion } from "@/lib/pipeline";
import { ownedQuestion } from "@/lib/questions";
import { loadTaxonomy } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

const Id = z.number().int().positive().nullable();
const Body = z.object({
  classId: Id,
  examId: Id,
  subjectId: Id,
  unitId: Id,
  chapterId: Id,
  subchapterId: Id,
  topicId: Id,
  subtopicId: Id,
  conceptIds: z.array(z.number().int().positive()).max(20),
  questionTypeId: Id,
  difficulty: z.enum(["Easy", "Medium", "Hard", "Very Hard"]).nullable(),
});

/**
 * User correction of the AI classification. The original AI classification stays in
 * classification_events (immutable); this stores before/after of the correction.
 */
export const PATCH = routeP<{ id: string }>(async (req, { id }) => {
  const user = await apiUser();
  const q = await ownedQuestion(user.id, id);
  const b = Body.parse(await req.json().catch(() => ({})));
  const tax = await loadTaxonomy();

  const existingConcepts = await db.select({ id: S.questionConcepts.conceptId, primary: S.questionConcepts.isPrimary }).from(S.questionConcepts).where(eq(S.questionConcepts.questionId, id));
  const before = { ...idsFromQuestion(q, existingConcepts.map((c) => c.id)), difficulty: q.difficulty };

  const conceptIds = [...new Set(b.conceptIds)];
  const wanted: ClassIds = {
    classId: b.classId,
    examId: b.examId,
    subjectId: b.subjectId,
    unitId: b.unitId,
    chapterId: b.chapterId,
    subchapterId: b.subchapterId,
    topicId: b.topicId,
    subtopicId: b.subtopicId,
    conceptId: conceptIds[0] ?? null,
    conceptIds,
    questionTypeId: b.questionTypeId,
  };
  const ids = assertValidIds(tax, wanted); // 422 on impossible combinations (e.g. Physics → Chemistry chapter)
  const after = { ...ids, difficulty: b.difficulty };
  const changed = JSON.stringify(before) !== JSON.stringify(after);

  await db.transaction(async (tx) => {
    await tx.insert(S.classificationEvents).values({ questionId: id, userId: user.id, kind: changed ? "user_correction" : "user_confirmation", before, after });
    await tx
      .update(S.questions)
      .set({
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
        difficulty: b.difficulty,
        classificationSource: "user",
        userCorrectedAt: new Date(),
        needsReview: false,
        reviewReasons: [],
      })
      .where(eq(S.questions.id, id));
    await tx.delete(S.questionConcepts).where(eq(S.questionConcepts.questionId, id));
    if (ids.conceptIds.length) {
      await tx.insert(S.questionConcepts).values(ids.conceptIds.map((conceptId) => ({ questionId: id, conceptId, isPrimary: conceptId === ids.conceptId })));
    }
  });
  return json({ ok: true, changed });
});
