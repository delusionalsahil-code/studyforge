import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { ApiError, assertUuid } from "@/lib/api";
import { perceivedDifficulty, scheduleNext, firstDueDate, INITIAL_STATE, type Rating, type SrsState } from "@/lib/srs";

/** Loads a question only if it belongs to the user (every data access goes through an ownership check). */
export async function ownedQuestion(userId: string, id: string) {
  assertUuid(id, "question id");
  const [q] = await db.select().from(S.questions).where(and(eq(S.questions.id, id), eq(S.questions.userId, userId))).limit(1);
  if (!q) throw new ApiError(404, "Question not found.", "NOT_FOUND");
  return q;
}

export interface ReviewInput {
  questionId: string;
  rating: Rating;
  solved: boolean;
  hintsUsed: number;
  timeSpentSec: number;
  mistakeIds: number[];
}

export async function applyReview(userId: string, input: ReviewInput) {
  const q = await ownedQuestion(userId, input.questionId);
  if (q.processingStatus !== "completed") throw new ApiError(409, "This question hasn't finished processing yet.", "NOT_READY");

  return db.transaction(async (tx) => {
    await tx.insert(S.revisionState).values({ questionId: q.id, userId, dueAt: firstDueDate() }).onConflictDoNothing();
    const [rs] = await tx.select().from(S.revisionState).where(eq(S.revisionState.questionId, q.id)).for("update");
    const prev: SrsState = rs
      ? { intervalDays: rs.intervalDays, ease: rs.ease, step: rs.step, repetitions: rs.repetitions, lapses: rs.lapses, status: rs.status as SrsState["status"] }
      : INITIAL_STATE;
    const next = scheduleNext(prev, { rating: input.rating, hintsUsed: input.hintsUsed, timeSpentSec: input.timeSpentSec });

    const [ev] = await tx
      .insert(S.revisionEvents)
      .values({
        userId,
        questionId: q.id,
        rating: input.rating,
        solved: input.solved,
        hintsUsed: input.hintsUsed,
        timeSpentSec: input.timeSpentSec,
        intervalBefore: prev.intervalDays,
        intervalAfter: next.intervalDays,
        nextDueAt: next.dueAt,
      })
      .returning({ id: S.revisionEvents.id });

    await tx
      .update(S.revisionState)
      .set({
        dueAt: next.dueAt,
        intervalDays: next.intervalDays,
        ease: next.ease,
        step: next.step,
        repetitions: next.repetitions,
        lapses: next.lapses,
        status: next.status,
        lastRating: input.rating,
        lastReviewedAt: new Date(),
      })
      .where(eq(S.revisionState.questionId, q.id));

    if (input.mistakeIds.length) {
      const own = await tx.select({ id: S.commonMistakes.id }).from(S.commonMistakes).where(and(eq(S.commonMistakes.questionId, q.id), eq(S.commonMistakes.userId, userId)));
      const ok = new Set(own.map((m) => m.id));
      const valid = input.mistakeIds.filter((m) => ok.has(m));
      if (valid.length) await tx.insert(S.mistakeOccurrences).values(valid.map((mistakeId) => ({ userId, mistakeId, eventId: ev.id })));
    }

    // difficulty recalculated from the user's own history
    const hist = await tx.select({ rating: S.revisionEvents.rating }).from(S.revisionEvents).where(eq(S.revisionEvents.questionId, q.id)).orderBy(desc(S.revisionEvents.createdAt)).limit(10);
    const pd = perceivedDifficulty(hist.map((h) => h.rating as Rating));
    if (pd !== q.perceivedDifficulty) await tx.update(S.questions).set({ perceivedDifficulty: pd }).where(eq(S.questions.id, q.id));

    return { nextDueAt: next.dueAt, intervalDays: next.intervalDays, status: next.status, perceivedDifficulty: pd };
  });
}
