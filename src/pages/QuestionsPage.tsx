import { useEffect, useMemo, useState } from "react";
import { Pager, QuestionFilters } from "../components/Filters";
import { QuestionCard } from "../components/QuestionCard";
import { Empty, PageHeader } from "../components/ui";
import { aiConfigured } from "../lib/ai/client";
import { PAGE_SIZE, filterQuestions, semanticIds } from "../lib/queries";
import { Link, useRoute } from "../lib/router";
import { useDB, useTax } from "../lib/store";

export default function QuestionsPage() {
  const route = useRoute();
  const db = useDB();
  const tax = useTax();
  const q = route.params.q ?? "";
  const [sem, setSem] = useState<string[] | null>(null);

  // semantic search (embeddings) is best-effort: lexical + taxonomy understanding always works
  useEffect(() => {
    let live = true;
    setSem(null);
    if (q.trim().length >= 3 && aiConfigured() && Object.keys(db.embeddings).length) {
      void semanticIds(db.embeddings, q).then((ids) => live && setSem(ids));
    }
    return () => {
      live = false;
    };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = useMemo(() => filterQuestions(db, tax, route.params, sem), [db, tax, route.params, sem, db.questions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const page = Math.max(1, Number(route.params.page) || 1);
  const rows = res.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = Object.keys(route.params).some((k) => k !== "page");

  return (
    <>
      <PageHeader title="Question library" subtitle={`${res.total} question${res.total === 1 ? "" : "s"}${filtered ? " match your filters" : " saved"}${res.semantic ? " · semantic ranking on" : ""}`} actions={<Link to="/add" className="btn btn-primary">+ Add question</Link>} />
      <QuestionFilters chips={res.chips} />
      {rows.length === 0 ? (
        db.questions.length === 0 ? (
          <Empty title="Your library is empty" hint="Add your first question — it's classified into the full hierarchy, solved, and scheduled for revision automatically." action={{ to: "/add", label: "Add a question" }} />
        ) : (
          <Empty title="No questions match" hint="Try removing a filter or searching with different words." />
        )
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((x) => (
            <QuestionCard key={x.id} q={x} />
          ))}
        </div>
      )}
      <Pager page={page} total={res.total} pageSize={PAGE_SIZE} />
    </>
  );
}
