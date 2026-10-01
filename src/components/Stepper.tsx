import { STAGES, stageIndex } from "@/lib/stages";

export function Stepper({ stage, status }: { stage: string; status: string }) {
  const current = stageIndex(stage, status);
  const failed = status === "failed";
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-1.5 text-xs" aria-label="Processing stages">
      {STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current && !failed && status !== "completed";
        const bad = i === current && failed;
        return (
          <li
            key={s.key}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              done ? "border-ok/30 bg-ok/10 text-ok" : active ? "border-brand/40 bg-brand-soft font-semibold text-brand" : bad ? "border-bad/40 bg-bad/10 font-semibold text-bad" : "border-line text-muted"
            }`}
            aria-current={active ? "step" : undefined}
          >
            <span aria-hidden>{done ? "✓" : active ? <span className="inline-block size-2 animate-pulse rounded-full bg-brand" /> : bad ? "!" : i + 1}</span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}
