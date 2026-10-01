import Link from "next/link";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { formulas as F } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { Pager, paramsOf } from "@/components/Pager";
import { QuestionFilters } from "@/components/QuestionFilters";
import { Rich, Tex } from "@/components/Rich";
import { requireUser } from "@/lib/auth";
import { loadTaxonomy, pathText, toClient } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Formula Vault" };
const PAGE = 24;

export default async function FormulasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const values = paramsOf(sp);
  const n = (k: string) => (Number(values[k]) > 0 ? Number(values[k]) : undefined);
  const tax = await loadTaxonomy();

  const where: (SQL | undefined)[] = [eq(F.userId, user.id)];
  if (n("subjectId")) where.push(eq(F.subjectId, n("subjectId")!));
  if (n("chapterId")) where.push(eq(F.chapterId, n("chapterId")!));
  if (n("topicId")) where.push(eq(F.topicId, n("topicId")!));
  if (n("subtopicId")) where.push(eq(F.subtopicId, n("subtopicId")!));
  if (n("conceptId")) where.push(sql`exists (select 1 from formula_concepts fc where fc.formula_id = ${F.id} and fc.concept_id = ${n("conceptId")})`);
  if (values.q) {
    const like = `%${values.q.replace(/[%_]/g, "")}%`;
    where.push(sql`(${F.name} ilike ${like} or ${F.expression} ilike ${like} or ${F.whenToUse} ilike ${like})`);
  }
  const cond = and(...where);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(F).where(cond);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(Math.max(1, Number(values.page) || 1), pages);
  const rows = await db
    .select({ f: F, uses: sql<number>`(select count(*)::int from question_formulas qf where qf.formula_id = ${F.id})` })
    .from(F)
    .where(cond)
    .orderBy(asc(F.name))
    .limit(PAGE)
    .offset((page - 1) * PAGE);

  return (
    <>
      <PageHeader title="Formula Vault" subtitle={`${total} formula${total === 1 ? "" : "s"} — each saved once and linked to every question that uses it.`} />
      <QuestionFilters tax={toClient(tax)} formulas={[]} values={values} chips={[]} basePath="/formulas" extras={[]} levels={["subject", "chapter", "topic", "subtopic", "concept"]} placeholder="Search formulas by name or expression…" />
      {rows.length === 0 ? (
        <Empty title="No formulas found" hint="Formulas are extracted automatically from solutions when you add questions." action={{ href: "/add", label: "Add a question" }} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ f, uses }) => (
            <article key={f.id} className="card flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{f.name}</h2>
                <Link href={`/questions?formulaId=${f.id}`} className="shrink-0 text-xs text-brand">
                  {uses} question{uses === 1 ? "" : "s"} →
                </Link>
              </div>
              <div className="my-3 rounded-lg bg-surface2 px-3 py-3 text-center">
                <Tex latex={f.latex} fallback={f.expression} />
              </div>
              {f.variables.length > 0 && (
                <ul className="space-y-0.5 text-sm">
                  {f.variables.map((v) => (
                    <li key={v.symbol}>
                      <b><Rich text={`$${v.symbol.replace(/\$/g, "")}$`} /></b> — {v.meaning}
                      {v.unit ? <span className="text-muted"> ({v.unit})</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              {f.units && <p className="mt-2 text-sm"><span className="text-muted">Units:</span> {f.units}</p>}
              {f.whenToUse && <p className="mt-1 text-sm"><span className="text-muted">Use when:</span> {f.whenToUse}</p>}
              {f.restrictions && <p className="mt-1 text-sm"><span className="text-muted">Valid when:</span> {f.restrictions}</p>}
              <p className="mt-auto pt-3 text-xs text-muted">{pathText(tax, f) || "Unclassified"}</p>
            </article>
          ))}
        </div>
      )}
      <Pager basePath="/formulas" params={values} page={page} pages={pages} />
    </>
  );
}
