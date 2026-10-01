import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { imports } from "@/db/schema";
import { ApiError, assertUuid, json, routeP } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { runImportJob } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = routeP<{ id: string }>(async (_req, { id }) => {
  const user = await apiUser();
  assertUuid(id);
  const [imp] = await db.select().from(imports).where(and(eq(imports.id, id), eq(imports.userId, user.id))).limit(1);
  if (!imp) throw new ApiError(404, "Import not found.", "NOT_FOUND");
  if (imp.status === "processing" && Date.now() - imp.heartbeatAt.getTime() < 5 * 60_000) {
    throw new ApiError(409, "This import is still being processed.", "BUSY");
  }
  after(() => runImportJob(id));
  return json({ ok: true }, 202);
});
