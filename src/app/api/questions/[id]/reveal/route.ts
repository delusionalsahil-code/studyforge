import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { ApiError, json, routeP } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { ownedQuestion } from "@/lib/questions";

export const dynamic = "force-dynamic";

/** Progressive reveal for revision mode: hint1..hint3, then the full solution (+ formulas, trick, mistakes). */
export const GET = routeP<{ id: string }>(async (req, { id }) => {
  const user = await apiUser();
  const q = await ownedQuestion(user.id, id);
  const part = new URL(req.url).searchParams.get("part") ?? "";
  const [sol] = await db.select().from(S.solutions).where(eq(S.solutions.questionId, id)).limit(1);
  if (!sol) throw new ApiError(409, "No solution has been generated for this question yet.", "NOT_READY");

  const m = part.match(/^hint([1-3])$/);
  if (m) return json({ hint: sol.hints[Number(m[1]) - 1] ?? null });
  if (part !== "solution") throw new ApiError(400, "Unknown part", "VALIDATION");

  const [formulas, tricks, mistakes] = await Promise.all([
    db
      .select({ id: S.formulas.id, name: S.formulas.name, latex: S.formulas.latex, expression: S.formulas.expression })
      .from(S.questionFormulas)
      .innerJoin(S.formulas, eq(S.formulas.id, S.questionFormulas.formulaId))
      .where(eq(S.questionFormulas.questionId, id)),
    db.select().from(S.tricks).where(eq(S.tricks.questionId, id)),
    db.select({ id: S.commonMistakes.id, title: S.commonMistakes.title, description: S.commonMistakes.description, tip: S.commonMistakes.preventionTip }).from(S.commonMistakes).where(eq(S.commonMistakes.questionId, id)),
  ]);
  return json({
    solution: sol.content,
    finalAnswer: sol.finalAnswer,
    verified: sol.verified,
    formulas,
    trick: tricks[0] ? { name: tricks[0].name, explanation: tricks[0].explanation, shortcut: tricks[0].shortcutMethod } : null,
    mistakes,
    hasTrick: q.hasTrick,
  });
});
