import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, json, route0 } from "@/lib/api";
import { createSession, throttle, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export const POST = route0(async (req) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  throttle(`login:${body.email}:${req.headers.get("x-forwarded-for") ?? "local"}`, 10);
  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    throw new ApiError(401, "Incorrect email or password.", "BAD_CREDENTIALS");
  }
  await createSession(user.id);
  return json({ ok: true });
});
