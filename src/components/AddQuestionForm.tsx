"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";
const MAX = 15 * 1024 * 1024;

export function AddQuestionForm({ aiReady }: { aiReady: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [multi, setMulti] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourcePage, setSourcePage] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : ""));
    setPreviews(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const bad = incoming.find((f) => !ACCEPT.split(",").includes(f.type) && !/\.(pdf|jpe?g|png|webp|gif)$/i.test(f.name));
    if (bad) return setError(`"${bad.name}" isn't supported. Use JPEG, PNG, WebP, GIF or PDF.`);
    const big = incoming.find((f) => f.size > MAX);
    if (big) return setError(`"${big.name}" is larger than 15 MB.`);
    setError(null);
    setFiles((prev) => [...prev, ...incoming].slice(0, 10));
  }

  // paste a screenshot straight from the clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (imgs.length) {
        e.preventDefault();
        addFiles(imgs);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!text.trim() && !files.length) return setError("Type or paste a question, or add an image / PDF.");
    setBusy(true);
    const fd = new FormData();
    fd.set("text", text);
    fd.set("multi", String(multi));
    fd.set("sourceName", sourceName);
    fd.set("sourcePage", sourcePage);
    for (const f of files) fd.append("files", f);
    try {
      const res = await fetch("/api/imports", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Upload failed. Please try again.");
        setBusy(false);
        return;
      }
      router.push(`/imports?new=${(data.importIds as string[]).join(",")}`);
    } catch {
      setError("Network error — nothing was saved. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {!aiReady && (
        <div role="alert" className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          <p className="font-semibold text-warn">AI isn’t configured on this server yet.</p>
          <p className="mt-1 text-muted">
            You can still save questions, but analysis (classification, solutions, formulas, tricks) will stop with a clear error until an administrator sets <code>AI_API_KEY</code>. Saved questions can be retried afterwards without re-uploading.
          </p>
        </div>
      )}

      <div className="card space-y-3">
        <label className="label" htmlFor="qtext">
          Question text
        </label>
        <textarea
          id="qtext"
          className="input min-h-40 font-mono text-[13px] leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Type or paste a question. Use $…$ for maths, e.g.\nA wire of resistance $R$ is stretched to twice its length. Find the new resistance."}
          maxLength={30000}
        />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
          <span>
            This text contains <b>multiple questions</b> — split them automatically
            <span className="block text-xs text-muted">Images and PDFs are always scanned for every question they contain.</span>
          </span>
        </label>
      </div>

      <div
        className={`card border-2 border-dashed text-center transition-colors ${drag ? "border-brand bg-brand-soft" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <p className="font-medium">Drag &amp; drop screenshots, photos or PDFs here</p>
        <p className="mt-1 text-xs text-muted">JPEG · PNG · WebP · PDF — up to 10 files, 15 MB each. You can also paste an image (Ctrl/⌘ + V).</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Choose files
          </button>
          <button type="button" className="btn sm:hidden" onClick={() => camRef.current?.click()}>
            📷 Take photo
          </button>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />

        {files.length > 0 && (
          <ul className="mt-4 grid gap-2 text-left sm:grid-cols-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface2 p-2">
                {previews[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[i]} alt="" className="size-12 rounded object-cover" />
                ) : (
                  <span className="grid size-12 place-items-center rounded bg-surface text-xs font-bold text-bad">PDF</span>
                )}
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate">{f.name}</span>
                  <span className="text-xs text-muted">{(f.size / 1024).toFixed(0)} KB</span>
                </span>
                <button type="button" className="btn btn-ghost !px-2" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="src">
            Source (optional)
          </label>
          <input id="src" className="input" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. HC Verma Ch. 32, JEE Main 2023 Shift 1" maxLength={120} />
        </div>
        <div>
          <label className="label" htmlFor="page">
            Page / question no. (optional)
          </label>
          <input id="page" className="input" value={sourcePage} onChange={(e) => setSourcePage(e.target.value)} maxLength={30} />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button className="btn btn-primary px-6" disabled={busy}>
          {busy ? "Uploading…" : "Save & analyse"}
        </button>
      </div>
    </form>
  );
}
