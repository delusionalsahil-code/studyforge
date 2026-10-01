import { z } from "zod";
import { json, route0 } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { applyReview } from "@/lib/questions";

export const dynamic = "force-dynamic";

const Body = z.object({
  questionId: z.string().uuid(),
  rating: z.enum(["again", "hard", "good", "easy", "mastered"]),
  solved: z.boolean(),
  hintsUsed: z.number().int().min(0).max(3),
  timeSpentSec: z.number().int().min(0).max(6 * 3600),
  mistakeIds: z.array(z.number().int().positive()).max(20).default([]),
});

/** Records the revision event and recalculates the adaptive schedule. */
export const POST = route0(async (req) => {
  const user = await apiUser();
  const body = Body.parse(await req.json().catch(() => ({})));
  const result = await applyReview(user.id, body);
  return json(result);
});
