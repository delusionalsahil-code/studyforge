import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { questions } from "@/db/schema";
import { ApiError, json, routeP } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { runQuestionPipeline } from "@/lib/pipeline";
import { ownedQuestion } from "@/lib/questions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ action: z.enum(["keep", "merge"]) });

/** Resolves a "this question already exists" warning: save anyway, or merge metadata into the existing question. */
export const POST = routeP<{ id: string }>(async (req, { id }) => {
  const user = await apiUser();
  const q = await ownedQuestion(user.id, id);
  const { action } = Body.parse(await req.json().catch(() => ({})));
  if (q.processingStatus !== "duplicate_pending") throw new ApiError(409, "This question has no pending duplicate warning.", "NOT_PENDING");

  if (action === "keep") {
    await db.update(questions).set({ processingStatus: "queued" }).where(and(eq(questions.id, id), eq(questions.userId, user.id)));
    after(() => runQuestionPipeline(id));
    return json({ ok: true, id }, 202);
  }

  if (!q.duplicateOfId) throw new ApiError(409, "The original question no longer exists. Use “Save anyway”.", "ORIGINAL_MISSING");
  const target = await ownedQuestion(user.id, q.duplicateOfId).catch(() => null);
  if (!target) throw new ApiError(409, "The original question no longer exists. Use “Save anyway”.", "ORIGINAL_MISSING");
  const seen = [q.sourceName, q.sourcePage ? `p. ${q.sourcePage}` : null].filter(Boolean).join(", ");
  const note = seen ? `Also appeared in: ${seen} (${new Date().toISOString().slice(0, 10)})` : null;
  await db.transaction(async (tx) => {
    await tx
      .update(questions)
      .set({
        sourceName: target.sourceName ?? q.sourceName,
        sourcePage: target.sourcePage ?? q.sourcePage,
        imageUploadId: target.imageUploadId ?? q.imageUploadId,
        pdfUploadId: target.pdfUploadId ?? q.pdfUploadId,
        notes: note ? [target.notes, note].filter(Boolean).join("\n") : target.notes,
      })
      .where(eq(questions.id, target.id));
    await tx.delete(questions).where(and(eq(questions.id, id), eq(questions.userId, user.id)));
  });
  return json({ ok: true, mergedInto: target.id });
});
