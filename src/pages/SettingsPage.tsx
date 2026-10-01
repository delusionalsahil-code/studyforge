import { useRef, useState } from "react";
import { ErrorBox, PageHeader, Section, toast } from "../components/ui";
import { AiError, aiConfigured, callJson } from "../lib/ai/client";
import { exportBackup, importBackup, lastSaveError, persistenceMode, resetAll, updateSettings, useDB, useTax } from "../lib/store";
import { clearSamples, loadSamples } from "../lib/sample";
import { z } from "zod";

const PRESETS: { name: string; baseUrl: string; model: string; embed: string }[] = [
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o", embed: "text-embedding-3-small" },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o", embed: "" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", embed: "" },
  { name: "Gemini (OpenAI-compatible)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash", embed: "" },
];

export default function SettingsPage() {
  const db = useDB();
  const tax = useTax();
  const s = db.settings;
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "bad"; msg?: string }>({ state: "idle" });
  const file = useRef<HTMLInputElement>(null);

  const runTest = async () => {
    setTest({ state: "busy" });
    try {
      const r = await callJson({ label: "connection test", system: "Reply with one JSON object.", user: 'Return {"ok": true}', schema: z.object({ ok: z.boolean() }), temperature: 0 });
      setTest(r.ok ? { state: "ok", msg: "Connected — the model returned valid structured JSON." } : { state: "bad", msg: "Unexpected response." });
    } catch (e) {
      setTest({ state: "bad", msg: e instanceof AiError || e instanceof Error ? e.message : "Failed" });
    }
  };

  const download = (includeKey: boolean) => {
    const blob = new Blob([exportBackup(includeKey)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `studyforge-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="AI connection, study defaults, appearance and your data." />
      <div className="max-w-3xl space-y-5">
        <Section title="AI connection" hint="Any OpenAI-compatible Chat Completions provider. A vision-capable model is recommended for image questions.">
          <div className="mb-3 rounded-lg border border-warn/40 bg-warn-soft p-3 text-xs text-warn">
            <b>Important:</b> this build runs entirely in your browser (no server). Your key is stored only on this device and requests go straight to the provider you choose. Use a key with a spending limit, and don't use this on a shared computer. The original Next.js + Postgres version keeps keys server-side.
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => <button key={p.name} className="btn btn-sm" onClick={() => updateSettings({ baseUrl: p.baseUrl, model: p.model, embeddingModel: p.embed })}>{p.name}</button>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label" htmlFor="key">API key</label>
              <div className="flex gap-2"><input id="key" className="input font-mono" type={show ? "text" : "password"} autoComplete="off" value={s.apiKey} onChange={(e) => updateSettings({ apiKey: e.target.value })} placeholder="sk-…" /><button className="btn" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div></div>
            <div><label className="label" htmlFor="base">Base URL</label><input id="base" className="input" value={s.baseUrl} onChange={(e) => updateSettings({ baseUrl: e.target.value })} /></div>
            <div><label className="label" htmlFor="model">Model</label><input id="model" className="input" value={s.model} onChange={(e) => updateSettings({ model: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="emb">Embedding model (blank disables semantic search & semantic duplicates)</label><input id="emb" className="input" value={s.embeddingModel} onChange={(e) => updateSettings({ embeddingModel: e.target.value })} /></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className="btn btn-primary btn-sm" onClick={runTest} disabled={!aiConfigured() || test.state === "busy"}>{test.state === "busy" ? "Testing…" : "Test connection"}</button>
            {test.state === "ok" && <span className="text-sm text-good">{test.msg}</span>}
          </div>
          {test.state === "bad" && <div className="mt-3"><ErrorBox title="Connection failed">{test.msg}</ErrorBox></div>}
        </Section>

        <Section title="Study defaults" hint="Used only as a tie-breaker when the AI classifies a question.">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">Default exam</label><select className="input" value={s.defaultExam} onChange={(e) => updateSettings({ defaultExam: e.target.value })}>{tax.byLevel.exam.filter((x) => x.active).map((x) => <option key={x.id}>{x.name}</option>)}</select></div>
            <div><label className="label">Default class</label><select className="input" value={s.defaultClass} onChange={(e) => updateSettings({ defaultClass: e.target.value })}>{tax.byLevel.class.filter((x) => x.active).map((x) => <option key={x.id}>{x.name}</option>)}</select></div>
            <div><label className="label">Theme</label><select className="input" value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as "light" | "dark" | "system" })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
          </div>
        </Section>

        <Section title="Your data" hint={persistenceMode === "indexeddb" ? "Stored locally in this browser (IndexedDB). Back it up regularly." : "Browser storage unavailable — data lives only in this tab."}>
          {lastSaveError && <div className="mb-3"><ErrorBox title="Save problem">{lastSaveError}</ErrorBox></div>}
          <div className="mb-3 grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-4">
            {[["Questions", db.questions.length], ["Formulas", db.formulas.length], ["Reviews", db.reviews.length], ["Taxonomy nodes", db.nodes.length]].map(([k, v]) => <div key={k as string} className="rounded-lg bg-surface-2 p-3"><div className="text-xl font-semibold tabular-nums">{v}</div><div className="text-xs text-muted">{k}</div></div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => download(false)}>Export backup</button>
            <button className="btn btn-sm" onClick={() => file.current?.click()}>Import backup</button>
            <input ref={file} type="file" hidden accept="application/json" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { importBackup(await f.text()); toast("Backup restored", "good"); } catch (err) { toast(err instanceof Error ? err.message : "Could not import that file", "bad"); } }} />
            {db.questions.some((q) => q.isSample) ? <button className="btn btn-sm" onClick={() => clearSamples()}>Remove sample data</button> : <button className="btn btn-sm" onClick={() => toast(`Loaded ${loadSamples()} sample questions`, "good")}>Load sample data</button>}
            <button className="btn btn-sm !text-bad" onClick={() => { if (confirm("Erase ALL questions, formulas, history and custom taxonomy from this browser?")) { resetAll(); toast("Everything was reset", "good"); } }}>Reset everything</button>
          </div>
        </Section>
      </div>
    </>
  );
}
