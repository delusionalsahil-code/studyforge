import { z } from "zod";

/** Accepts 0..1 or 0..100 and returns 0..1. */
const conf = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n === "number" && Number.isFinite(n)) return n > 1 && n <= 100 ? n / 100 : n;
  return v;
}, z.number().min(0).max(1));

const text = z.string().nullish().transform((v) => (v ?? "").trim());
const nonEmpty = z.string().trim().min(1);
const strList = z
  .array(z.union([z.string(), z.number()]).transform((v) => String(v).trim()))
  .nullish()
  .transform((v) => (v ?? []).filter(Boolean));

const difficulty = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const s = v.toLowerCase().replace(/[_-]/g, " ").trim();
    if (s === "easy" || s === "simple" || s === "basic") return "Easy";
    if (s === "medium" || s === "moderate") return "Medium";
    if (s === "hard" || s === "difficult") return "Hard";
    if (["very hard", "very difficult", "veryhard", "extreme", "extremely hard"].includes(s)) return "Very Hard";
    return v;
  },
  z.enum(["Easy", "Medium", "Hard", "Very Hard"]),
);

/* ---------- extraction (OCR / splitting) ---------- */
export const ExtractSchema = z.object({
  unreadable: z.boolean().default(false),
  reason: text,
  questions: z
    .array(
      z.object({
        text: nonEmpty,
        page: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
      }),
    )
    .default([]),
});

/* ---------- classification ---------- */
export const Stage1Schema = z.object({
  exam: text,
  class: text,
  subject: text,
  unit: text,
  chapter: text,
  confidence: z.record(z.string(), conf).default({}),
});

export const Stage2Schema = z.object({
  subchapter: text,
  topic: text,
  subtopic: text,
  concepts: strList,
  question_type: text,
  difficulty,
  difficulty_confidence: conf.default(0.5),
  tags: strList,
  confidence: z.record(z.string(), conf).default({}),
  suggestions: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
});

/* ---------- solution ---------- */
const solutionType = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const s = v.toLowerCase();
  if (s.includes("proof") || s.includes("deriv")) return "proof";
  if (s.includes("theor") || s.includes("concept") || s.includes("explain")) return "theory";
  return "numerical";
}, z.enum(["numerical", "theory", "proof"]));

export const SolutionSchema = z.object({
  solution_type: solutionType,
  answerable: z.boolean().default(true),
  issues: text,
  given: strList,
  required: text,
  concept: text,
  approach: nonEmpty,
  steps: z.array(z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1))).min(1),
  unit_handling: text,
  final_answer: nonEmpty,
  verification: nonEmpty,
  important_points: strList,
  exam_ready_answer: text,
  assumptions: strList,
  validity_conditions: text,
  hints: z
    .array(z.string().trim().min(1))
    .min(3)
    .transform((a) => a.slice(0, 3)),
  confidence: conf.default(0.5),
});

export const VerifySchema = z.object({
  independent_working: text,
  independent_answer: nonEmpty,
  matches: z.boolean(),
  confidence: conf.default(0.5),
  notes: text,
});

/* ---------- formulas ---------- */
export const FormulasSchema = z.object({
  formulas: z
    .array(
      z.object({
        name: nonEmpty,
        expression: nonEmpty,
        latex: text,
        variables: z
          .array(z.object({ symbol: nonEmpty, meaning: nonEmpty, unit: text }))
          .nullish()
          .transform((v) => v ?? []),
        units: text,
        when_to_use: text,
        restrictions: text,
        concepts: strList,
      }),
    )
    .default([]),
});

/* ---------- tricks + mistakes ---------- */
export const TricksSchema = z
  .object({
    has_trick: z.boolean(),
    tricks: z
      .array(
        z.object({
          name: nonEmpty,
          shortcut_explanation: nonEmpty,
          when_it_works: nonEmpty,
          why_it_works: nonEmpty,
          limitations: nonEmpty,
          normal_method: nonEmpty,
          shortcut_method: nonEmpty,
          validity_check: nonEmpty,
        }),
      )
      .default([]),
    no_trick_note: text,
    common_mistakes: z
      .array(
        z.object({
          category: text,
          title: nonEmpty,
          description: nonEmpty,
          prevention_tip: nonEmpty,
        }),
      )
      .min(1),
  })
  .superRefine((v, ctx) => {
    if (v.has_trick && v.tricks.length === 0) ctx.addIssue({ code: "custom", message: "has_trick is true but no tricks given", path: ["tricks"] });
    if (!v.has_trick && v.tricks.length > 0) ctx.addIssue({ code: "custom", message: "has_trick is false but tricks were listed", path: ["tricks"] });
  });

/* ---------- similar questions ---------- */
export const SimilarSchema = z.object({
  questions: z
    .array(
      z.object({
        text: nonEmpty,
        variation: text,
        expected_answer: text,
        solution_outline: text,
      }),
    )
    .min(1),
});

export type ExtractOut = z.output<typeof ExtractSchema>;
export type Stage1Out = z.output<typeof Stage1Schema>;
export type Stage2Out = z.output<typeof Stage2Schema>;
export type SolutionOut = z.output<typeof SolutionSchema>;
export type VerifyOut = z.output<typeof VerifySchema>;
export type FormulasOut = z.output<typeof FormulasSchema>;
export type TricksOut = z.output<typeof TricksSchema>;
export type SimilarOut = z.output<typeof SimilarSchema>;
