import Link from "next/link";
import { Bar, PageHeader, Stat, pct } from "@/components/ui";
import { PerfTable } from "@/components/PerfTable";
import { requireUser } from "@/lib/auth";
import { getActivity, getOverallStats, getPerformance, getRecurringMistakes, type PerfLevel } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

const LEVELS: { key: PerfLevel; label: string }[] = [
  { key: "subject", label: "Subject" },
  { key: "unit", label: "Unit" },
  { key: "chapter", label: "Chapter" },
  { key: "subchapter", label: "Subchapter" },
  { key: "topic", label: "Topic" },
  { key: "subtopic", label: "Subtopic" },
  { key: "concept", label: "Concept" },
  { key: "formula", label: "Formula" },
];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const user = await requireUser();
  const { level: lv } = await searchParams;
  const level = (LEVELS.find((l) => l.key === lv)?.key ?? "chapter") as PerfLevel;
  const [stats, rows, activity, recurring, weakConcepts, weakFormulas] = await Promise.all([
    getOverallStats(user.id),
    getPerformance(user.id, level),
    getActivity(user.id, user.timezone, 14),
    getRecurringMistakes(user.id),
    getPerformance(user.id, "concept", 300),
    getPerformance(user.id, "formula", 300),
  ]);
  const maxDay = Math.max(1, ...activity.map((a) => a.n));
  const weakC = weakConcepts.filter((c) => c.verdict === "weak").slice(0, 6);
  const weakF = weakFormulas.filter((c) => c.verdict === "weak").slice(0, 6);

  return (
    <>
      <PageHeader title="Analytics" subtitle="Accuracy is weighted: Good/Easy/Mastered = 1, Hard = ½, Again = 0. A level is “weak” below 60% after at least 3 attempts." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Accuracy" value={pct(stats.accuracy)} tone={stats.accuracy == null ? undefined : stats.accuracy >= 0.8 ? "ok" : stats.accuracy >= 0.6 ? "warn" : "bad"} />
        <Stat label="Attempts" value={stats.attempts} />
        <Stat label="Revision success" value={stats.attempts ? pct(stats.correct / stats.attempts) : "—"} hint="Good, Easy or Mastered" />
        <Stat label="Avg solve time" value={stats.avgTime ? `${Math.floor(stats.avgTime / 60)}m ${stats.avgTime % 60}s` : "—"} />
        <Stat label="Hints used" value={stats.hints} />
      </div>

      <section className="card mb-6">
        <h2 className="section-title">Last 14 days</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-muted">No revision activity yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {activity.map((a) => (
              <li key={a.day} className="grid grid-cols-[90px_1fr_80px] items-center gap-3">
                <span className="text-muted">{new Date(a.day + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                <Bar value={a.ok} max={maxDay} tone="ok" />
                <span className="text-right text-xs tabular-nums text-muted">{a.ok}/{a.n} ok</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title">Weak concepts</h2>
          <ul className="space-y-2 text-sm">
            {weakC.length === 0 && <li className="text-muted">None yet — great, or not enough data.</li>}
            {weakC.map((c) => (
              <li key={c.id}>
                <Link href={c.href} className="flex justify-between gap-3 hover:text-brand">
                  <span><b>{c.name}</b><span className="block text-xs text-muted">{c.path} · {c.questions} questions · {c.correct} correct / {c.again + c.hard} incorrect</span></span>
                  <span className="text-bad">{pct(c.accuracy)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2 className="section-title">Weak formulas</h2>
          <ul className="space-y-2 text-sm">
            {weakF.length === 0 && <li className="text-muted">No weak formulas detected.</li>}
            {weakF.map((c) => (
              <li key={c.id}>
                <Link href={c.href} className="flex justify-between gap-3 hover:text-brand">
                  <span><b>{c.name}</b><span className="block text-xs text-muted">{c.questions} questions · {c.attempts} attempts</span></span>
                  <span className="text-bad">{pct(c.accuracy)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mb-6">
        <h2 className="section-title">Recurring mistakes</h2>
        {recurring.length === 0 ? (
          <p className="text-sm text-muted">When you tick a mistake during revision, repeated ones are tracked here.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {recurring.map((m) => (
              <li key={m.category + m.title} className="flex items-center justify-between gap-3">
                <Link href={`/questions/${m.question_id}`} className="hover:text-brand"><span className="badge mr-2 capitalize">{m.category}</span>{m.title}</Link>
                <span className="tabular-nums text-bad">{m.times}×</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {LEVELS.map((l) => (
            <Link key={l.key} href={`/analytics?level=${l.key}`} className={`btn !min-h-8 ${level === l.key ? "btn-primary" : ""}`}>
              {l.label}
            </Link>
          ))}
        </div>
        <PerfTable rows={rows} empty={`No ${level}-level data yet. Questions need to be classified to that depth and revised at least once.`} />
      </section>
    </>
  );
}
