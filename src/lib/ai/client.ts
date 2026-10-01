import type { z } from "zod";

/**
 * Browser AI gateway (OpenAI-compatible Chat Completions API).
 * NOTE: this static build has no server. The API key is entered by the user in Settings and
 * stays in this browser (IndexedDB); requests go directly from the browser to the provider
 * you configure. For a shared deployment, move this module behind a server route.
 */
export type AiErrorCode = "NOT_CONFIGURED" | "TIMEOUT" | "RATE_LIMIT" | "UPSTREAM" | "MALFORMED" | "UNREADABLE" | "UNSUPPORTED_PDF" | "NETWORK";

export class AiError extends Error {
  constructor(public code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
  }
}

export interface AiSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  embeddingModel: string; // "" disables embeddings
  timeoutMs: number;
}

export const DEFAULT_AI: AiSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o",
  embeddingModel: "text-embedding-3-small",
  timeoutMs: 120_000,
};

let current: AiSettings = DEFAULT_AI;
export function configureAi(s: Partial<AiSettings>) {
  current = { ...DEFAULT_AI, ...s, baseUrl: (s.baseUrl || DEFAULT_AI.baseUrl).replace(/\/+$/, "") };
}
export const aiConfig = () => current;
export const aiConfigured = () => Boolean(current.apiKey.trim());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(path: string, body: Record<string, unknown>, retryWithoutJsonMode = true): Promise<unknown> {
  if (!aiConfigured()) {
    throw new AiError("NOT_CONFIGURED", "AI is not configured. Open Settings, add your API key (any OpenAI-compatible provider) and retry.");
  }
  const cfg = current;
  let lastErr: AiError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey.trim()}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.ok) return await res.json();
      const text = await res.text().catch(() => "");
      if (res.status === 429) {
        lastErr = new AiError("RATE_LIMIT", "The AI provider rate-limited the request. Wait a moment and retry.");
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (res.status === 400 && retryWithoutJsonMode && "response_format" in body && /response_format|json_object|json mode/i.test(text)) {
        const rest = { ...body };
        delete rest.response_format;
        return post(path, rest, false);
      }
      if (res.status === 401 || res.status === 403) throw new AiError("UPSTREAM", "The AI provider rejected the API key (check it in Settings).");
      if (res.status >= 500) {
        lastErr = new AiError("UPSTREAM", `The AI provider failed (${res.status}). ${text.slice(0, 160)}`);
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw new AiError("UPSTREAM", `AI request failed (${res.status}): ${text.slice(0, 240)}`);
    } catch (e) {
      if (e instanceof AiError && (e.code === "UPSTREAM" && /rejected|request failed/.test(e.message))) throw e;
      if (e instanceof AiError) lastErr = e;
      else if (e instanceof DOMException && e.name === "AbortError") lastErr = new AiError("TIMEOUT", "The AI took too long to respond. Please retry.");
      else lastErr = new AiError("NETWORK", "Could not reach the AI provider (network error, or the provider blocks browser requests / CORS).");
      if (attempt < 2) await sleep(800 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new AiError("UPSTREAM", "AI request failed");
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
  images?: string[];
  files?: { filename: string; dataUrl: string }[];
  temperature?: number;
}

/** Calls the model, requires JSON, validates against the schema, and repairs once if malformed. Malformed output is never stored. */
export async function callJson<S extends z.ZodType>(args: CallJsonArgs<S>): Promise<z.output<S>> {
  const cfg = current;
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
      lastIssue = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    } catch (e) {
      lastIssue = e instanceof Error ? e.message : "invalid JSON";
    }
    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: `Your previous reply was rejected by the validator (${lastIssue}). Reply again with ONLY a corrected JSON object that follows the required schema exactly.` });
  }
  throw new AiError("MALFORMED", `AI returned malformed output for "${args.label}" (${lastIssue}). Nothing was saved; please retry.`);
}

/** Returns null when embeddings are disabled/unavailable (callers must degrade gracefully). */
export async function embed(text: string): Promise<{ vector: number[]; model: string } | null> {
  const cfg = current;
  if (!aiConfigured() || !cfg.embeddingModel) return null;
  try {
    const data = (await post("/embeddings", { model: cfg.embeddingModel, input: text.slice(0, 6000) })) as { data?: { embedding?: number[] }[] };
    const vector = data.data?.[0]?.embedding;
    return vector?.length ? { vector, model: cfg.embeddingModel } : null;
  } catch {
    return null;
  }
}
