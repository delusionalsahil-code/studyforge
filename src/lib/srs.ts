/**
 * Adaptive spaced-repetition engine.
 *
 * - New questions follow the ladder Day 1 → 3 → 7 → 14 → 30.
 * - After every review the user rates: again | hard | good | easy | mastered.
 * - The next interval adapts to the rating, the item's ease factor, lapses,
 *   hints used and how long the user needed.
 */
export type Rating = "again" | "hard" | "good" | "easy" | "mastered";
export const RATINGS: Rating[] = ["again", "hard", "good", "easy", "mastered"];
export const LADDER = [1, 3, 7, 14, 30];
const MIN_EASE = 1.3;
const MAX_EASE = 3.2;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export interface SrsState {
  intervalDays: number;
  ease: number;
  step: number;
  repetitions: number;
  lapses: number;
  status: "new" | "learning" | "review" | "mastered";
}

export interface ReviewSignals {
  rating: Rating;
  hintsUsed: number;
  timeSpentSec: number;
}

export interface SrsResult extends SrsState {
  dueAt: Date;
  lastRating: Rating;
}

export const INITIAL_STATE: SrsState = {
  intervalDays: 1,
  ease: 2.5,
  step: 0,
  repetitions: 0,
  lapses: 0,
  status: "new",
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function firstDueDate(from = new Date()): Date {
  return new Date(from.getTime() + LADDER[0] * DAY);
}

export function scheduleNext(prev: SrsState, s: ReviewSignals, now = new Date()): SrsResult {
  let { ease, step, repetitions, lapses } = prev;
  let rating = s.rating;

  // Heavy hint use or a very slow solve means a "good" was really a struggle.
  if (rating === "good" && (s.hintsUsed >= 2 || s.timeSpentSec > 900)) rating = "hard";

  let intervalDays: number;
  let status: SrsState["status"] = "review";
  let dueMs: number;

  switch (rating) {
    case "again": {
      lapses += 1;
      ease = clamp(ease - 0.2, MIN_EASE, MAX_EASE);
      step = 0;
      repetitions = 0;
      status = "learning";
      intervalDays = 0;
      dueMs = now.getTime() + 10 * MINUTE; // revisit soon, within today's session
      return { intervalDays, ease, step, repetitions, lapses, status, dueAt: new Date(dueMs), lastRating: s.rating };
    }
    case "hard": {
      ease = clamp(ease - 0.15, MIN_EASE, MAX_EASE);
      intervalDays = Math.max(1, Math.round(Math.max(prev.intervalDays, 1) * 1.2));
      // a hard answer never advances the ladder
      repetitions += 1;
      status = "learning";
      break;
    }
    case "good": {
      repetitions += 1;
      step = Math.min(step + 1, LADDER.length);
      if (step < LADDER.length) {
        // scale the ladder by how easy this particular item has been for the user
        intervalDays = Math.max(LADDER[step], Math.round(LADDER[step] * (ease / 2.5)));
        intervalDays = Math.max(intervalDays, Math.ceil(prev.intervalDays) + 1);
      } else {
        intervalDays = Math.max(LADDER[LADDER.length - 1], Math.round(prev.intervalDays * ease));
      }
      break;
    }
    case "easy": {
      repetitions += 1;
      ease = clamp(ease + 0.15, MIN_EASE, MAX_EASE);
      step = Math.min(step + 2, LADDER.length);
      const ladderBase = LADDER[Math.min(step, LADDER.length - 1)];
      intervalDays = Math.max(ladderBase, Math.round(Math.max(prev.intervalDays, 1) * ease * 1.3));
      break;
    }
    case "mastered": {
      repetitions += 1;
      ease = clamp(ease + 0.2, MIN_EASE, MAX_EASE);
      step = LADDER.length;
      intervalDays = Math.max(90, Math.round(Math.max(prev.intervalDays, 1) * 3));
      status = "mastered";
      break;
    }
  }
  intervalDays = clamp(intervalDays, 1, 365);
  if (step >= LADDER.length && status !== "mastered" && repetitions >= LADDER.length + 2 && ease >= 2.8) {
    status = "mastered";
  }
  dueMs = now.getTime() + intervalDays * DAY;
  return { intervalDays, ease, step, repetitions, lapses, status, dueAt: new Date(dueMs), lastRating: s.rating };
}

/** Preview of the interval each button would produce (shown on rating buttons). */
export function previewIntervals(prev: SrsState, hintsUsed: number, timeSpentSec: number, now = new Date()) {
  const out = {} as Record<Rating, string>;
  for (const rating of RATINGS) {
    const r = scheduleNext(prev, { rating, hintsUsed, timeSpentSec }, now);
    out[rating] = r.intervalDays === 0 ? "10 min" : r.intervalDays >= 60 ? `${Math.round(r.intervalDays / 30)} mo` : `${r.intervalDays} d`;
  }
  return out;
}

/** Weighted accuracy of a set of ratings (again=0, hard=0.5, good/easy/mastered=1). */
export function weightedAccuracy(counts: { again: number; hard: number; good: number; easy: number; mastered: number }) {
  const n = counts.again + counts.hard + counts.good + counts.easy + counts.mastered;
  if (!n) return null;
  return (counts.hard * 0.5 + counts.good + counts.easy + counts.mastered) / n;
}

const ORDER = ["Easy", "Medium", "Hard", "Very Hard"] as const;
/** Difficulty implied by the user's own history on a question (needs >= 4 attempts). */
export function perceivedDifficulty(ratings: Rating[]): string | null {
  if (ratings.length < 4) return null;
  const acc = weightedAccuracy({
    again: ratings.filter((r) => r === "again").length,
    hard: ratings.filter((r) => r === "hard").length,
    good: ratings.filter((r) => r === "good").length,
    easy: ratings.filter((r) => r === "easy").length,
    mastered: ratings.filter((r) => r === "mastered").length,
  });
  if (acc === null) return null;
  return acc < 0.3 ? ORDER[3] : acc < 0.55 ? ORDER[2] : acc < 0.8 ? ORDER[1] : ORDER[0];
}
