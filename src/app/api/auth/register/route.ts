import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, json, route0 } from "@/lib/api";
import { createSession, hashPassword, throttle } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const POST = route0(async (req) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  throttle(`register:${req.headers.get("x-forwarded-for") ?? "local"}`, 20);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
  if (existing) throw new ApiError(409, "An account with this email already exists. Try signing in.", "EMAIL_TAKEN");
  const [{ n }] = await db.select({ n: count() }).from(users);
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  // the very first account (or any email listed in ADMIN_EMAILS) administers the taxonomy
  const role = n === 0 || adminEmails.includes(body.email) ? "admin" : "user";
  const [user] = await db.insert(users).values({ email: body.email, name: body.name, passwordHash: hashPassword(body.password), role }).returning({ id: users.id });
  await createSession(user.id);
  return json({ ok: true });
});
