import { useMemo } from "react";
import { Pager, QuestionFilters } from "../components/Filters";
import { Rich, Tex } from "../components/Rich";
import { Badge, Empty, PageHeader, Section } from "../components/ui";
import { PAGE_SIZE, completed, isWeak, recurringMistakes } from "../lib/queries";
import { Link, setParams, useRoute } from "../lib/router";
import { useDB, useTax, type Question } from "../lib/store";
import { pathText } from "../lib/taxonomy";
import { HIERARCHY, LEVEL_PARAM, type HierarchyLevel } from "../lib/taxonomy-types";
import { normalizeName } from "../lib/text";

type IdsLike = { classId: number | null; examId: number | null; subjectId: number | null; unitId: number | null; chapterId: number | null; subchapterId: number | null; topicId: number | null; subtopicId: number | null; conceptId: number | null; conceptIds: number[] };

function matchesHierarchy(ids: IdsLike, p: Record<string, string>): boolean {
  for (const lv of HIERARCHY) {
    const v = Number(p[LEVEL_PARAM[lv]]);
    if (!v) continue;
    if (lv === "concept") {
      if (!ids.conceptIds.includes(v) && ids.conceptId !== v) return false;
    } else if ((ids[`${lv}Id` as keyof IdsLike] as number | null) !== v) return false;
  }
  return true;
}
const LEVELS: HierarchyLevel[] = ["subject", "unit", "chapter", "subchapter", "topic", "subtopic", "concept"];

/* ------------------------------- formulas ------------------------------- */
export function FormulasPage() {
  const db = useDB();
  const tax = useTax();
  const route = useRoute();
  const p = route.params;
  const rows = useMemo(() => {
    const weak = new Set(completed(db).filter((q) => isWeak(db.revision[q.id])).flatMap((q) => q.formulaIds));
    const text = normalizeName(p.q ?? "");
    return db.formulas
      .filter((f) => !p.formula || f.id === p.formula)
      .filter((f) => matchesHierarchy({ classId: null, examId: null, subjectId: f.subjectId, unitId: tax.get("chapter", f.chapterId)?.a.unit ?? null, chapterId: f.chapterId, subchapterId: tax.get("topic", f.topicId)?.a.subchapter ?? null, topicId: f.topicId, subtopicId: f.subtopicId, conceptId: null, conceptIds: f.conceptIds }, p))
      .filter((f) => !text || normalizeName(`${f.name} ${f.expression} ${f.whenToUse}`).includes(text))
      .map((f) => ({ f, weak: weak.has(f.id), count: db.questions.filter((q) => q.formulaIds.includes(f.id)).length }))
      .sort((a, b) => Number(b.weak) - Number(a.weak) || a.f.name.localeCompare(b.f.name));
  }, [db, tax, p]);
  const page = Math.max(1, Number(p.page) || 1);
  return (
    <>
      <PageHeader title="Formula Vault" subtitle={`${rows.length} formula${rows.length === 1 ? "" : "s"} · each stored once and linked to every question that uses it`} />
      <QuestionFilters levels={LEVELS.filter((l) => l !== "unit")} extras={false} placeholder="Search formulas by name or expression…" />
      {p.formula && <div className="mb-3"><button className="btn btn-sm" onClick={() => setParams(route, { formula: null })}>Showing one formula — show all</button></div>}
      {rows.length === 0 ? <Empty title={db.formulas.length ? "No formulas match" : "No formulas yet"} hint="Formulas are extracted automatically from every solution and reused across questions." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ f, weak, count }) => (
            <div key={f.id} className="card !p-4">
              <div className="mb-1 flex items-start justify-between gap-2"><h3 className="font-semibold">{f.name}</h3>{weak && <Badge tone="bad">Revise</Badge>}</div>
              <div className="my-3 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-lg"><Tex tex={f.latex} fallback={f.expression} display /></div>
              <p className="font-mono text-xs text-muted">{f.expression}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted">{f.variables.map((v) => <li key={v.symbol}><span className="font-mono text-fg">{v.symbol}</span> — {v.meaning}{v.unit ? ` (${v.unit})` : ""}</li>)}</ul>
              {f.units && <p className="mt-2 text-xs"><b>Units:</b> {f.units}</p>}
              {f.whenToUse && <p className="mt-1 text-xs"><b>Use when:</b> {f.whenToUse}</p>}
              {f.restrictions && <p className="mt-1 text-xs text-muted"><b>Conditions:</b> {f.restrictions}</p>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
                <span className="truncate text-muted">{pathText(tax, { subjectId: f.subjectId, chapterId: f.chapterId, topicId: f.topicId, subtopicId: f.subtopicId })}</span>
                <Link to="/questions" params={{ formula: f.id }} className="shrink-0 font-semibold text-brand">{count} question{count === 1 ? "" : "s"} →</Link>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager page={page} total={rows.length} pageSize={PAGE_SIZE} />
    </>
  );
}

/* -------------------------------- tricks -------------------------------- */
export function TricksPage() {
  const db = useDB();
  const tax = useTax();
  const p = useRoute().params;
  const all = completed(db).flatMap((q) => q.tricks.map((t) => ({ q, t })));
  const text = normalizeName(p.q ?? "");
  const rows = all.filter(({ q }) => matchesHierarchy(q.ids, p)).filter(({ t }) => !text || normalizeName(`${t.name} ${t.explanation} ${t.whenItWorks}`).includes(text));
  const noTrick = completed(db).filter((q) => !q.hasTrick).length;
  const page = Math.max(1, Number(p.page) || 1);
  return (
    <>
      <PageHeader title="Tricks & shortcuts" subtitle={`${all.length} valid shortcut${all.length === 1 ? "" : "s"} · ${noTrick} question${noTrick === 1 ? "" : "s"} where no meaningful shortcut exists (we never invent one)`} />
      <QuestionFilters levels={LEVELS} extras={false} placeholder="Search tricks…" />
      {rows.length === 0 ? <Empty title="No shortcuts to show" hint="A shortcut is only saved when it is valid, states its limits and reproduces the answer." /> : (
        <div className="space-y-3">
          {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ q, t }) => (
            <div key={t.id} className="card !p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2"><Badge tone="good">Shortcut</Badge><h3 className="font-semibold">{t.name}</h3></div>
              <div className="text-xs text-muted">{pathText(tax, q.ids)}</div>
              <div className="mt-2 text-sm"><Rich text={t.explanation} /></div>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-lg bg-surface-2 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Normal method</div><Rich text={t.normalMethod} /></div>
                <div className="rounded-lg bg-good-soft p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-good">Shortcut</div><Rich text={t.shortcutMethod} /></div>
              </div>
              <p className="mt-2 text-xs text-muted"><b>Works when:</b> {t.whenItWorks} · <b>Limits:</b> {t.limitations}</p>
              <Link to={`/questions/${q.id}`} className="mt-2 inline-block text-xs font-semibold text-brand">Open the question →</Link>
            </div>
          ))}
        </div>
      )}
      <Pager page={page} total={rows.length} pageSize={PAGE_SIZE} />
    </>
  );
}

/* ------------------------------- mistakes ------------------------------- */
export function MistakesPage() {
  const db = useDB();
  const tax = useTax();
  const route = useRoute();
  const p = route.params;
  const rec = recurringMistakes(db);
  const text = normalizeName(p.q ?? "");
  const rows: { q: Question; m: Question["mistakes"][number] }[] = completed(db)
    .flatMap((q) => q.mistakes.map((m) => ({ q, m })))
    .filter(({ q }) => matchesHierarchy(q.ids, p))
    .filter(({ m }) => !p.category || m.category === p.category)
    .filter(({ m }) => !text || normalizeName(`${m.title} ${m.description} ${m.category}`).includes(text));
  const page = Math.max(1, Number(p.page) || 1);
  return (
    <>
      <PageHeader title="Mistakes notebook" subtitle="Likely errors for every question, plus the patterns that keep recurring in the questions you find hard." />
      {rec.length > 0 && (
        <Section title="Recurring patterns" hint="Categories weighted by how many of your weak questions contain them">
          <div className="flex flex-wrap gap-2">
            {rec.map((r) => (
              <button key={r.category} onClick={() => setParams(route, { category: p.category === r.category ? null : r.category })} className={`rounded-full border px-3 py-1 text-sm capitalize ${p.category === r.category ? "border-brand bg-brand-soft text-brand" : "border-line hover:border-brand/50"}`}>
                {r.category} <span className="text-xs text-muted">· {r.count}{r.weakCount ? ` · ${r.weakCount} in weak Qs` : ""}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
      <div className="mt-5" />
      <QuestionFilters levels={LEVELS} extras={false} placeholder="Search mistakes…" />
      {rows.length === 0 ? <Empty title="No mistakes to show" hint="Common mistakes are generated for every analysed question." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ q, m }) => (
            <div key={m.id} className="card !p-4">
              <Badge tone="bad" className="mb-1 capitalize">{m.category}</Badge>
              <h3 className="text-sm font-semibold">{m.title}</h3>
              <p className="mt-1 text-sm text-muted"><Rich text={m.description} /></p>
              <p className="mt-2 rounded-md bg-good-soft px-2.5 py-1.5 text-xs text-good"><b>Prevent it:</b> <Rich text={m.preventionTip} /></p>
              <Link to={`/questions/${q.id}`} className="mt-2 block truncate text-xs text-muted hover:text-brand">{pathText(tax, q.ids)} →</Link>
            </div>
          ))}
        </div>
      )}
      <Pager page={page} total={rows.length} pageSize={PAGE_SIZE} />
    </>
  );
}
