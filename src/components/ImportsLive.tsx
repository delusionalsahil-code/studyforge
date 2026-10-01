"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DuplicateCard } from "@/components/DuplicateCard";
import { Rich } from "@/components/Rich";
import { Stepper } from "@/components/Stepper";
import { Skeleton } from "@/components/ui";

interface Q {
  id: string;
  text: string;
  status: string;
  stage: string;
  error: string | null;
  errorCode: string | null;
  stale: boolean;
  duplicateOfId: string | null;
  duplicateScore: number | null;
  duplicateText: string | null;
  needsReview: boolean;
}
interface Imp {
  id: string;
  sourceType: string;
  sourceName: string | null;
  status: string;
  stage: string;
  error: string | null;
  errorCode: string | null;
  createdAt: string;
  stale: boolean;
  questions: Q[];
}

export function ImportsLive({ highlight }: { highlight: string[] }) {
  const [imports, setImports] = useState<Imp[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/imports", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load");
      const data = await res.json();
      setImports(data.imports);
      setLoadError(null);
      return data.imports as Imp[];
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const list = await load();
      if (!alive) return;
      const active = !list || list.some((i) => i.status === "processing" || i.status === "queued" || i.questions.some((q) => q.status === "processing" || q.status === "queued"));
      timer.current = setTimeout(tick, active ? 2500 : 15000);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [load]);

  async function retry(url: string, id: string) {
    setBusyId(id);
    setActionError(null);
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (!res.ok) setActionError((await res.json().catch(() => ({}))).error ?? "Retry failed");
    setBusyId(null);
    load();
  }

  if (!imports && !loadError) return <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (loadError && !imports) return <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{loadError}</p>;
  if (!imports?.length)
    return (
      <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
        Nothing imported yet. <Link href="/add" className="text-brand">Add a question</Link>.
      </div>
    );

  return (
    <div className="space-y-4">
      {actionError && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{actionError}</p>}
      {imports.map((imp) => {
        const extracting = (imp.status === "processing" || imp.status === "queued") && imp.questions.length === 0;
        return (
          <section key={imp.id} className={`card space-y-3 ${highlight.includes(imp.id) ? "border-brand/50" : ""}`}>
            <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="badge">{imp.sourceType === "pdf" ? "PDF" : imp.sourceType === "image" ? "Image" : "Text"}</span>
                <span className="font-medium">{imp.sourceName ?? "Untitled import"}</span>
              </div>
              <span className="text-xs text-muted">{new Date(imp.createdAt).toLocaleString()}</span>
            </header>

            {extracting && (
              <div>
                <Stepper stage="extracting" status="processing" />
                {imp.stale && (
                  <button className="btn mt-3" disabled={busyId === imp.id} onClick={() => retry(`/api/imports/${imp.id}/retry`, imp.id)}>
                    Looks stuck — resume
                  </button>
                )}
              </div>
            )}
            {imp.status === "failed" && (
              <div role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm">
                <p className="font-semibold text-bad">Couldn’t read this upload</p>
                <p className="mt-1 text-muted">{imp.error}</p>
                <p className="mt-1 text-xs text-muted">Your original file is stored safely. {imp.errorCode === "UNREADABLE" ? "Try a sharper photo or paste the text instead." : "You can retry without uploading again."}</p>
                <button className="btn mt-3" disabled={busyId === imp.id} onClick={() => retry(`/api/imports/${imp.id}/retry`, imp.id)}>
                  {busyId === imp.id ? "Retrying…" : "Retry extraction"}
                </button>
              </div>
            )}

            <ul className="space-y-3">
              {imp.questions.map((q) => (
                <li key={q.id} className="rounded-lg border border-line bg-surface2/50 p-3">
                  <div className="line-clamp-2 text-sm">
                    <Rich text={q.text} />
                  </div>
                  <div className="mt-2.5">
                    {q.status === "completed" && (
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-ok">✓ Analysed and saved</span>
                        {q.needsReview && <span className="badge border-warn/30 bg-warn/10 text-warn">Needs review</span>}
                        <Link href={`/questions/${q.id}`} className="btn btn-primary !min-h-8">
                          Open
                        </Link>
                      </div>
                    )}
                    {(q.status === "processing" || q.status === "queued") && (
                      <div className="space-y-2">
                        <Stepper stage={q.stage} status={q.status} />
                        {q.stale && (
                          <button className="btn" disabled={busyId === q.id} onClick={() => retry(`/api/questions/${q.id}/retry`, q.id)}>
                            Looks stuck — resume
                          </button>
                        )}
                      </div>
                    )}
                    {q.status === "failed" && (
                      <div role="alert" className="space-y-2 text-sm">
                        <Stepper stage={q.stage} status="failed" />
                        <p className="text-bad">{q.error ?? "Analysis failed."}</p>
                        <div className="flex gap-2">
                          <button className="btn" disabled={busyId === q.id} onClick={() => retry(`/api/questions/${q.id}/retry`, q.id)}>
                            {busyId === q.id ? "Retrying…" : "Retry from failed step"}
                          </button>
                          <Link href={`/questions/${q.id}`} className="btn btn-ghost">
                            Open question
                          </Link>
                        </div>
                      </div>
                    )}
                    {q.status === "duplicate_pending" && <DuplicateCard id={q.id} existingId={q.duplicateOfId} existingText={q.duplicateText} score={q.duplicateScore} onDone={load} />}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
