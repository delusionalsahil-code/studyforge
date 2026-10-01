import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, json, route0 } from "@/lib/api";
import { apiUser, hashPassword, verifyPassword } from "@/lib/auth";
import { loadTaxonomy } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().max(60).optional(),
  dailyGoal: z.number().int().min(1).max(500).optional(),
  defaultExamId: z.number().int().positive().nullable().optional(),
  defaultClassId: z.number().int().positive().nullable().optional(),
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(200).optional(),
});

export const PATCH = route0(async (req) => {
  const user = await apiUser();
  const b = Body.parse(await req.json().catch(() => ({})));
  const set: Partial<typeof users.$inferInsert> = {};
  if (b.name !== undefined) set.name = b.name;
  if (b.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: b.timezone });
    } catch {
      throw new ApiError(400, "Unknown time zone. Use an IANA name such as Asia/Kolkata.", "VALIDATION");
    }
    set.timezone = b.timezone;
  }
  if (b.dailyGoal !== undefined) set.dailyGoal = b.dailyGoal;
  const tax = await loadTaxonomy();
  if (b.defaultExamId !== undefined) {
    if (b.defaultExamId && !tax.get("exam", b.defaultExamId)) throw new ApiError(400, "Unknown exam", "VALIDATION");
    set.defaultExamId = b.defaultExamId;
  }
  if (b.defaultClassId !== undefined) {
    if (b.defaultClassId && !tax.get("class", b.defaultClassId)) throw new ApiError(400, "Unknown class", "VALIDATION");
    set.defaultClassId = b.defaultClassId;
  }
  if (b.newPassword) {
    if (!b.currentPassword || !verifyPassword(b.currentPassword, user.passwordHash)) throw new ApiError(400, "Current password is incorrect.", "BAD_CREDENTIALS");
    set.passwordHash = hashPassword(b.newPassword);
  }
  if (!Object.keys(set).length) throw new ApiError(400, "Nothing to update", "VALIDATION");
  await db.update(users).set(set).where(eq(users.id, user.id));
  return json({ ok: true });
});
