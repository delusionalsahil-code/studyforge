import { useMemo, useState } from "react";
import { ErrorBox, PageHeader, toast } from "../components/ui";
import { UserError, createNode, deleteNode, nodeUsage, updateNode } from "../lib/actions";
import { useTax } from "../lib/store";
import { allowedParents, type TaxNode, type Taxonomy } from "../lib/taxonomy";
import { LEVEL_LABEL, type Level } from "../lib/taxonomy-types";
import { normalizeName } from "../lib/text";
import { cn } from "../utils/cn";

const CHILD_LEVELS: Level[] = ["exam", "subject", "unit", "chapter", "subchapter", "topic", "subtopic", "concept"];
const childLevelsFor = (l: Level) => CHILD_LEVELS.filter((c) => allowedParents(c).includes(l));

export default function TaxonomyPage() {
  const tax = useTax();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState<{ parent: TaxNode | null; level: Level } | null>(null);
  const [editing, setEditing] = useState<TaxNode | null>(null);

  const roots: { title: string; level: Level; nodes: TaxNode[] }[] = [
    { title: "Curricula", level: "curriculum", nodes: tax.byLevel.curriculum },
    { title: "Classes", level: "class", nodes: tax.byLevel.class },
    { title: "Question types", level: "question_type", nodes: tax.byLevel.question_type },
  ];
  const f = normalizeName(filter);
  const matching = useMemo(() => {
    if (!f) return null;
    const keep = new Set<string>();
    const forced = new Set<string>();
    for (const l of Object.keys(tax.byLevel) as Level[]) {
      for (const n of tax.byLevel[l]) {
        if (!normalizeName(n.name).includes(f)) continue;
        keep.add(`${n.level}:${n.id}`);
        let p = n.parent;
        while (p) {
          keep.add(`${p.level}:${p.id}`);
          forced.add(`${p.level}:${p.id}`);
          p = tax.get(p.level, p.id)?.parent ?? null;
        }
      }
    }
    return { keep, forced };
  }, [f, tax]);

  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const total = Object.values(tax.byLevel).reduce((a, b) => a + b.length, 0);

  return (
    <>
      <PageHeader title="Taxonomy manager" subtitle={`${total} nodes. This tree is the single source of truth: the AI can only choose names from it, so a spelling variant can never become a new category.`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input !w-72" placeholder="Filter tree by name…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter taxonomy" />
        <button className="btn btn-sm" onClick={() => setOpen(new Set())}>Collapse all</button>
        <span className="ml-auto text-xs text-muted">Admin access: you own this local workspace.</span>
      </div>
      {(adding || editing) && (
        <NodeForm tax={tax} adding={adding} editing={editing} onClose={() => { setAdding(null); setEditing(null); }} />
      )}
      <div className="space-y-5">
        {roots.map((r) => (
          <div key={r.level} className="card !p-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{r.title}</h2>
              <button className="btn btn-sm" onClick={() => { setEditing(null); setAdding({ parent: null, level: r.level }); }}>+ Add {LEVEL_LABEL[r.level].toLowerCase()}</button>
            </div>
            <ul className="py-1">
              {r.nodes.filter((n) => !matching || matching.keep.has(`${n.level}:${n.id}`)).map((n) => (
                <Row key={`${n.level}:${n.id}`} n={n} tax={tax} depth={0} open={open} toggle={toggle} matching={matching} onAdd={(parent, level) => { setEditing(null); setAdding({ parent, level }); }} onEdit={(x) => { setAdding(null); setEditing(x); }} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function Row({ n, tax, depth, open, toggle, matching, onAdd, onEdit }: { n: TaxNode; tax: Taxonomy; depth: number; open: Set<string>; toggle: (k: string) => void; matching: { keep: Set<string>; forced: Set<string> } | null; onAdd: (p: TaxNode, l: Level) => void; onEdit: (n: TaxNode) => void }) {
  const key = `${n.level}:${n.id}`;
  const kids = tax.children(n.level, n.id).filter((k) => !matching || matching.keep.has(`${k.level}:${k.id}`));
  const allKids = tax.children(n.level, n.id);
  const expanded = open.has(key) || (matching?.forced.has(key) ?? false);
  const addLevels = childLevelsFor(n.level);
  const usage = n.level === "concept" || n.level === "chapter" || n.level === "subject" || n.level === "topic" ? nodeUsage(n.level, n.id) : 0;
  return (
    <li>
      <div className={cn("group flex items-center gap-1.5 py-1 pr-3 hover:bg-surface-2", !n.active && "opacity-50")} style={{ paddingLeft: 12 + depth * 18 }}>
        <button className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted", allKids.length ? "hover:bg-line" : "invisible")} onClick={() => toggle(key)} aria-label={expanded ? "Collapse" : "Expand"} aria-expanded={expanded}>{expanded ? "▾" : "▸"}</button>
        <span className="rounded bg-surface-2 px-1.5 text-[10px] font-semibold uppercase text-muted">{LEVEL_LABEL[n.level]}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={n.description ?? undefined}>{n.name}</span>
        {allKids.length > 0 && <span className="text-[11px] text-muted">{allKids.length}</span>}
        {usage > 0 && <span className="rounded-full bg-brand-soft px-1.5 text-[10px] font-semibold text-brand">{usage} Qs</span>}
        <span className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {addLevels.length > 0 && <button className="btn btn-sm !px-2" onClick={() => { onAdd(n, addLevels[0]); if (!expanded) toggle(key); }}>+ Child</button>}
          <button className="btn btn-sm !px-2" onClick={() => onEdit(n)}>Edit</button>
        </span>
      </div>
      {expanded && kids.length > 0 && <ul>{kids.map((k) => <Row key={`${k.level}:${k.id}`} n={k} tax={tax} depth={depth + 1} open={open} toggle={toggle} matching={matching} onAdd={onAdd} onEdit={onEdit} />)}</ul>}
    </li>
  );
}

function NodeForm({ tax, adding, editing, onClose }: { tax: Taxonomy; adding: { parent: TaxNode | null; level: Level } | null; editing: TaxNode | null; onClose: () => void }) {
  const [level, setLevel] = useState<Level>(adding?.level ?? "chapter");
  const [name, setName] = useState(editing?.name ?? "");
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [err, setErr] = useState<string | null>(null);
  const parent = adding?.parent ?? null;
  const levels = parent ? childLevelsFor(parent.level) : [adding?.level ?? "class"];
  const usage = editing ? nodeUsage(editing.level, editing.id) : 0;
  const run = (fn: () => void, msg: string) => { try { fn(); toast(msg, "good"); onClose(); } catch (e) { setErr(e instanceof UserError ? e.message : "Something went wrong."); } };
  return (
    <div className="card mb-5 space-y-3 !border-brand/40">
      <h2 className="font-semibold">{editing ? `Edit ${LEVEL_LABEL[editing.level].toLowerCase()}` : parent ? `Add under “${parent.name}”` : `Add ${LEVEL_LABEL[adding!.level].toLowerCase()}`}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {adding && levels.length > 1 && (
          <div><label className="label">Type</label><select className="input" value={level} onChange={(e) => setLevel(e.target.value as Level)}>{levels.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select></div>
        )}
        <div className={levels.length > 1 || editing ? "" : "sm:col-span-1"}><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div className="sm:col-span-1"><label className="label">Description (optional)</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      </div>
      {err && <ErrorBox title="Not saved">{err}</ErrorBox>}
      <div className="flex flex-wrap gap-2">
        {adding && <button className="btn btn-primary btn-sm" onClick={() => run(() => createNode({ level, parent: parent ? { level: parent.level, id: parent.id } : null, name, description: desc }), "Added")}>Add</button>}
        {editing && (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => run(() => updateNode(editing.level, editing.id, { name, description: desc }), "Saved")}>Save</button>
            <button className="btn btn-sm" onClick={() => run(() => updateNode(editing.level, editing.id, { active: !editing.active }), editing.active ? "Deactivated — hidden from AI and filters" : "Activated")}>{editing.active ? "Deactivate" : "Activate"}</button>
            <button className="btn btn-sm !text-bad" onClick={() => { if (confirm(`Delete “${editing.name}”?`)) run(() => deleteNode(editing.level, editing.id), "Deleted"); }}>Delete</button>
          </>
        )}
        <button className="btn btn-sm" onClick={onClose}>Cancel</button>
      </div>
      {editing && <p className="text-xs text-muted">{usage} question{usage === 1 ? "" : "s"} use this node{tax.children(editing.level, editing.id).length ? ` · ${tax.children(editing.level, editing.id).length} child nodes` : ""}. Deleting needs no children and no linked questions; otherwise deactivate it.</p>}
    </div>
  );
}
