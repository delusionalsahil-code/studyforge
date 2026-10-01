import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { generatedQuestions } from "@/db/schema";
import { ApiError, assertUuid, json, routeP } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { createQuestionRecord, runQuestionPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Adds an AI-generated practice question to the user's bank (labelled AI-generated) and analyses it. */
export const POST = routeP<{ id: string }>(async (_req, { id }) => {
  const user = await apiUser();
  assertUuid(id);
  const [g] = await db.select().from(generatedQuestions).where(and(eq(generatedQuestions.id, id), eq(generatedQuestions.userId, user.id))).limit(1);
  if (!g) throw new ApiError(404, "Generated question not found.", "NOT_FOUND");
  if (g.savedQuestionId) return json({ id: g.savedQuestionId, alreadySaved: true });
  const { id: qid } = await createQuestionRecord({
    userId: user.id,
    text: g.text,
    sourceType: "ai_generated",
    sourceName: "AI generated",
    isAiGenerated: true,
    generatedFromId: g.sourceQuestionId,
    skipDuplicateCheck: true,
  });
  await db.update(generatedQuestions).set({ savedQuestionId: qid }).where(eq(generatedQuestions.id, id));
  after(() => runQuestionPipeline(qid));
  return json({ id: qid }, 201);
});
