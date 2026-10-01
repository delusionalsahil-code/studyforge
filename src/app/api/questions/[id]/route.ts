import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { questions } from "@/db/schema";
import { json, routeP } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { ownedQuestion } from "@/lib/questions";

export const dynamic = "force-dynamic";

/** Lightweight status used by the live processing stepper. */
export const GET = routeP<{ id: string }>(async (_req, { id }) => {
  const user = await apiUser();
  const q = await ownedQuestion(user.id, id);
  return json({
    id: q.id,
    status: q.processingStatus,
    stage: q.processingStage,
    error: q.processingError,
    errorCode: q.processingErrorCode,
    stale: q.processingStatus === "processing" && Date.now() - q.heartbeatAt.getTime() > 5 * 60_000,
  });
});

const Patch = z.object({ notes: z.string().max(4000).nullable().optional(), sourceName: z.string().max(120).nullable().optional(), sourcePage: z.string().max(30).nullable().optional() });

export const PATCH = routeP<{ id: string }>(async (req, { id }) => {
  const user = await apiUser();
  await ownedQuestion(user.id, id);
  const b = Patch.parse(await req.json().catch(() => ({})));
  const set: Record<string, unknown> = {};
  if (b.notes !== undefined) set.notes = b.notes?.trim() || null;
  if (b.sourceName !== undefined) set.sourceName = b.sourceName?.trim() || null;
  if (b.sourcePage !== undefined) set.sourcePage = b.sourcePage?.trim() || null;
  if (Object.keys(set).length) await db.update(questions).set(set).where(and(eq(questions.id, id), eq(questions.userId, user.id)));
  return json({ ok: true });
});

export const DELETE = routeP<{ id: string }>(async (_req, { id }) => {
  const user = await apiUser();
  await ownedQuestion(user.id, id);
  await db.delete(questions).where(and(eq(questions.id, id), eq(questions.userId, user.id)));
  return json({ ok: true });
});
