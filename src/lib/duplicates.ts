import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { questionEmbeddings, questions } from "@/db/schema";
import { embed } from "@/lib/ai/client";
import { cosine, normalizeQuestionText, sha256, tokenSimilarity, truncate } from "@/lib/text";

export interface DuplicateMatch {
  id: string;
  score: number;
  kind: "exact" | "similar" | "semantic";
  text: string;
}

export const SIMILAR_THRESHOLD = 0.85;
export const SEMANTIC_THRESHOLD = 0.93;

/** Same-or-very-similar detection: normalised hash, token overlap, and (when available) embedding similarity. */
export async function findDuplicates(userId: string, text: string, excludeId?: string): Promise<DuplicateMatch[]> {
  const norm = normalizeQuestionText(text);
  if (!norm) return [];
  const hash = sha256(norm);
  const rows = await db
    .select({ id: questions.id, norm: questions.normalizedText, text: questions.originalText, hash: questions.textHash })
    .from(questions)
    .where(and(eq(questions.userId, userId), ne(questions.processingStatus, "duplicate_pending"), excludeId ? ne(questions.id, excludeId) : undefined))
    .limit(5000);

  const found = new Map<string, DuplicateMatch>();
  for (const r of rows) {
    if (r.hash === hash) {
      found.set(r.id, { id: r.id, score: 1, kind: "exact", text: truncate(r.text, 240) });
      continue;
    }
    const s = tokenSimilarity(norm, r.norm);
    if (s >= SIMILAR_THRESHOLD) found.set(r.id, { id: r.id, score: s, kind: "similar", text: truncate(r.text, 240) });
  }

  if (!found.size) {
    const emb = await embed(norm);
    if (emb) {
      const stored = await db.select({ id: questionEmbeddings.questionId, v: questionEmbeddings.embedding }).from(questionEmbeddings).where(eq(questionEmbeddings.userId, userId));
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const s of stored) {
        const row = byId.get(s.id);
        if (!row) continue;
        const c = cosine(emb.vector, s.v);
        if (c >= SEMANTIC_THRESHOLD && tokenSimilarity(norm, row.norm) >= 0.55) {
          found.set(s.id, { id: s.id, score: c, kind: "semantic", text: truncate(row.text, 240) });
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 3);
}
