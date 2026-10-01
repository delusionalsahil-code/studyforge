import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { questions as Q, tricks as T } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { Pager, paramsOf } from "@/components/Pager";
import { QuestionFilters } from "@/components/QuestionFilters";
import { Rich } from "@/components/Rich";
import { requireUser } from "@/lib/auth";
import { loadTaxonomy, pathText, toClient } from "@/lib/taxonomy";
import { truncate } from "@/lib/text";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tricks" };
const PAGE = 15;

export default async function TricksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const values = paramsOf(await searchParams);
  const n = (k: string) => (Number(values[k]) > 0 ? Number(values[k]) : undefined);
  const tax = await loadTaxonomy();
  const where: (SQL | undefined)[] = [eq(T.userId, user.id)];
  for (const [k, col] of [["subjectId", Q.subjectId], ["unitId", Q.unitId], ["chapterId", Q.chapterId], ["subchapterId", Q.subchapterId], ["topicId", Q.topicId], ["subtopicId", Q.subtopicId]] as const) {
    if (n(k)) where.push(eq(col, n(k)!));
  }
  if (values.q) {
    const like = `%${values.q.replace(/[%_]/g, "")}%`;
    where.push(sql`(${T.name} ilike ${like} or ${T.explanation} ilike ${like} or ${Q.originalText} ilike ${like})`);
  }
  const cond = and(...where);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(T).innerJoin(Q, eq(Q.id, T.questionId)).where(cond);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(Math.max(1, Number(values.page) || 1), pages);
  const rows = await db.select({ t: T, q: Q }).from(T).innerJoin(Q, eq(Q.id, T.questionId)).where(cond).orderBy(desc(T.createdAt)).limit(PAGE).offset((page - 1) * PAGE);

  return (
    <>
      <PageHeader title="Tricks notebook" subtitle="Only verified shortcuts are saved — each one was checked against its own question’s answer, with its limits noted." />
      <QuestionFilters tax={toClient(tax)} formulas={[]} values={values} chips={[]} basePath="/tricks" extras={[]} levels={["subject", "unit", "chapter", "subchapter", "topic", "subtopic"]} placeholder="Search tricks…" />
      {rows.length === 0 ? (
        <Empty title="No tricks yet" hint="The AI only records a trick when a genuinely valid shortcut exists. Many questions have none — that’s by design." />
      ) : (
        <ul className="space-y-4">
          {rows.map(({ t, q }) => (
            <li key={t.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-semibold text-ok">⚡ {t.name}</h2>
                <Link href={`/questions/${q.id}`} className="text-xs text-brand">Open question →</Link>
              </div>
              <p className="mt-0.5 text-xs text-muted">{pathText(tax, q)}</p>
              <p className="mt-2 line-clamp-2 rounded-lg bg-surface2 p-2.5 text-sm text-muted"><Rich text={truncate(q.originalText, 220)} /></p>
              <p className="mt-3 text-sm"><Rich text={t.explanation} /></p>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-brand">Method, validity &amp; limitations</summary>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <div><p className="label">Normal method</p><Rich text={t.normalMethod} /></div>
                  <div><p className="label">Shortcut</p><Rich text={t.shortcutMethod} /></div>
                  <div><p className="label">When it works</p><Rich text={t.whenItWorks} /></div>
                  <div><p className="label">Why it works</p><Rich text={t.whyItWorks} /></div>
                  <div><p className="label">Limitations</p><Rich text={t.limitations} /></div>
                  <div><p className="label">Verified on this question</p><Rich text={t.validityCheck} /></div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/tricks" params={values} page={page} pages={pages} />
    </>
  );
}
