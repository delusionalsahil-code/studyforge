import { discardImport, deleteQuestion, resolveDuplicate, retryImport, retryQuestion } from "../lib/actions";
import { Link } from "../lib/router";
import { useDB } from "../lib/store";
import { truncate } from "../lib/text";
import { Rich } from "./Rich";
import { Stepper } from "./Stepper";
import { Badge, ErrorBox, Spinner } from "./ui";

function DuplicateCard({ id }: { id: string }) {
  const db = useDB();
  const q = db.questions.find((x) => x.id === id)!;
  const existing = db.questions.find((x) => x.id === q.duplicateOfId);
  return (
    <div className="card !border-warn/40 !bg-warn-soft/40 !p-4">
      <div className="mb-1 flex items-center gap-2">
        <Badge tone="warn">Possible duplicate</Badge>
        <span className="text-xs text-muted">{Math.round((q.duplicateScore ?? 0) * 100)}% match</span>
      </div>
      <p className="text-sm font-semibold">This question already exists.</p>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-3 text-sm">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">New</div>
          <Rich text={truncate(q.originalText, 260)} />
        </div>
        <div className="rounded-lg border border-line bg-surface p-3 text-sm">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Already saved</div>
          {existing ? <Rich text={truncate(existing.originalText, 260)} /> : <span className="text-muted">The original was deleted.</span>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {existing && (
          <Link to={`/questions/${existing.id}`} className="btn btn-sm">
            Open existing
          </Link>
        )}
        <button className="btn btn-sm" onClick={() => resolveDuplicate(id, "save")}>Save anyway</button>
        {existing && <button className="btn btn-sm" onClick={() => resolveDuplicate(id, "merge")}>Merge metadata</button>}
        <button className="btn btn-sm" onClick={() => resolveDuplicate(id, "discard")}>Discard new</button>
      </div>
    </div>
  );
}

/** Live view of everything that is importing / analysing / failed / waiting on a duplicate decision. */
export function Processing({ showRecent = true }: { showRecent?: boolean }) {
  const db = useDB();
  const imports = db.imports.filter((i) => i.status !== "completed");
  const qs = db.questions.filter((q) => q.processingStatus !== "completed");
  const recent = db.questions.filter((q) => q.processingStatus === "completed" && !q.isSample).slice(0, 5);
  if (!imports.length && !qs.length && !(showRecent && recent.length)) return null;
  return (
    <div className="mt-8 space-y-3">
      {(imports.length > 0 || qs.length > 0) && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">In progress</h2>}
      {imports.map((i) => (
        <div key={i.id} className="card !p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              {i.status === "processing" && <Spinner />}
              {i.sourceType === "text" ? "Pasted text" : i.sourceType === "image" ? "Image upload" : "PDF upload"}
              {i.sourceName && <span className="text-muted">· {i.sourceName}</span>}
            </div>
            <Badge tone={i.status === "failed" ? "bad" : "brand"}>{i.status}</Badge>
          </div>
          <div className="mt-3">
            <Stepper stage={i.stage} status={i.status} failed={i.status === "failed"} />
          </div>
          {i.status === "failed" && (
            <div className="mt-3 space-y-2">
              <ErrorBox title={i.errorCode === "NOT_CONFIGURED" ? "AI isn't configured" : "Import failed"}>
                {i.error} {i.errorCode === "NOT_CONFIGURED" && <Link to="/settings" className="underline">Open Settings</Link>}
              </ErrorBox>
              <div className="flex gap-2">
                <button className="btn btn-sm btn-primary" onClick={() => retryImport(i.id)}>Retry</button>
                <button className="btn btn-sm" onClick={() => discardImport(i.id)}>Discard</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {qs.map((q) =>
        q.processingStatus === "duplicate_pending" ? (
          <DuplicateCard key={q.id} id={q.id} />
        ) : (
          <div key={q.id} className="card !p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm">
                <Rich text={truncate(q.originalText, 200)} />
              </div>
              <Badge tone={q.processingStatus === "failed" ? "bad" : "brand"}>{q.processingStatus}</Badge>
            </div>
            <div className="mt-3">
              <Stepper stage={q.processingStage} status={q.processingStatus} failed={q.processingStatus === "failed"} />
            </div>
            {q.processingStatus === "failed" && (
              <div className="mt-3 space-y-2">
                <ErrorBox title={q.processingErrorCode === "NOT_CONFIGURED" ? "AI isn't configured" : "Analysis stopped"}>
                  {q.processingError} <span className="opacity-80">Completed stages are kept; retry resumes where it stopped.</span>{" "}
                  {q.processingErrorCode === "NOT_CONFIGURED" && <Link to="/settings" className="underline">Open Settings</Link>}
                </ErrorBox>
                <div className="flex gap-2">
                  <button className="btn btn-sm btn-primary" onClick={() => retryQuestion(q.id)}>Retry</button>
                  <button className="btn btn-sm" onClick={() => confirm("Delete this question?") && deleteQuestion(q.id)}>Delete</button>
                </div>
              </div>
            )}
          </div>
        ),
      )}
      {showRecent && recent.length > 0 && (
        <>
          <h2 className="pt-4 text-sm font-semibold uppercase tracking-wide text-muted">Recently analysed</h2>
          {recent.map((q) => (
            <Link key={q.id} to={`/questions/${q.id}`} className="card block !p-3 text-sm hover:border-brand/50">
              <Rich text={truncate(q.originalText, 160)} />
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
