import { embed } from "./ai/client";
import type { Taxonomy } from "./taxonomy";
import type { Level } from "./taxonomy-types";
import { cosine, normalizeName } from "./text";

const STOP = new Set(
  "a an the of on in for from with using use by to and or my me all any some show find get list give questions question problems problem ones about related regarding that which have has are is were was i want need please do does what how can cover covering covers formula formulas".split(" "),
);

export interface Interpretation {
  difficulty?: string;
  status?: "weak" | "mastered" | "due";
  trick?: boolean;
  typeId?: number;
  terms: string[];
  nodes: { level: Level; ids: number[] }[];
  chips: string[];
}

const stem = (t: string) => t.replace(/(ies|es|s)$/, (m) => (m === "ies" ? "y" : ""));

/** Rule-based natural-language understanding: "my weak hard electrostatics numericals with shortcuts". */
export function interpretQuery(raw: string, tax: Taxonomy): Interpretation {
  const out: Interpretation = { terms: [], nodes: [], chips: [] };
  let q = ` ${normalizeName(raw)} `;
  const take = (re: RegExp) => {
    if (re.test(q)) {
      q = q.replace(re, " ");
      return true;
    }
    return false;
  };
  if (take(/ very (hard|difficult) /)) out.difficulty = "Very Hard";
  else if (take(/ (hard|difficult|tough) /)) out.difficulty = "Hard";
  else if (take(/ (easy|simple|basic) /)) out.difficulty = "Easy";
  else if (take(/ (medium|moderate) /)) out.difficulty = "Medium";
  if (out.difficulty) out.chips.push(out.difficulty);
  if (take(/ (weak|weakest|struggling|difficult for me|mistakes?) /)) {
    out.status = "weak";
    out.chips.push("Weak");
  } else if (take(/ (mastered|strong) /)) {
    out.status = "mastered";
    out.chips.push("Mastered");
  } else if (take(/ (due|overdue|pending revision) /)) {
    out.status = "due";
    out.chips.push("Revision due");
  }
  if (take(/ (shortcuts?|tricks?|short cuts?) /)) {
    out.trick = true;
    out.chips.push("Has shortcut");
  }
  const words = q.split(" ").filter((w) => w && !STOP.has(w));
  const rest: string[] = [];
  for (const w of words) {
    const s = stem(w);
    const qt = tax.byLevel.question_type.find((t) => t.active && (stem(normalizeName(t.name)) === s || normalizeName(t.name).split(" ")[0] === s));
    if (qt && !out.typeId) {
      out.typeId = qt.id;
      out.chips.push(qt.name);
    } else rest.push(w);
  }
  out.terms = rest;
  if (rest.length) {
    const stems = rest.map(stem).filter((s) => s.length >= 3);
    const matchLevels: Level[] = ["subject", "chapter", "subchapter", "topic", "subtopic", "concept"];
    for (const level of matchLevels) {
      const ids = tax.byLevel[level]
        .filter((n) => {
          if (!n.active || !stems.length) return false;
          const words = normalizeName(n.name).split(" ");
          return stems.every((s) => words.some((w) => w.startsWith(s) || s.startsWith(stem(w)) && stem(w).length >= 5));
        })
        .map((n) => n.id);
      if (ids.length) out.nodes.push({ level, ids });
    }
    if (out.nodes.length) out.chips.push(`Topics matching “${rest.join(" ")}”`);
  }
  return out;
}

/** Embedding similarity over stored question embeddings (empty when embeddings are unavailable). */
export async function semanticIds(embeddings: Record<string, number[]>, query: string, limit = 40, minScore = 0.3): Promise<string[]> {
  if (!Object.keys(embeddings).length) return [];
  const e = await embed(query);
  if (!e) return [];
  return Object.entries(embeddings)
    .map(([id, v]) => ({ id, s: cosine(e.vector, v) }))
    .filter((r) => r.s >= minScore)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.id);
}
