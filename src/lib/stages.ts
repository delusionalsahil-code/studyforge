/** Client-safe processing stage definitions shown in the UI stepper. */
export const STAGES = [
  { key: "uploading", label: "Uploading" },
  { key: "extracting", label: "Extracting" },
  { key: "classifying", label: "Classifying" },
  { key: "solving", label: "Solving" },
  { key: "formulas", label: "Extracting formulas" },
  { key: "tricks", label: "Detecting tricks" },
  { key: "saving", label: "Saving" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

/** Index of the stage currently running; completed = all stages done. */
export function stageIndex(stage: string, status: string): number {
  if (status === "completed") return STAGES.length;
  if (stage === "queued") return 2; // upload + extraction already done for stored questions
  const i = STAGES.findIndex((s) => s.key === stage);
  return i === -1 ? 2 : i;
}
