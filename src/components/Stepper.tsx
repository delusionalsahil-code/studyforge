import { cn } from "../utils/cn";

export const STAGES = [
  { key: "uploading", label: "Uploading" },
  { key: "extracting", label: "Extracting" },
  { key: "classifying", label: "Classifying" },
  { key: "solving", label: "Solving" },
  { key: "formulas", label: "Extracting formulas" },
  { key: "tricks", label: "Detecting tricks" },
  { key: "saving", label: "Saving" },
] as const;

export function stageIndex(stage: string, status: string): number {
  if (status === "completed") return STAGES.length;
  if (stage === "queued") return 2; // upload + extraction already done for stored questions
  const i = STAGES.findIndex((s) => s.key === stage);
  return i === -1 ? 2 : i;
}

export function Stepper({ stage, status, failed }: { stage: string; status: string; failed?: boolean }) {
  const idx = stageIndex(stage, status);
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs" aria-label="Processing stages">
      {STAGES.map((s, i) => {
        const done = i < idx;
        const active = i === idx && status !== "completed";
        return (
          <li key={s.key} className="flex items-center gap-1">
            <span
              className={cn(
                "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                done && "bg-good text-white dark:text-black",
                active && !failed && "animate-pulse bg-brand text-white dark:text-black",
                active && failed && "bg-bad text-white dark:text-black",
                !done && !active && "bg-surface-2 text-muted",
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={cn(active ? "font-semibold text-fg" : "text-muted")}>{s.label}</span>
            {i < STAGES.length - 1 && <span className="mx-1 text-line">—</span>}
          </li>
        );
      })}
    </ol>
  );
}
