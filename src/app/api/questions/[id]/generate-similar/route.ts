import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as S from "@/db/schema";
import { ApiError, json, routeP } from "@/lib/api";
import { generateSimilar } from "@/lib/ai/stages";
import { apiUser } from "@/lib/auth";
import { ctxFrom, idsFromQuestion } from "@/lib/pipeline";
import { ownedQuestion } from "@/lib/questions";
import { loadTaxonomy } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ mode: z.enum(["values", "wording", "harder", "easier", "mix"]).default("mix"), count: z.number().int().min(1).max(4).default(2) });

export const POST = routeP<{ id: string }>(async (req, { id }) => {
  const user = await apiUser();
  const q = await ownedQuestion(user.id, id);
  const body = Body.parse(await req.json().catch(() => ({})));
  if (q.processingStatus !== "completed") throw new ApiError(409, "Wait until this question finishes processing.", "NOT_READY");
  const [sol] = await db.select({ finalAnswer: S.solutions.finalAnswer }).from(S.solutions).where(eq(S.solutions.questionId, id)).limit(1);
  const tax = await loadTaxonomy();
  const concepts = await db.select({ id: S.questionConcepts.conceptId }).from(S.questionConcepts).where(eq(S.questionConcepts.questionId, id));
  const ctx = ctxFrom(tax, q.originalText, idsFromQuestion(q, concepts.map((c) => c.id)), q.difficulty);
  const out = await generateSimilar(ctx, body.mode, body.count, sol?.finalAnswer ?? "");
  const rows = await db
    .insert(S.generatedQuestions)
    .values(out.questions.slice(0, body.count).map((g) => ({ userId: user.id, sourceQuestionId: id, text: g.text, variation: g.variation || body.mode, expectedAnswer: g.expected_answer, solutionOutline: g.solution_outline })))
    .returning();
  return json({ generated: rows }, 201);
});
