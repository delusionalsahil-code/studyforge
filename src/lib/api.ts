import "server-only";
import { ZodError } from "zod";
import { AiError } from "@/lib/ai/client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function toResponse(e: unknown): Response {
  if (e instanceof ApiError) {
    return Response.json({ error: e.message, code: e.code, ...(e.extra ?? {}) }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const msg = e.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    return Response.json({ error: `Invalid request: ${msg}`, code: "VALIDATION" }, { status: 400 });
  }
  if (e instanceof AiError) {
    const status = e.code === "NOT_CONFIGURED" ? 503 : e.code === "RATE_LIMIT" ? 429 : e.code === "TIMEOUT" ? 504 : 502;
    return Response.json({ error: e.message, code: e.code }, { status });
  }
  console.error("[api] unhandled error", e);
  return Response.json({ error: "Something went wrong on the server. Please try again.", code: "INTERNAL" }, { status: 500 });
}

/** Route handler without dynamic params. */
export function route0(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      return toResponse(e);
    }
  };
}

/** Route handler with dynamic params. */
export function routeP<P>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      return await fn(req, await ctx.params);
    } catch (e) {
      return toResponse(e);
    }
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);
export function assertUuid(s: unknown, what = "id"): string {
  if (!isUuid(s)) throw new ApiError(400, `Invalid ${what}`, "VALIDATION");
  return s;
}
