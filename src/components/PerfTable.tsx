import type { Perf } from "../lib/queries";
import { Link } from "../lib/router";
import { Badge, Bar, accTone } from "./ui";

export function PerfTable({ rows, empty = "No revision attempts yet.", linkTo, limit }: { rows: (Perf & { params?: Record<string, string> })[]; empty?: string; linkTo?: string; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  if (!shown.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr><th className="py-1.5 pr-3 font-medium">Name</th><th className="pr-3 font-medium">Qs</th><th className="pr-3 font-medium">Attempts</th><th className="pr-3 font-medium">Correct</th><th className="pr-3 font-medium">Hard</th><th className="pr-3 font-medium">Incorrect</th><th className="w-36 font-medium">Accuracy</th></tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="py-2 pr-3 font-medium">
                {linkTo && r.params ? <Link to={linkTo} params={r.params} className="hover:text-brand">{r.label}</Link> : r.label}
                {r.weak && <Badge tone="bad" className="ml-2">Weak</Badge>}
              </td>
              <td className="pr-3 tabular-nums">{r.questions}</td>
              <td className="pr-3 tabular-nums">{r.attempts}</td>
              <td className="pr-3 tabular-nums text-good">{r.correct}</td>
              <td className="pr-3 tabular-nums text-warn">{r.hard}</td>
              <td className="pr-3 tabular-nums text-bad">{r.incorrect}</td>
              <td>
                {r.accuracy === null ? <span className="text-xs text-muted">no data</span> : (
                  <div className="flex items-center gap-2"><div className="flex-1"><Bar value={r.accuracy} tone={accTone(r.accuracy)} /></div><span className="w-9 text-right text-xs tabular-nums">{Math.round(r.accuracy * 100)}%</span></div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
