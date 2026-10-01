"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  initial: { name: string; timezone: string; dailyGoal: number; defaultExamId: number | null; defaultClassId: number | null };
  exams: { id: number; name: string }[];
  classes: { id: number; name: string }[];
  zones: string[];
}

export function SettingsForm({ initial, exams, classes, zones }: Props) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "err", text: d.error ?? "Could not save" });
    setMsg({ kind: "ok", text: okText });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save({ name: v.name, timezone: v.timezone, dailyGoal: v.dailyGoal, defaultExamId: v.defaultExamId, defaultClassId: v.defaultClassId }, "Preferences saved");
        }}
      >
        <h2 className="section-title !mb-0">Profile &amp; preferences</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-name">Name</label>
            <input id="s-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required maxLength={80} />
          </div>
          <div>
            <label className="label" htmlFor="s-goal">Daily revision goal</label>
            <input id="s-goal" type="number" min={1} max={500} className="input" value={v.dailyGoal} onChange={(e) => setV({ ...v, dailyGoal: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="s-tz">Time zone</label>
            <input id="s-tz" list="zones" className="input" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} />
            <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
            <p className="mt-1 text-xs text-muted">Defines when “today” starts for due dates and your streak.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="s-exam">Default exam</label>
              <select id="s-exam" className="input" value={v.defaultExamId ?? ""} onChange={(e) => setV({ ...v, defaultExamId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">None</option>
                {exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="s-class">Default class</label>
              <select id="s-class" className="input" value={v.defaultClassId ?? ""} onChange={(e) => setV({ ...v, defaultClassId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">None</option>
                {classes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted">Default exam/class are given to the AI as a tie-breaker when classifying ambiguous questions.</p>
        <button className="btn btn-primary" disabled={busy}>Save preferences</button>
      </form>

      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save(pw, "Password changed");
          setPw({ currentPassword: "", newPassword: "" });
        }}
      >
        <h2 className="section-title !mb-0">Change password</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-cur">Current password</label>
            <input id="s-cur" type="password" className="input" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" required />
          </div>
          <div>
            <label className="label" htmlFor="s-new">New password</label>
            <input id="s-new" type="password" className="input" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} minLength={8} autoComplete="new-password" required />
          </div>
        </div>
        <button className="btn" disabled={busy}>Update password</button>
      </form>

      {msg && (
        <p role={msg.kind === "err" ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${msg.kind === "ok" ? "border-ok/30 bg-ok/10 text-ok" : "border-bad/30 bg-bad/10 text-bad"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
