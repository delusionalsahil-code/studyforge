import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { RevisionSession, type SessionQuestion } from "@/components/RevisionSession";
import { isUuid } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { endOfToday } from "@/lib/queries";
import { previewIntervals } from "@/lib/srs";
import { loadTaxonomy, pathText } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revision session" };

export default async function SessionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tax = await loadTaxonomy();
  const ids = (sp.ids ?? "").split(",").filter(isUuid).slice(0, 50);
  const subjectId = Number(sp.subject) || null;

  const base = and(eq(S.questions.userId, user.id), eq(S.questions.processingStatus, "completed"));
  let where;
  if (ids.length) where = and(base, inArray(S.questions.id, ids));
  else if (sp.mode === "weak")
    where = and(base, sql`${S.revisionState.status} <> 'mastered' and (${S.revisionState.lastRating} in ('again','hard') or ${S.revisionState.ease} < 2.1 or ${S.revisionState.lapses} >= 2)`, subjectId ? eq(S.questions.subjectId, subjectId) : undefined);
  else where = and(base, sql`${S.revisionState.dueAt} < ${endOfToday(user.timezone)}`, subjectId ? eq(S.questions.subjectId, subjectId) : undefined);

  const rows = await db
    .select({ q: S.questions, rs: S.revisionState })
    .from(S.questions)
    .innerJoin(S.revisionState, eq(S.revisionState.questionId, S.questions.id))
    .where(where)
    .orderBy(asc(S.revisionState.dueAt))
    .limit(40);

  const questions: SessionQuestion[] = rows.map(({ q, rs }) => ({
    id: q.id,
    text: q.originalText,
    imageUploadId: q.imageUploadId,
    path: pathText(tax, q),
    difficulty: q.difficulty,
    preview: previewIntervals({ intervalDays: rs.intervalDays, ease: rs.ease, step: rs.step, repetitions: rs.repetitions, lapses: rs.lapses, status: rs.status as "new" }, 0, 0),
  }));

  return (
    <>
      <PageHeader title="Revision session" subtitle={ids.length ? "Revising selected question" : sp.mode === "weak" ? "Practising your weak questions" : "Today’s due questions, oldest first"} />
      {questions.length === 0 ? <Empty title="Nothing to revise right now" hint="You’re up to date. New questions become due the day after you add them." action={{ href: "/revision", label: "Back to revision" }} /> : <RevisionSession questions={questions} />}
    </>
  );
}
