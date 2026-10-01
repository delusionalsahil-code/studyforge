import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { formulas } from "@/db/schema";
import { DiffBadge, Empty, PageHeader, StatusBadge, relativeDue } from "@/components/ui";
import { QuestionFilters } from "@/components/QuestionFilters";
import { Rich } from "@/components/Rich";
import { requireUser } from "@/lib/auth";
import { listQuestions, parseFilters } from "@/lib/queries";
import { loadTaxonomy, pathText, toClient } from "@/lib/taxonomy";
import { truncate } from "@/lib/text";

export const dynamic = "force-dynamic";
export const metadata = { title: "Questions" };

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const [tax, result, fs] = await Promise.all([
    loadTaxonomy(),
    listQuestions(user.id, filters, user.timezone),
    db.select({ id: formulas.id, name: formulas.name }).from(formulas).where(eq(formulas.userId, user.id)).orderBy(formulas.name),
  ]);
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) values[k] = v;
  const hasFilters = Object.keys(values).some((k) => !["page", "focus"].includes(k));

  const pageHref = (p: number) => {
    const qs = new URLSearchParams(values);
    qs.set("page", String(p));
    qs.delete("focus");
    return `/questions?${qs.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Question library"
        subtitle={`${result.total} question${result.total === 1 ? "" : "s"}${hasFilters ? " match your filters" : " saved"}`}
        actions={
          <Link href="/add" className="btn btn-primary">
            ＋ Add question
          </Link>
        }
      />
      <QuestionFilters tax={toClient(tax)} formulas={fs} values={values} chips={result.interp?.chips ?? []} focus={values.focus === "1"} />

      {result.rows.length === 0 ? (
        hasFilters ? (
          <Empty title="No questions match these filters" hint="Try removing a filter or broadening your search." action={{ href: "/questions", label: "Clear filters" }} />
        ) : (
          <Empty title="Your question bank is empty" hint="Add a question by typing, pasting, or uploading a screenshot or PDF. The AI will classify and solve it for you." action={{ href: "/add", label: "Add your first question" }} />
        )
      ) : (
        <ul className="space-y-3">
          {result.rows.map((r) => {
            const type = tax.get("question_type", r.questionTypeId)?.name;
            const path = pathText(tax, r);
            return (
              <li key={r.id}>
                <Link href={`/questions/${r.id}`} className="card block transition-colors hover:border-brand/50 hover:bg-surface2/40">
                  <div className="line-clamp-3 text-[15px] leading-relaxed">
                    <Rich text={truncate(r.text, 360)} />
                  </div>
                  {path ? <p className="mt-2 text-xs text-muted">{path}</p> : <p className="mt-2 text-xs text-muted">{r.processingStatus === "completed" ? "Unclassified — needs review" : "Not classified yet"}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <DiffBadge value={r.difficulty} />
                    {type && <span className="badge">{type}</span>}
                    {r.hasTrick && <span className="badge text-ok">⚡ Shortcut</span>}
                    {r.needsReview && r.processingStatus === "completed" && <span className="badge border-warn/30 bg-warn/10 text-warn">Needs review</span>}
                    {r.isAiGenerated && <span className="badge text-brand">AI-generated</span>}
                    <StatusBadge status={r.processingStatus} />
                    {r.sourceName && <span className="badge">{truncate(r.sourceName, 28)}</span>}
                    {r.revStatus === "mastered" ? <span className="badge text-ok">Mastered</span> : r.dueAt && r.processingStatus === "completed" ? <span className="badge ml-auto">{relativeDue(r.dueAt)}</span> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {result.pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          {result.page > 1 ? (
            <Link href={pageHref(result.page - 1)} className="btn">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {result.page} of {result.pages}
          </span>
          {result.page < result.pages ? (
            <Link href={pageHref(result.page + 1)} className="btn">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
