import { createHash } from "node:crypto";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Canonical form of a name used to match AI output to taxonomy entries (case/punctuation/spacing insensitive). */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Canonical form of question text used for hashing and similarity. */
export function normalizeQuestionText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\\(left|right|text|mathrm|mathbf|displaystyle)\b/g, " ")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\.(?!\d)/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity between two names (after normalisation). */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const lev = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  const ta = new Set(x.split(" "));
  const tb = new Set(y.split(" "));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const containment = inter / Math.min(ta.size, tb.size);
  const jaccard = inter / (ta.size + tb.size - inter);
  // Containment only counts when one name is wholly inside the other and they share >=2 tokens or are short.
  const contained = containment === 1 && (inter >= 2 || Math.min(ta.size, tb.size) === 1) ? 0.84 : 0;
  return Math.max(lev, jaccard, contained);
}

export function tokenSimilarity(a: string, b: string): number {
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  let score = inter / (sa.size + sb.size - inter);
  const nums = (arr: string[]) =>
    arr
      .filter((t) => /\d/.test(t))
      .sort()
      .join(",");
  // Same wording but different numbers => a variant, not a duplicate.
  if (nums(ta) !== nums(tb)) score = Math.min(score, 0.8);
  return score;
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
