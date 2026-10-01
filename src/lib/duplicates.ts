import { embed } from "./ai/client";
import { getDB } from "./store";
import { cosine, normalizeQuestionText, sha256, tokenSimilarity, truncate } from "./text";

export interface DuplicateMatch {
  id: string;
  score: number;
  kind: "exact" | "similar" | "semantic";
  text: string;
}

export const SIMILAR_THRESHOLD = 0.85;
export const SEMANTIC_THRESHOLD = 0.93;

/** Same-or-very-similar detection: normalised hash, token overlap, and (when available) embedding similarity. */
export async function findDuplicates(text: string, excludeId?: string): Promise<DuplicateMatch[]> {
  const norm = normalizeQuestionText(text);
  if (!norm) return [];
  const hash = sha256(norm);
  const db = getDB();
  const rows = db.questions.filter((q) => q.processingStatus !== "duplicate_pending" && q.id !== excludeId);
  const found = new Map<string, DuplicateMatch>();
  for (const r of rows) {
    if (r.textHash === hash) {
      found.set(r.id, { id: r.id, score: 1, kind: "exact", text: truncate(r.originalText, 240) });
      continue;
    }
    const s = tokenSimilarity(norm, r.normalizedText);
    if (s >= SIMILAR_THRESHOLD) found.set(r.id, { id: r.id, score: s, kind: "similar", text: truncate(r.originalText, 240) });
  }
  if (!found.size && Object.keys(db.embeddings).length) {
    const emb = await embed(norm);
    if (emb) {
      for (const r of rows) {
        const v = db.embeddings[r.id];
        if (!v) continue;
        const c = cosine(emb.vector, v);
        if (c >= SEMANTIC_THRESHOLD && tokenSimilarity(norm, r.normalizedText) >= 0.55) {
          found.set(r.id, { id: r.id, score: c, kind: "semantic", text: truncate(r.originalText, 240) });
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 3);
}
