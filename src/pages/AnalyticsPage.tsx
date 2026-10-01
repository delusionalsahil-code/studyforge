import { PerfTable } from "../components/PerfTable";
import { Empty, PageHeader, Section, Stat } from "../components/ui";
import { completed, dayKey, performanceBy, ratingCounts, recurringMistakes, streak } from "../lib/queries";
import { Link } from "../lib/router";
import { weightedAccuracy } from "../lib/srs";
import { useDB, useTax } from "../lib/store";

export default function AnalyticsPage() {
  const db = useDB();
  const tax = useTax();
  const done = completed(db);
  if (!done.length) return (<><PageHeader title="Analytics" /><Empty title="No data yet" hint="Analytics appear once you've added and revised questions." action={{ to: "/add", label: "Add a question" }} /></>);

  const rc = ratingCounts(db.reviews);
  const acc = weightedAccuracy(rc);
  const avgTime = db.reviews.length ? Math.round(db.reviews.reduce((a, r) => a + r.timeSpentSec, 0) / db.reviews.length / 60 * 10) / 10 : 0;
  const success = db.reviews.length ? (rc.good + rc.easy + rc.mastered) / db.reviews.length : null;

  const subject = performanceBy(db, (q) => (q.ids.subjectId ? [{ key: String(q.ids.subjectId), label: tax.get("subject", q.ids.subjectId)!.name }] : []));
  const chapter = performanceBy(db, (q) => (q.ids.chapterId ? [{ key: String(q.ids.chapterId), label: `${tax.get("subject", q.ids.subjectId)?.name} › ${tax.get("chapter", q.ids.chapterId)!.name}` }] : [])).map((r) => ({ ...r, params: { chapterId: r.key } }));
  const concept = performanceBy(db, (q) => q.ids.conceptIds.map((c) => ({ key: String(c), label: `${tax.get("chapter", q.ids.chapterId)?.name ?? ""} › ${tax.get("concept", c)?.name}` }))).map((r) => ({ ...r, params: { conceptId: r.key } }));
  const formula = performanceBy(db, (q) => q.formulaIds.map((f) => ({ key: f, label: db.formulas.find((x) => x.id === f)?.name ?? "?" }))).map((r) => ({ ...r, params: { formula: r.key } }));
  const mistakes = recurringMistakes(db);
  const diff = ["Easy", "Medium", "Hard", "Very Hard"].map((d) => ({ d, n: done.filter((q) => q.difficulty === d).length }));
  const maxDiff = Math.max(1, ...diff.map((x) => x.n));

  // last 14 days activity
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d; });
  const perDay = days.map((d) => ({ d, n: db.reviews.filter((r) => dayKey(new Date(r.at)) === dayKey(d)).length }));
  const maxDay = Math.max(1, ...perDay.map((x) => x.n));
  const needsReview = done.filter((q) => q.needsReview).length;

  return (
    <>
      <PageHeader title="Analytics" subtitle="Accuracy, solve time and weakness — from every revision you've recorded." />
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Attempts" value={db.reviews.length} />
          <Stat label="Accuracy" value={acc === null ? "—" : `${Math.round(acc * 100)}%`} hint="again 0 · hard ½ · good+ 1" tone={acc === null ? "neutral" : acc >= 0.75 ? "good" : acc >= 0.55 ? "warn" : "bad"} />
          <Stat label="Revision success" value={success === null ? "—" : `${Math.round(success * 100)}%`} hint="good, easy or mastered" />
          <Stat label="Avg. solve time" value={`${avgTime} min`} />
          <Stat label="Streak" value={`${streak(db.reviews)} d`} />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Activity · last 14 days">
            <div className="flex h-28 items-end gap-1.5">
              {perDay.map(({ d, n }) => (
                <div key={d.toISOString()} className="flex flex-1 flex-col items-center gap-1" title={`${d.toLocaleDateString()}: ${n} reviews`}>
                  <div className="w-full rounded-t bg-brand/80" style={{ height: `${n ? Math.max(6, (n / maxDay) * 100) : 2}%`, opacity: n ? 1 : 0.25 }} />
                  <span className="text-[9px] text-muted">{d.getDate()}</span>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Library by difficulty">
            <div className="space-y-2">
              {diff.map(({ d, n }) => (
                <div key={d} className="flex items-center gap-3 text-sm"><span className="w-20 text-muted">{d}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: `${(n / maxDiff) * 100}%` }} /></div><span className="w-6 text-right tabular-nums">{n}</span></div>
              ))}
              {needsReview > 0 && <p className="pt-1 text-xs text-warn">{needsReview} question{needsReview > 1 ? "s" : ""} flagged for review — <Link to="/questions" params={{ review: "1" }} className="underline">see them</Link></p>}
            </div>
          </Section>
        </div>

        <Section title="Subject performance"><PerfTable rows={subject} /></Section>
        <Section title="Chapter weakness" hint="Weakest first. “Weak” = at least 2 attempts and under 60% weighted accuracy."><PerfTable rows={chapter} linkTo="/questions" limit={15} /></Section>
        <Section title="Concept weakness"><PerfTable rows={concept} linkTo="/questions" limit={15} empty="Concepts appear when classified questions are revised." /></Section>
        <Section title="Formula weakness"><PerfTable rows={formula} linkTo="/questions" limit={10} empty="No formula data yet." /></Section>
        <Section title="Recurring mistake patterns">
          {mistakes.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
            <ul className="space-y-2 text-sm">
              {mistakes.slice(0, 8).map((m) => (
                <li key={m.category} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
                  <div><span className="font-medium capitalize">{m.category}</span><div className="text-xs text-muted">{m.examples.map((e) => e.title).join(" · ")}</div></div>
                  <div className="text-xs text-muted">{m.count} occurrence{m.count > 1 ? "s" : ""}{m.weakCount ? ` · ${m.weakCount} in weak questions` : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
