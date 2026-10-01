import Link from "next/link";
import { Bar, pct } from "@/components/ui";
import type { PerfRow } from "@/lib/queries";

const VERDICT: Record<PerfRow["verdict"], [string, string]> = {
  weak: ["Weak", "border-bad/30 bg-bad/10 text-bad"],
  developing: ["Developing", "border-warn/30 bg-warn/10 text-warn"],
  strong: ["Strong", "border-ok/30 bg-ok/10 text-ok"],
  untested: ["Not revised yet", ""],
};

export function PerfTable({ rows, empty = "No data yet — complete a few revisions to see performance here.", dense = false }: { rows: PerfRow[]; empty?: string; dense?: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs uppercase text-muted">
          <tr>
            <th className="py-2 pr-3">Name</th>
            <th className="pr-3 text-right">Qs</th>
            <th className="pr-3 text-right">Attempts</th>
            <th className="pr-3 text-right">Correct</th>
            <th className="pr-3 text-right">Incorrect</th>
            <th className="w-40 pr-3">Accuracy</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line align-middle">
              <td className={`pr-3 ${dense ? "py-1.5" : "py-2.5"}`}>
                <Link href={r.href} className="font-medium hover:text-brand">
                  {r.name}
                </Link>
                {r.path && <p className="text-xs text-muted">{r.path}</p>}
              </td>
              <td className="pr-3 text-right tabular-nums">{r.questions}</td>
              <td className="pr-3 text-right tabular-nums">{r.attempts}</td>
              <td className="pr-3 text-right tabular-nums">{r.correct}</td>
              <td className="pr-3 text-right tabular-nums">{r.again + r.hard}</td>
              <td className="pr-3">
                {r.accuracy == null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Bar value={r.accuracy} tone={r.accuracy >= 0.85 ? "ok" : r.accuracy >= 0.6 ? "warn" : "bad"} />
                    <span className="w-9 text-right text-xs tabular-nums">{pct(r.accuracy)}</span>
                  </div>
                )}
              </td>
              <td>
                <span className={`badge ${VERDICT[r.verdict][1]}`}>{VERDICT[r.verdict][0]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
