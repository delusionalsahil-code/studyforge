import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/SettingsForm";
import { aiConfig, aiConfigured } from "@/lib/ai/client";
import { requireUser } from "@/lib/auth";
import { loadTaxonomy } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const tax = await loadTaxonomy();
  const cfg = aiConfig();
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    zones = ["Asia/Kolkata", "UTC"];
  }
  let host = "";
  try {
    host = new URL(cfg.baseUrl).host;
  } catch {
    host = cfg.baseUrl;
  }

  return (
    <>
      <PageHeader title="Settings" subtitle={`${user.email} · ${user.role === "admin" ? "Administrator" : "Student"}`} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SettingsForm
          initial={{ name: user.name, timezone: user.timezone, dailyGoal: user.dailyGoal, defaultExamId: user.defaultExamId, defaultClassId: user.defaultClassId }}
          exams={tax.byLevel.exam.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name }))}
          classes={tax.byLevel.class.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name }))}
          zones={zones}
        />
        <aside className="space-y-4">
          <section className="card text-sm">
            <h2 className="section-title">AI engine</h2>
            <p className={aiConfigured() ? "font-medium text-ok" : "font-medium text-warn"}>{aiConfigured() ? "● Connected" : "● Not configured"}</p>
            <dl className="mt-3 space-y-1 text-muted">
              <div className="flex justify-between"><dt>Provider</dt><dd className="text-fg">{host}</dd></div>
              <div className="flex justify-between"><dt>Model</dt><dd className="text-fg">{cfg.model}</dd></div>
              <div className="flex justify-between"><dt>Embeddings</dt><dd className="text-fg">{cfg.embeddingModel || "disabled"}</dd></div>
            </dl>
            {!aiConfigured() && <p className="mt-3 text-xs text-muted">Set <code>AI_API_KEY</code> (OpenAI-compatible), optionally <code>AI_BASE_URL</code>, <code>AI_MODEL</code> and <code>AI_EMBEDDING_MODEL</code>. Keys never leave the server.</p>}
          </section>
          {user.role === "admin" && (
            <section className="card text-sm">
              <h2 className="section-title">Administration</h2>
              <p className="text-muted">The taxonomy is the source of truth for AI classification.</p>
              <Link href="/admin/taxonomy" className="btn mt-3">Manage taxonomy</Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
