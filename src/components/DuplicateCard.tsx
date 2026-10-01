"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Rich } from "@/components/Rich";

/** "This question already exists" — open existing, save anyway, or merge metadata. */
export function DuplicateCard({ id, existingId, existingText, score, onDone }: { id: string; existingId: string | null; existingText?: string | null; score?: number | null; onDone?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"keep" | "merge" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "keep" | "merge") {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/questions/${id}/duplicate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Could not resolve the duplicate.");
    if (action === "merge" && data.mergedInto) router.push(`/questions/${data.mergedInto}`);
    else {
      onDone?.();
      router.refresh();
    }
  }

  return (
    <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
      <p className="font-semibold text-warn">This question already exists{score ? ` (${Math.round(score * 100)}% match)` : ""}.</p>
      {existingText && (
        <div className="mt-2 line-clamp-3 rounded-lg bg-surface p-2.5 text-muted">
          <Rich text={existingText} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {existingId && (
          <Link href={`/questions/${existingId}`} className="btn">
            Open existing
          </Link>
        )}
        <button className="btn" disabled={busy !== null} onClick={() => act("keep")}>
          {busy === "keep" ? "Saving…" : "Save anyway"}
        </button>
        <button className="btn" disabled={busy !== null || !existingId} onClick={() => act("merge")} title="Adds this upload's source details to the existing question and discards the copy">
          {busy === "merge" ? "Merging…" : "Merge metadata"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
