import { useRef, useState, type DragEvent } from "react";
import { Processing } from "../components/Processing";
import { ErrorBox, PageHeader, Tabs, toast } from "../components/ui";
import { UserError, startImport } from "../lib/actions";
import { aiConfigured } from "../lib/ai/client";
import { prepareImage, preparePdf } from "../lib/files";
import { Link } from "../lib/router";
import { useDB } from "../lib/store";
import { cn } from "../utils/cn";

type Kind = "text" | "image" | "pdf";

export default function AddPage() {
  useDB();
  const [kind, setKind] = useState<Kind>("text");
  const [text, setText] = useState("");
  const [split, setSplit] = useState(false);
  const [source, setSource] = useState("");
  const [page, setPage] = useState("");
  const [file, setFile] = useState<{ filename: string; mime: string; dataUrl: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const take = async (f: File | undefined | null) => {
    if (!f) return;
    setError(null);
    setBusy(true);
    try {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        setKind("pdf");
        setFile(await preparePdf(f));
      } else {
        setKind("image");
        setFile(await prepareImage(f));
      }
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void take(e.dataTransfer.files?.[0]);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
    if (f) {
      e.preventDefault();
      void take(f);
    }
  };

  const submit = () => {
    setError(null);
    try {
      startImport({ kind, text, file: kind === "text" ? undefined : file ?? undefined, sourceName: source, sourcePage: page, split });
      toast(kind === "text" ? "Question added — analysing…" : "Upload received — extracting questions…", "good");
      setText("");
      setFile(null);
    } catch (e) {
      setError(e instanceof UserError ? e.message : "Could not start the import.");
    }
  };

  return (
    <>
      <PageHeader title="Add questions" subtitle="Paste, type, drop a screenshot, snap a photo or upload a PDF. Every question is classified, solved and scheduled for revision automatically." />
      <div className="max-w-3xl space-y-4">
        {!aiConfigured() && (
          <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm text-warn">
            AI isn't configured yet, so analysis will pause with a retryable error. <Link to="/settings" className="font-semibold underline">Add your API key in Settings</Link> — or{" "}
            <Link to="/dashboard" className="font-semibold underline">load sample data</Link> to explore the app.
          </div>
        )}
        <div className="card space-y-4">
          <Tabs<Kind> value={kind} onChange={(k) => { setKind(k); setFile(null); setError(null); }} items={[{ key: "text", label: "Text" }, { key: "image", label: "Image / camera" }, { key: "pdf", label: "PDF" }]} />

          {kind === "text" ? (
            <div>
              <label className="label" htmlFor="qtext">Question</label>
              <textarea
                id="qtext"
                className="input min-h-44 font-mono text-[13px] leading-relaxed"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={onPaste}
                placeholder={"Type or paste a question. Use $…$ for maths, e.g.\nA wire of resistance $R$ is stretched to twice its length. Find the new resistance."}
              />
              <label className="mt-2 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                <span>
                  This text contains <b>several questions</b> — split them automatically
                  <span className="block text-xs text-muted">Uses AI to separate and transcribe each question.</span>
                </span>
              </label>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors", drag ? "border-brand bg-brand-soft" : "border-line")}
            >
              {file && kind === "image" ? (
                <img src={file.dataUrl} alt="Selected question" className="max-h-72 rounded-lg border border-line object-contain" />
              ) : file ? (
                <div className="text-sm"><b>{file.filename}</b> · {(file.size / 1024 / 1024).toFixed(2)} MB</div>
              ) : (
                <>
                  <div className="text-sm font-medium">Drag & drop {kind === "pdf" ? "a PDF" : "an image"} here</div>
                  <div className="text-xs text-muted">{kind === "pdf" ? "Text PDFs and scanned PDFs, up to 20 MB. Multiple questions are extracted automatically." : "Screenshots and photos; large images are shrunk automatically. You can also paste (Ctrl/⌘+V)."}</div>
                </>
              )}
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>{file ? "Choose another" : "Choose file"}</button>
                {kind === "image" && <button className="btn btn-sm" onClick={() => camRef.current?.click()} disabled={busy}>Use camera</button>}
                {file && <button className="btn btn-sm" onClick={() => setFile(null)}>Remove</button>}
              </div>
              <input ref={fileRef} type="file" hidden accept={kind === "pdf" ? "application/pdf" : "image/*"} onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
              <input ref={camRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="src">Source (optional)</label>
              <input id="src" className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. HC Verma Ch. 32, JEE Main 2023 Shift 1" maxLength={120} />
            </div>
            <div>
              <label className="label" htmlFor="pg">Page (optional)</label>
              <input id="pg" className="input" value={page} onChange={(e) => setPage(e.target.value)} maxLength={20} />
            </div>
          </div>

          {error && <ErrorBox title="Can't add this yet">{error}</ErrorBox>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">The original text/file is stored untouched. Duplicates are detected before saving.</p>
            <button className="btn btn-primary" disabled={busy || (kind === "text" ? !text.trim() : !file)} onClick={submit}>
              {kind === "text" ? "Add & analyse" : "Upload & analyse"}
            </button>
          </div>
        </div>
      </div>
      <div className="max-w-3xl">
        <Processing />
      </div>
    </>
  );
}
