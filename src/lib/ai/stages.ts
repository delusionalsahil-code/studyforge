import "server-only";
import { callJson } from "@/lib/ai/client";
import {
  ExtractSchema,
  FormulasSchema,
  SimilarSchema,
  SolutionSchema,
  Stage1Schema,
  Stage2Schema,
  TricksSchema,
  VerifySchema,
} from "@/lib/ai/schemas";

const BASE = `You are a meticulous senior faculty member for JEE (Main & Advanced) preparation.
Accuracy matters far more than speed or cleverness.
Hard rules:
- NEVER fabricate a formula, theorem, law, constant or numerical result. If unsure, say so in the designated field.
- Use LaTeX for maths, wrapped in $...$ (inline) or $$...$$ (display). Remember to escape backslashes for JSON (write \\\\frac).
- Reply with exactly ONE JSON object that follows the requested schema. No markdown fences, no commentary.`;

export interface QCtx {
  text: string;
  images?: string[];
  subject?: string;
  chapter?: string;
  topic?: string;
  concepts?: string[];
  questionType?: string;
  difficulty?: string;
}

function ctxBlock(c: QCtx): string {
  const lines = [`QUESTION:\n"""\n${c.text}\n"""`];
  const meta = [
    c.subject && `Subject: ${c.subject}`,
    c.chapter && `Chapter: ${c.chapter}`,
    c.topic && `Topic: ${c.topic}`,
    c.concepts?.length && `Concepts: ${c.concepts.join(", ")}`,
    c.questionType && `Question type: ${c.questionType}`,
    c.difficulty && `Estimated difficulty: ${c.difficulty}`,
  ].filter(Boolean);
  if (meta.length) lines.push(meta.join("\n"));
  if (c.images?.length) lines.push("An image of the source is attached. It may contain several questions: work ONLY on the question text above, using the image just for diagrams/figures.");
  return lines.join("\n\n");
}

/* ------------------------------ extraction ------------------------------ */
export async function extractQuestions(input: { text?: string; image?: string; pdf?: { filename: string; dataUrl: string }; page?: string }) {
  const system = `${BASE}
You convert study material into clean, individual questions.`;
  const user = `Extract EVERY distinct question from the provided ${input.image ? "image" : input.pdf ? "PDF" : "text"} and return JSON:
{"unreadable": boolean, "reason": string, "questions": [{"text": string, "page": string|null}]}
Rules:
- Transcribe each question faithfully, including all options (A)-(D) and given data. Do not solve, shorten or correct it.
- Write maths in LaTeX ($...$). Describe any diagram/figure/graph that is essential as "[Diagram: ...]" inside the question text.
- Keep multi-part questions (a), (b), (c) together as one question. Ignore headers, page numbers, answer keys and solutions.
- If the content is blurry, empty, or contains no question, set "unreadable": true, give a short "reason", and return an empty list.
${input.page ? `Source page hint: ${input.page}` : ""}
${input.text ? `\nCONTENT:\n"""\n${input.text}\n"""` : ""}`;
  return callJson({
    label: "question extraction",
    system,
    user,
    schema: ExtractSchema,
    images: input.image ? [input.image] : undefined,
    files: input.pdf ? [input.pdf] : undefined,
    temperature: 0,
  });
}

/* ----------------------------- classification ---------------------------- */
export async function classifyStage1(q: QCtx, taxonomyContext: string, defaults: { exam?: string; class?: string }) {
  const user = `Classify the question at the top levels of the academic hierarchy.
${ctxBlock(q)}

ALLOWED VALUES (choose ONLY from this list, copy names EXACTLY; use "unknown" if nothing fits):
${taxonomyContext}

${defaults.exam || defaults.class ? `The student usually prepares for: ${[defaults.exam, defaults.class].filter(Boolean).join(", ")} (use only as a tie-breaker).` : ""}
Determine in order: exam, class, subject, unit, chapter. For JEE choose "JEE Main" unless the question is clearly Advanced-only in style (multi-correct, paragraph, integer-type of advanced depth).
Return JSON:
{"exam": string, "class": string, "subject": string, "unit": string, "chapter": string,
 "confidence": {"exam": 0-1, "class": 0-1, "subject": 0-1, "unit": 0-1, "chapter": 0-1}}
Be honest about confidence; use lower values when the question could belong to several chapters.`;
  return callJson({ label: "classification (stage 1)", system: BASE, user, schema: Stage1Schema, temperature: 0 });
}

export async function classifyStage2(q: QCtx, chapterTree: string) {
  const user = `The question belongs to the chapter below. Classify it at the deeper levels.
${ctxBlock(q)}

TAXONOMY OF THIS CHAPTER (choose ONLY names that appear here, copied EXACTLY; use "unknown" when nothing fits - NEVER invent or re-spell a name):
${chapterTree}

Determine in order: subchapter, topic, subtopic, concepts (all relevant concepts from the list, most important first), question_type, difficulty (Easy | Medium | Hard | Very Hard), tags (short lowercase keywords, e.g. "ohms-law", "graph-based", "calculation-heavy").
If a level really exists for this question but is missing from the taxonomy, return "unknown" for that level and describe the ideal category in "suggestions" (e.g. {"topic": "Kirchhoff's rules in loops"}).
Return JSON:
{"subchapter": string, "topic": string, "subtopic": string, "concepts": [string],
 "question_type": string, "difficulty": string, "difficulty_confidence": 0-1,
 "tags": [string],
 "confidence": {"subchapter": 0-1, "topic": 0-1, "subtopic": 0-1, "concept": 0-1, "question_type": 0-1},
 "suggestions": {}}
Difficulty reflects the number of concepts, length of calculation, trickiness and typical JEE level. Do not be overconfident.`;
  return callJson({ label: "classification (stage 2)", system: BASE, user, schema: Stage2Schema, temperature: 0 });
}

/* -------------------------------- solution ------------------------------- */
export async function solveQuestion(q: QCtx) {
  const user = `Solve the question completely and carefully.
${ctxBlock(q)}

Return JSON:
{
 "solution_type": "numerical" | "theory" | "proof",
 "answerable": boolean,            // false if the question is incomplete/ambiguous/unreadable
 "issues": string,                 // describe missing data or ambiguity (else "")
 "given": [string],                // numerical: given data
 "required": string,               // numerical: what to find; theory: the exact thing asked
 "concept": string,                // core concept / principle / definition
 "approach": string,
 "steps": [string],                // numerical: step-by-step calculation incl. substitution and units; theory: explanation; proof: sequential derivation
 "unit_handling": string,          // unit conversions/consistency (else "")
 "final_answer": string,           // numerical value with unit / option letter / final statement
 "verification": string,           // a quick independent sanity check (limits, dimensions, substitution, alternate route)
 "important_points": [string],     // theory: important points to remember
 "exam_ready_answer": string,      // theory/proof: concise exam-ready answer (else "")
 "assumptions": [string],          // proof/derivation assumptions
 "validity_conditions": string,    // conditions of validity of the result (else "")
 "hints": [string, string, string],// progressive hints, see below
 "confidence": 0-1
}
Rules:
- Numerical: Given, Find, Concept, Formula, Steps, Units, Final answer, Quick verification. Theory: definition, core concept, explanation, equations, important points, exam-ready answer. Proof/derivation: starting principle, assumptions, derivation, final result, validity conditions.
- For multiple-choice, state the correct option AND its value.
- Hints must NOT reveal the final answer. hints[0]: only identify the concept/chapter idea. hints[1]: name the formula or key idea needed. hints[2]: give the very next concrete step (set-up), without finishing the calculation.
- Do the arithmetic carefully and re-check it.`;
  return callJson({ label: "solution", system: BASE, user, schema: SolutionSchema, images: q.images, temperature: 0.1 });
}

export async function verifySolution(q: QCtx, finalAnswer: string) {
  const user = `You are an independent checker. First solve this question yourself from scratch WITHOUT assuming any given answer, then compare with the candidate final answer.
${ctxBlock(q)}

CANDIDATE FINAL ANSWER: ${finalAnswer}

Return JSON:
{"independent_working": string (brief), "independent_answer": string, "matches": boolean (equivalent value/option/statement, allowing trivial formatting or rounding differences), "confidence": 0-1, "notes": string (explain any disagreement)}`;
  return callJson({ label: "solution verification", system: BASE, user, schema: VerifySchema, images: q.images, temperature: 0 });
}

/* -------------------------------- formulas ------------------------------- */
export async function extractFormulas(q: QCtx, solutionText: string, existingNames: string[]) {
  const user = `List every important formula, law or theorem actually USED in the solution below (not formulas that were merely mentioned).
${ctxBlock(q)}

SOLUTION:
${solutionText}

${existingNames.length ? `FORMULA VAULT (already saved for this chapter). If a formula is the same as one of these, reuse its EXACT name:\n- ${existingNames.join("\n- ")}\n` : ""}
Return JSON:
{"formulas": [{
 "name": string,                 // canonical name, e.g. "Ohm's law"
 "expression": string,           // plain readable form, e.g. "V = I R"
 "latex": string,                // LaTeX without $ delimiters
 "variables": [{"symbol": string, "meaning": string, "unit": string}],
 "units": string,                // SI units of the result, "" if dimensionless/not applicable
 "when_to_use": string,
 "restrictions": string,         // conditions / limits of validity
 "concepts": [string]            // concept names the formula belongs to
}]}
Only include correct, standard results. Do not invent formulas. Prefer general forms over problem-specific substitutions.`;
  return callJson({ label: "formula extraction", system: BASE, user, schema: FormulasSchema, temperature: 0 });
}

/* ---------------------------- tricks & mistakes --------------------------- */
export async function detectTricks(q: QCtx, solutionText: string, finalAnswer: string) {
  const user = `1) Decide whether a genuinely VALID shortcut exists for this question. 2) List the likely mistakes students make.
${ctxBlock(q)}

SOLUTION (final answer: ${finalAnswer}):
${solutionText}

Return JSON:
{"has_trick": boolean,
 "tricks": [{"name": string, "shortcut_explanation": string, "when_it_works": string, "why_it_works": string, "limitations": string,
             "normal_method": string, "shortcut_method": string,
             "validity_check": string  // apply the shortcut to THIS question and show it gives the same final answer
 }],
 "no_trick_note": string,        // if has_trick is false: "No special shortcut identified."
 "common_mistakes": [{"category": "sign convention | unit conversion | wrong formula | wrong limit | incorrect assumption | algebra mistake | approximation misuse | graph interpretation | reaction condition | other",
                       "title": string, "description": string, "prevention_tip": string}]}
Rules:
- NEVER invent a trick just to look smart. If there is no meaningful shortcut, set has_trick=false, tricks=[] and no_trick_note="No special shortcut identified."
- A trick must be mathematically/logically valid, state when it fails, and reproduce the final answer.
- Give 2-4 realistic common mistakes specific to this question.`;
  return callJson({ label: "trick & mistake detection", system: BASE, user, schema: TricksSchema, temperature: 0.1 });
}

/* ------------------------------ similar questions ------------------------ */
export type SimilarMode = "values" | "wording" | "harder" | "easier" | "mix";

export async function generateSimilar(q: QCtx, mode: SimilarMode, count: number, finalAnswer: string) {
  const modeText: Record<SimilarMode, string> = {
    values: "same concept and structure but DIFFERENT numerical values/parameters",
    wording: "same concept tested with a DIFFERENT scenario and wording",
    harder: "same concept but noticeably HARDER (extra step or twist)",
    easier: "same concept but EASIER (more direct)",
    mix: "a mix: different values, different wording, one harder and one easier",
  };
  const user = `Create ${count} new practice question(s) based on the original.
${ctxBlock(q)}
Original final answer: ${finalAnswer}

Variation requested: ${modeText[mode]}.
Rules: do not copy the original verbatim; keep the tested concept; the question must be well-posed, self-contained, solvable and use physically/mathematically sensible data. Compute "expected_answer" carefully and double-check it.
Return JSON: {"questions": [{"text": string, "variation": string (what changed), "expected_answer": string, "solution_outline": string (key steps)}]}`;
  return callJson({ label: "similar question generation", system: BASE, user, schema: SimilarSchema, temperature: 0.7 });
}
