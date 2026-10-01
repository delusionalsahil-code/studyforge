import { after } from "next/server";
import { z } from "zod";
import { ApiError, json, routeP } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { requeueQuestion, runQuestionPipeline } from "@/lib/pipeline";
import { ownedQuestion } from "@/lib/questions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ reset: z.boolean().optional() });

/** Resume a failed analysis from the stage that failed (never duplicates the question). `reset` re-runs everything. */
export const POST = routeP<{ id: string }>(async (req, { id }) => {
  const user = await apiUser();
  const q = await ownedQuestion(user.id, id);
  const { reset } = Body.parse(await req.json().catch(() => ({})));
  if (q.processingStatus === "duplicate_pending") throw new ApiError(409, "Resolve the duplicate warning first.", "DUPLICATE_PENDING");
  if (!(await requeueQuestion(id, user.id, Boolean(reset)))) throw new ApiError(409, "This question is being processed right now.", "BUSY");
  after(() => runQuestionPipeline(id));
  return json({ ok: true }, 202);
});
