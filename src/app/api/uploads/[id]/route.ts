import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { ApiError, assertUuid, routeP } from "@/lib/api";
import { apiUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Original uploads are only ever served to their owner. */
export const GET = routeP<{ id: string }>(async (_req, { id }) => {
  const user = await apiUser();
  assertUuid(id);
  const [u] = await db.select().from(uploads).where(and(eq(uploads.id, id), eq(uploads.userId, user.id))).limit(1);
  if (!u) throw new ApiError(404, "File not found.", "NOT_FOUND");
  return new Response(new Uint8Array(u.data), {
    headers: {
      "content-type": u.mime,
      "content-disposition": `inline; filename="${encodeURIComponent(u.filename)}"`,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
});
