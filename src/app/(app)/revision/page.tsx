import Link from "next/link";
import { Bar, Empty, PageHeader, Stat, DiffBadge } from "@/components/ui";
import { PerfTable } from "@/components/PerfTable";
import { Rich } from "@/components/Rich";
import { requireUser } from "@/lib/auth";
import { getPerformance, getRecentQuestions, getRevisionOverview, listQuestions } from "@/lib/queries";
import { loadTaxonomy, pathText } from "@/lib/taxonomy";
import { truncate } from "@/lib/text";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revision" };

export default async function RevisionPage() {
  const user = await requireUser();
  const [tax, ov, weak, recent, subjects, chapters] = await Promise.all([
    loadTaxonomy(),
    getRevisionOverview(user.id, user.timezone),
    listQuestions(user.id, { status: "weak", page: 1 }, user.timezone, 5),
    getRecentQuestions(user.id, 5),
    getPerformance(user.id, "subject"),
    getPerformance(user.id, "chapter", 12),
  ]);
  const maxUp = Math.max(1, ...ov.upcoming.map((u) => u.n));

  return (
    <>
      <PageHeader title="Revision" subtitle="Adaptive spaced repetition — your schedule updates after every review." />

      <section className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-title !mb-1">Today</p>
            {ov.due.length === 0 ? (
              <p className="text-lg font-medium">🎉 You’re all caught up — nothing is due.</p>
            ) : (
              <ul className="space-y-1 text-lg">
                {ov.due.map((d) => (
                  <li key={d.subjectId ?? "none"} className="flex items-center gap-3">
                    <span className="w-36 font-medium">{d.subject}</span>
                    <span className="tabular-nums">— {d.n}</span>
                    {d.overdue > 0 && <span className="badge border-bad/30 text-bad">{d.overdue} overdue</span>}
                    {d.subjectId && <Link href={`/revision/session?subject=${d.subjectId}`} className="text-sm text-brand">Start →</Link>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-muted">Total due: {ov.totalDue}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/revision/session" className={`btn btn-primary !min-h-12 px-8 text-base ${ov.totalDue === 0 ? "pointer-events-none opacity-50" : ""}`} aria-disabled={ov.totalDue === 0}>
              START REVISION
            </Link>
            <Link href="/revision/session?mode=weak" className="btn">
              Practise weak questions
            </Link>
          </div>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Overdue" value={ov.overdue} tone={ov.overdue ? "bad" : undefined} />
        <Stat label="Weak" value={ov.weak} tone={ov.weak ? "warn" : undefined} />
        <Stat label="Mastered" value={ov.mastered} tone="ok" />
        <Stat label="Streak" value={`${ov.streak} day${ov.streak === 1 ? "" : "s"}`} hint="consecutive days with revision" />
        <Stat label="Revised today" value={`${ov.revisedToday}/${user.dailyGoal}`} hint="daily goal" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title">Upcoming (next 7 days)</h2>
          {ov.upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled in the next week.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {ov.upcoming.map((u) => (
                <li key={u.day} className="grid grid-cols-[110px_1fr_30px] items-center gap-3">
                  <span className="text-muted">{new Date(u.day + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
                  <Bar value={u.n} max={maxUp} />
                  <span className="text-right tabular-nums">{u.n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="section-title">Weak questions</h2>
          {weak.rows.length === 0 ? (
            <p className="text-sm text-muted">No weak questions — rate honestly and they will show up here.</p>
          ) : (
            <ul className="space-y-2">
              {weak.rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/questions/${r.id}`} className="block rounded-lg border border-line p-2.5 text-sm hover:bg-surface2">
                    <span className="line-clamp-2"><Rich text={truncate(r.text, 200)} /></span>
                    <span className="mt-1 block text-xs text-muted">{pathText(tax, r)}</span>
                  </Link>
                </li>
              ))}
              {weak.total > 5 && <Link href="/questions?status=weak" className="text-sm text-brand">See all {weak.total} →</Link>}
            </ul>
          )}
        </section>
      </div>

      <section className="card mb-6">
        <h2 className="section-title">Recently added</h2>
        {recent.length === 0 ? (
          <Empty title="No questions yet" action={{ href: "/add", label: "Add a question" }} />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/questions/${r.id}`} className="flex items-start justify-between gap-3 rounded-lg border border-line p-2.5 text-sm hover:bg-surface2">
                  <span className="line-clamp-2 min-w-0"><Rich text={truncate(r.text, 140)} /></span>
                  <DiffBadge value={r.difficulty} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mb-6">
        <h2 className="section-title">Subject-wise performance</h2>
        <PerfTable rows={subjects} />
      </section>
      <section className="card">
        <h2 className="section-title">Chapter-wise performance</h2>
        <PerfTable rows={chapters} dense />
        <Link href="/analytics" className="mt-3 inline-block text-sm text-brand">Full analytics →</Link>
      </section>
    </>
  );
}
