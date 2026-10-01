import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { commonMistakes as M, questions as Q } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { Pager, paramsOf } from "@/components/Pager";
import { QuestionFilters } from "@/components/QuestionFilters";
import { Rich } from "@/components/Rich";
import { requireUser } from "@/lib/auth";
import { getRecurringMistakes } from "@/lib/queries";
import { loadTaxonomy, pathText, toClient } from "@/lib/taxonomy";
import { truncate } from "@/lib/text";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mistakes" };
const PAGE = 20;

export default async function MistakesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const values = paramsOf(await searchParams);
  const n = (k: string) => (Number(values[k]) > 0 ? Number(values[k]) : undefined);
  const tax = await loadTaxonomy();
  const where: (SQL | undefined)[] = [eq(M.userId, user.id)];
  for (const [k, col] of [["subjectId", Q.subjectId], ["unitId", Q.unitId], ["chapterId", Q.chapterId], ["subchapterId", Q.subchapterId], ["topicId", Q.topicId], ["subtopicId", Q.subtopicId]] as const) {
    if (n(k)) where.push(eq(col, n(k)!));
  }
  if (values.category) where.push(eq(M.category, values.category));
  if (values.q) {
    const like = `%${values.q.replace(/[%_]/g, "")}%`;
    where.push(sql`(${M.title} ilike ${like} or ${M.description} ilike ${like})`);
  }
  const cond = and(...where);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(M).innerJoin(Q, eq(Q.id, M.questionId)).where(cond);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(Math.max(1, Number(values.page) || 1), pages);
  const [rows, cats, recurring] = await Promise.all([
    db
      .select({ m: M, q: Q, times: sql<number>`(select count(*)::int from mistake_occurrences o where o.mistake_id = ${M.id})` })
      .from(M)
      .innerJoin(Q, eq(Q.id, M.questionId))
      .where(cond)
      .orderBy(desc(M.createdAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ category: M.category, n: sql<number>`count(*)::int` }).from(M).where(eq(M.userId, user.id)).groupBy(M.category).orderBy(desc(sql`count(*)`)),
    getRecurringMistakes(user.id, 5),
  ]);
  const catHref = (c: string | null) => {
    const qs = new URLSearchParams(values);
    qs.delete("page");
    if (c) qs.set("category", c);
    else qs.delete("category");
    return `/mistakes?${qs.toString()}`;
  };

  return (
    <>
      <PageHeader title="Mistake notebook" subtitle="Likely pitfalls for each question, plus the ones you actually fell into during revision." />
      {recurring.length > 0 && (
        <section className="card mb-5">
          <h2 className="section-title">Your recurring mistakes</h2>
          <ul className="space-y-1.5 text-sm">
            {recurring.map((r) => (
              <li key={r.category + r.title} className="flex justify-between gap-3">
                <Link href={`/questions/${r.question_id}`} className="hover:text-brand"><span className="badge mr-2 capitalize">{r.category}</span>{r.title}</Link>
                <span className="tabular-nums text-bad">{r.times}×</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <QuestionFilters tax={toClient(tax)} formulas={[]} values={values} chips={[]} basePath="/mistakes" extras={[]} levels={["subject", "unit", "chapter", "subchapter", "topic", "subtopic"]} placeholder="Search mistakes…" />
      {cats.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Link href={catHref(null)} className={`badge ${!values.category ? "border-brand text-brand" : ""}`}>All</Link>
          {cats.map((c) => (
            <Link key={c.category} href={catHref(c.category)} className={`badge capitalize ${values.category === c.category ? "border-brand text-brand" : ""}`}>
              {c.category} · {c.n}
            </Link>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <Empty title="No mistakes recorded" hint="Common mistakes are generated for each analysed question." />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ m, q, times }) => (
            <li key={m.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge capitalize">{m.category}</span>
                <h2 className="font-semibold"><Rich text={m.title} /></h2>
                {times > 0 && <span className="badge border-bad/30 text-bad">You made this {times}×</span>}
              </div>
              <p className="mt-2 text-sm"><Rich text={m.description} /></p>
              <p className="mt-1 text-sm text-ok">Prevent it: <Rich text={m.preventionTip} /></p>
              <Link href={`/questions/${q.id}`} className="mt-3 block rounded-lg bg-surface2 p-2.5 text-xs text-muted hover:text-fg">
                {pathText(tax, q)} — <Rich text={truncate(q.originalText, 120)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/mistakes" params={values} page={page} pages={pages} />
    </>
  );
}
