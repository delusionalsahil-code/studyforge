import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { sha256 } from "@/lib/text";

const COOKIE = "sid";
const SESSION_DAYS = 30;

export type SessionUser = typeof users.$inferSelect;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ userId, tokenHash: sha256(token), expiresAt });
  const h = await headers();
  const secure = h.get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
});

/** For server components / pages: redirects to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/** For route handlers: throws 401 JSON error. */
export async function apiUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "You need to sign in to do that.", "UNAUTHENTICATED");
  return user;
}

export async function apiAdmin(): Promise<SessionUser> {
  const user = await apiUser();
  if (user.role !== "admin") throw new ApiError(403, "Admin access required.", "FORBIDDEN");
  return user;
}

// Minimal in-memory throttle for credential endpoints.
const attempts = new Map<string, { n: number; reset: number }>();
export function throttle(key: string, max = 10, windowMs = 15 * 60_000): void {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.reset < now) {
    attempts.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  rec.n += 1;
  if (rec.n > max) throw new ApiError(429, "Too many attempts. Please wait a few minutes and try again.", "RATE_LIMIT");
}
