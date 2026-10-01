import "server-only";
import type { z } from "zod";

/**
 * Server-side only AI gateway (OpenAI-compatible Chat Completions API).
 * Configure with: AI_API_KEY (or OPENAI_API_KEY), AI_BASE_URL, AI_MODEL,
 * AI_EMBEDDING_MODEL ("none" disables embeddings), AI_TIMEOUT_MS.
 */
export type AiErrorCode =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "UPSTREAM"
  | "MALFORMED"
  | "UNREADABLE"
  | "UNSUPPORTED_PDF";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export function aiConfig() {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
  const embeddingModel = process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  return {
    apiKey,
    baseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.AI_MODEL || "gpt-4o",
    embeddingModel: embeddingModel.toLowerCase() === "none" ? "" : embeddingModel,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 120_000,
  };
}

export function aiConfigured(): boolean {
  return Boolean(aiConfig().apiKey);
}

function assertConfigured() {
  if (!aiConfigured()) {
    throw new AiError(
      "NOT_CONFIGURED",
      "AI is not configured on the server. Set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL) in the environment, then retry.",
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(path: string, body: unknown): Promise<unknown> {
  assertConfigured();
  const cfg = aiConfig();
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.status === 429) {
        if (attempt < 2) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        throw new AiError("RATE_LIMIT", "The AI provider rate limit was hit. Wait a minute and retry.");
      }
      if (res.status >= 500 && attempt < 1) {
        await sleep(1000);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AiError("UPSTREAM", `AI provider error ${res.status}: ${text.slice(0, 300)}`);
      }
      return await res.json();
    } catch (e) {
      if (e instanceof AiError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new AiError("TIMEOUT", "The AI request timed out. Retry in a moment.");
      }
      throw new AiError("UPSTREAM", `Could not reach the AI provider: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AiError("UPSTREAM", "AI request failed after retries.");
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };
type Message = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

function extractJson(raw: string): unknown {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");
  return JSON.parse(s.slice(start, end + 1));
}

export interface CallJsonArgs<S extends z.ZodType> {
  label: string;
  system: string;
  user: string;
  schema: S;
  images?: string[]; // data URLs
  files?: { filename: string; dataUrl: string }[];
  temperature?: number;
}

/** Calls the model, requires JSON, validates against the schema, and repairs once if malformed. */
export async function callJson<S extends z.ZodType>(args: CallJsonArgs<S>): Promise<z.output<S>> {
  const cfg = aiConfig();
  const parts: ContentPart[] = [{ type: "text", text: args.user }];
  for (const url of args.images ?? []) parts.push({ type: "image_url", image_url: { url } });
  for (const f of args.files ?? []) parts.push({ type: "file", file: { filename: f.filename, file_data: f.dataUrl } });
  const messages: Message[] = [
    { role: "system", content: args.system },
    { role: "user", content: parts.length === 1 ? args.user : parts },
  ];

  let lastIssue = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = (await post("/chat/completions", {
      model: cfg.model,
      messages,
      temperature: args.temperature ?? 0.2,
      response_format: { type: "json_object" },
    })) as { choices?: { message?: { content?: string | null } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      lastIssue = "empty response";
      continue;
    }
    try {
      const parsed = args.schema.safeParse(extractJson(content));
      if (parsed.success) return parsed.data;
      lastIssue = parsed.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
    } catch (e) {
      lastIssue = e instanceof Error ? e.message : "invalid JSON";
    }
    messages.push({ role: "assistant", content });
    messages.push({
      role: "user",
      content: `Your previous reply was rejected by the server validator (${lastIssue}). Reply again with ONLY a corrected JSON object that follows the required schema exactly.`,
    });
  }
  throw new AiError("MALFORMED", `AI returned malformed output for "${args.label}" (${lastIssue}). Nothing was saved; please retry.`);
}

/** Returns null when embeddings are disabled/unavailable (callers must degrade gracefully). */
export async function embed(text: string): Promise<{ vector: number[]; model: string } | null> {
  const cfg = aiConfig();
  if (!cfg.apiKey || !cfg.embeddingModel) return null;
  try {
    const data = (await post("/embeddings", { model: cfg.embeddingModel, input: text.slice(0, 6000) })) as {
      data?: { embedding?: number[] }[];
    };
    const vector = data.data?.[0]?.embedding;
    return vector?.length ? { vector, model: cfg.embeddingModel } : null;
  } catch {
    return null;
  }
}
