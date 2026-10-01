import { useMemo, useState } from "react";
import { PerfTable } from "../components/PerfTable";
import { QuestionCard } from "../components/QuestionCard";
import { Empty, PageHeader, Section, Stat, Tabs } from "../components/ui";
import { completed, dueQuestions, endOfToday, isMastered, isOverdue, performanceBy, streak, weakQuestions } from "../lib/queries";
import { Link } from "../lib/router";
import { useDB, useTax } from "../lib/store";

export default function RevisionPage() {
  const db = useDB();
  const tax = useTax();
  const due = dueQuestions(db);
  const overdue = due.filter((q) => isOverdue(db.revision[q.id]));
  const weak = weakQuestions(db);
  const mastered = completed(db).filter((q) => isMastered(db.revision[q.id]));
  const [tab, setTab] = useState<"upcoming" | "overdue" | "weak" | "recent" | "mastered">("upcoming");

  const upcoming = useMemo(() => {
    const end = +endOfToday();
    return completed(db)
      .filter((q) => +new Date(db.revision[q.id]?.dueAt ?? 0) > end && !isMastered(db.revision[q.id]))
      .sort((a, b) => +new Date(db.revision[a.id].dueAt) - +new Date(db.revision[b.id].dueAt));
  }, [db, db.reviews.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const subjects = tax.byLevel.subject.filter((s) => s.active);
  const bySubject = subjects.map((s) => ({ s, n: due.filter((q) => q.ids.subjectId === s.id).length })).filter((x) => x.n > 0);
  const unclassified = due.filter((q) => !q.ids.subjectId).length;
  const recent = completed(db).slice(0, 8);

  const subjectPerf = performanceBy(db, (q) => (q.ids.subjectId ? [{ key: String(q.ids.subjectId), label: tax.get("subject", q.ids.subjectId)?.name ?? "?" }] : []));
  const chapterPerf = performanceBy(db, (q) => (q.ids.chapterId ? [{ key: String(q.ids.chapterId), label: `${tax.get("subject", q.ids.subjectId)?.name ?? ""} › ${tax.get("chapter", q.ids.chapterId)?.name ?? "?"}` }] : []));

  const listFor = tab === "upcoming" ? upcoming : tab === "overdue" ? overdue : tab === "weak" ? weak : tab === "mastered" ? mastered : recent;
  const grouped = tab === "upcoming" ? upcoming.reduce<Record<string, typeof upcoming>>((acc, q) => { const k = new Date(db.revision[q.id].dueAt).toDateString(); (acc[k] ??= []).push(q); return acc; }, {}) : null;

  return (
    <>
      <PageHeader title="Revision" subtitle="Adaptive spaced repetition: Day 1 → 3 → 7 → 14 → 30, then it adapts to how you rate each attempt." />
      {completed(db).length === 0 ? (
        <Empty title="Nothing to revise yet" hint="Every analysed question gets a revision schedule automatically." action={{ to: "/add", label: "Add a question" }} />
      ) : (
        <div className="space-y-5">
          <div className="card">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Today</div>
                <div className="mt-2 space-y-0.5 text-sm">
                  {bySubject.map(({ s, n }) => <div key={s.id}><span className="font-medium">{s.name}</span> — {n}</div>)}
                  {unclassified > 0 && <div><span className="font-medium">Unclassified</span> — {unclassified}</div>}
                  {due.length === 0 && <div className="text-muted">You're all caught up 🎉</div>}
                </div>
                <div className="mt-3 text-lg font-semibold">TOTAL DUE: {due.length}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/revision/session" className={`btn btn-primary ${due.length ? "" : "pointer-events-none opacity-50"}`}>Start revision</Link>
                {weak.length > 0 && <Link to="/revision/session" params={{ mode: "weak" }} className="btn">Practise weak ({weak.length})</Link>}
              </div>
            </div>
            {bySubject.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3 text-xs">
                <span className="self-center text-muted">Revise one subject:</span>
                {bySubject.map(({ s }) => <Link key={s.id} to="/revision/session" params={{ subject: s.id }} className="btn btn-sm">{s.name}</Link>)}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "bad" : "neutral"} />
            <Stat label="Weak" value={weak.length} tone={weak.length ? "warn" : "neutral"} />
            <Stat label="Mastered" value={mastered.length} tone="good" />
            <Stat label="Revision streak" value={`${streak(db.reviews)} d`} hint={streak(db.reviews) ? "Keep it going" : "Revise today to start one"} />
          </div>

          <div>
            <Tabs value={tab} onChange={setTab} items={[{ key: "upcoming", label: "Upcoming", count: upcoming.length }, { key: "overdue", label: "Overdue", count: overdue.length }, { key: "weak", label: "Weak", count: weak.length }, { key: "recent", label: "Recently added" }, { key: "mastered", label: "Mastered", count: mastered.length }]} />
            <div className="mt-3 space-y-2">
              {listFor.length === 0 && <p className="card text-sm text-muted">Nothing here.</p>}
              {grouped ? Object.entries(grouped).map(([day, qs]) => (
                <div key={day}>
                  <div className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{new Date(day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })} · {qs.length}</div>
                  <div className="grid gap-2 md:grid-cols-2">{qs.slice(0, 20).map((q) => <QuestionCard key={q.id} q={q} />)}</div>
                </div>
              )) : <div className="grid gap-2 md:grid-cols-2">{listFor.slice(0, 30).map((q) => <QuestionCard key={q.id} q={q} />)}</div>}
            </div>
          </div>

          <Section title="Subject-wise performance"><PerfTable rows={subjectPerf} /></Section>
          <Section title="Chapter-wise performance"><PerfTable rows={chapterPerf} limit={12} /></Section>
        </div>
      )}
    </>
  );
}
