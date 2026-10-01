import Link from "next/link";
import { Bar, DiffBadge, Empty, PageHeader, Stat } from "@/components/ui";
import { Rich, Tex } from "@/components/Rich";
import { aiConfigured } from "@/lib/ai/client";
import { requireUser } from "@/lib/auth";
import {
  activeProcessingCount,
  getFormulasForRevision,
  getPerformance,
  getRecentMistakes,
  getRecentQuestions,
  getRevisionOverview,
  getSubjectProgress,
} from "@/lib/queries";
import { loadTaxonomy, pathText } from "@/lib/taxonomy";
import { truncate } from "@/lib/text";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [tax, ov, recent, concepts, formulas, mistakes, progress, processing] = await Promise.all([
    loadTaxonomy(),
    getRevisionOverview(user.id, user.timezone),
    getRecentQuestions(user.id, 5),
    getPerformance(user.id, "concept", 100),
    getFormulasForRevision(user.id, user.timezone, 4),
    getRecentMistakes(user.id, 4),
    getSubjectProgress(user.id),
    activeProcessingCount(user.id),
  ]);
  const weakConcepts = concepts.filter((c) => c.verdict === "weak").sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1)).slice(0, 5);
  const hour = new Date().getHours();
  const total = progress.reduce((a, p) => a + p.total, 0);
  const goalPct = Math.min(1, ov.revisedToday / Math.max(1, user.dailyGoal));

  return (
    <>
      <PageHeader title={`${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${user.name ? `, ${user.name.split(" ")[0]}` : ""}`} subtitle="Here’s where your preparation stands today." />

      {!aiConfigured() && (
        <div role="alert" className="mb-5 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          <b className="text-warn">AI isn’t configured.</b> <span className="text-muted">Set <code>AI_API_KEY</code> on the server to enable classification, solutions, formulas and tricks. See <Link href="/settings" className="text-brand underline">Settings</Link>.</span>
        </div>
      )}
      {processing > 0 && (
        <Link href="/imports" className="mb-5 flex items-center justify-between rounded-xl border border-brand/30 bg-brand-soft p-4 text-sm">
          <span><b className="text-brand">{processing}</b> question{processing === 1 ? " is" : "s are"} being analysed…</span>
          <span className="text-brand">View progress →</span>
        </Link>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <p className="section-title">Today’s revision</p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-4xl font-semibold tabular-nums">{ov.totalDue}</p>
              <p className="text-sm text-muted">question{ov.totalDue === 1 ? "" : "s"} due{ov.overdue > 0 ? ` · ${ov.overdue} overdue` : ""}</p>
              <ul className="mt-3 space-y-0.5 text-sm">
                {ov.due.map((d) => (
                  <li key={d.subjectId ?? "n"}>
                    <span className="inline-block w-28 font-medium">{d.subject}</span> {d.n}
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/revision/session" className={`btn btn-primary !min-h-12 px-8 text-base ${ov.totalDue === 0 ? "pointer-events-none opacity-50" : ""}`}>
              Start revision
            </Link>
          </div>
        </section>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Stat label="Revision streak" value={`🔥 ${ov.streak} day${ov.streak === 1 ? "" : "s"}`} />
          <div className="card !p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Daily goal</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{ov.revisedToday}<span className="text-base text-muted"> / {user.dailyGoal}</span></p>
            <div className="mt-2"><Bar value={goalPct} tone={goalPct >= 1 ? "ok" : "brand"} /></div>
          </div>
        </section>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title">Recently added</h2>
          {recent.length === 0 ? (
            <Empty title="No questions yet" hint="Upload a screenshot or paste a question to get started." action={{ href: "/add", label: "Add a question" }} />
          ) : (
            <ul className="space-y-2">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/questions/${r.id}`} className="block rounded-lg border border-line p-2.5 text-sm hover:bg-surface2">
                    <span className="line-clamp-2"><Rich text={truncate(r.text, 160)} /></span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <DiffBadge value={r.difficulty} />
                      <span>{r.status === "completed" ? pathText(tax, r) || "Unclassified" : r.status === "failed" ? "Analysis failed — open to retry" : "Analysing…"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">Weak concepts</h2>
          {weakConcepts.length === 0 ? (
            <p className="text-sm text-muted">No weak concepts yet. Concepts show up here after a few revisions with low accuracy.</p>
          ) : (
            <ul className="space-y-3">
              {weakConcepts.map((c) => (
                <li key={c.id}>
                  <Link href={c.href} className="block text-sm hover:text-brand">
                    <span className="flex justify-between"><b>{c.name}</b><span className="text-bad">{Math.round((c.accuracy ?? 0) * 100)}%</span></span>
                    <span className="text-xs text-muted">{c.path} · {c.questions} questions · {c.correct}/{c.attempts} correct</span>
                    <Bar value={c.accuracy ?? 0} tone="bad" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">Formula revision</h2>
          {formulas.length === 0 ? (
            <p className="text-sm text-muted">Formulas from questions due today or marked weak will appear here.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {formulas.map((f) => (
                <Link key={f.id} href={`/questions?formulaId=${f.id}`} className="rounded-lg border border-line p-2.5 text-center text-sm hover:bg-surface2">
                  <p className="text-xs text-muted">{f.name}</p>
                  <Tex latex={f.latex} fallback={f.expression} />
                </Link>
              ))}
            </div>
          )}
          <Link href="/formulas" className="mt-3 inline-block text-sm text-brand">Open Formula Vault →</Link>
        </section>

        <section className="card">
          <h2 className="section-title">Recent mistakes to avoid</h2>
          {mistakes.length === 0 ? (
            <p className="text-sm text-muted">Likely mistakes for your questions are collected here.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {mistakes.map((m) => (
                <li key={m.id}>
                  <Link href={`/questions/${m.questionId}#solution`} className="block hover:text-brand">
                    <span className="badge mr-2 capitalize">{m.category}</span>
                    <b><Rich text={m.title} /></b>
                    <span className="block text-xs text-ok"><Rich text={m.tip} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/mistakes" className="mt-3 inline-block text-sm text-brand">All mistakes →</Link>
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Progress by subject</h2>
        {progress.length === 0 ? (
          <p className="text-sm text-muted">Your subject progress will appear once questions are analysed.</p>
        ) : (
          <ul className="space-y-4">
            {progress.map((p) => (
              <li key={p.subject}>
                <div className="mb-1 flex justify-between text-sm">
                  <b>{p.subject}</b>
                  <span className="text-muted">{p.mastered} mastered · {p.revised} revised · {p.total} questions</span>
                </div>
                <Bar value={p.revised} max={p.total} />
              </li>
            ))}
            <li className="text-xs text-muted">{total} questions in total</li>
          </ul>
        )}
      </section>
    </>
  );
}
