"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LEVEL_LABEL, LEVEL_PLURAL, type Level } from "@/lib/taxonomy-types";

export interface AdminNode {
  level: Level;
  id: number;
  name: string;
  description: string | null;
  orderIndex: number;
  active: boolean;
  parent: { level: Level; id: number } | null;
}

const CHILDREN: Record<Level, Level[]> = {
  curriculum: ["exam", "subject"],
  exam: [],
  class: [],
  question_type: [],
  subject: ["unit", "chapter"],
  unit: ["chapter"],
  chapter: ["subchapter", "topic", "concept"],
  subchapter: ["topic"],
  topic: ["subtopic", "concept"],
  subtopic: ["concept"],
  concept: [],
};
const LEVEL_ORDER: Level[] = ["curriculum", "exam", "class", "question_type", "subject", "unit", "chapter", "subchapter", "topic", "subtopic", "concept"];
const ROOTS: Level[] = ["curriculum", "class", "question_type"];

const key = (l: Level, id: number) => `${l}:${id}`;

export function TaxonomyAdmin({ nodes }: { nodes: AdminNode[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState<Level | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { kids, byKey, matchSet } = useMemo(() => {
    const byKey = new Map(nodes.map((n) => [key(n.level, n.id), n]));
    const kids = new Map<string, AdminNode[]>();
    for (const n of nodes) {
      if (!n.parent) continue;
      const k = key(n.parent.level, n.parent.id);
      kids.set(k, [...(kids.get(k) ?? []), n]);
    }
    for (const arr of kids.values()) arr.sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.orderIndex - b.orderIndex || a.id - b.id);
    // nodes visible under a text filter = matches + their ancestors
    let matchSet: Set<string> | null = null;
    const f = filter.trim().toLowerCase();
    if (f) {
      matchSet = new Set();
      for (const n of nodes) {
        if (!n.name.toLowerCase().includes(f)) continue;
        let cur: AdminNode | undefined = n;
        while (cur) {
          matchSet.add(key(cur.level, cur.id));
          cur = cur.parent ? byKey.get(key(cur.parent.level, cur.parent.id)) : undefined;
        }
      }
    }
    return { kids, byKey, matchSet };
  }, [nodes, filter]);

  const roots = (l: Level) => nodes.filter((n) => n.level === l).sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(d.error ?? "Request failed");
      return false;
    }
    router.refresh();
    return true;
  }

  function toggle(k: string) {
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  function AddForm({ parent, level }: { parent: AdminNode | null; level?: Level }) {
    const options = level ? [level] : CHILDREN[parent!.level];
    const [lv, setLv] = useState<Level>(options[0]);
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    return (
      <form
        className="my-1.5 flex flex-wrap items-end gap-2 rounded-lg bg-surface2 p-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await call("/api/admin/taxonomy", { method: "POST", body: JSON.stringify({ level: lv, parent: parent ? { level: parent.level, id: parent.id } : null, name, description: desc || null }) });
          if (ok) {
            setName("");
            setDesc("");
            if (parent) setOpen((p) => new Set(p).add(key(parent.level, parent.id)));
          }
        }}
      >
        {options.length > 1 && (
          <select className="input !w-auto" value={lv} onChange={(e) => setLv(e.target.value as Level)} aria-label="Level">
            {options.map((o) => <option key={o} value={o}>{LEVEL_LABEL[o]}</option>)}
          </select>
        )}
        <input className="input !w-56" placeholder={`New ${LEVEL_LABEL[lv].toLowerCase()} name`} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <input className="input !w-64" placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button className="btn btn-primary" disabled={busy}>Add</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setAdding(null); setAddingRoot(null); }}>Cancel</button>
      </form>
    );
  }

  function EditForm({ node }: { node: AdminNode }) {
    const [name, setName] = useState(node.name);
    const [desc, setDesc] = useState(node.description ?? "");
    const [order, setOrder] = useState(node.orderIndex);
    return (
      <form
        className="my-1.5 flex flex-wrap items-end gap-2 rounded-lg bg-surface2 p-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call(`/api/admin/taxonomy/${node.level}/${node.id}`, { method: "PATCH", body: JSON.stringify({ name, description: desc || null, orderIndex: order }) })) setEditing(null);
        }}
      >
        <input className="input !w-60" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Name" />
        <input className="input !w-64" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" aria-label="Description" />
        <input className="input !w-20" type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} aria-label="Order" title="Order index" />
        <button className="btn btn-primary" disabled={busy}>Save</button>
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
      </form>
    );
  }

  function Row({ node, depth }: { node: AdminNode; depth: number }) {
    const k = key(node.level, node.id);
    if (matchSet && !matchSet.has(k)) return null;
    const children = kids.get(k) ?? [];
    const isOpen = matchSet ? true : open.has(k);
    const canAdd = CHILDREN[node.level].length > 0;
    return (
      <li>
        <div className={`group flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface2 ${!node.active ? "opacity-60" : ""}`} style={{ paddingLeft: depth * 18 + 8 }}>
          <button className="w-5 text-muted" onClick={() => toggle(k)} aria-label={isOpen ? "Collapse" : "Expand"} disabled={!children.length && !canAdd}>
            {children.length ? (isOpen ? "▾" : "▸") : "·"}
          </button>
          <span className="badge shrink-0">{LEVEL_LABEL[node.level]}</span>
          <span className={`min-w-0 flex-1 truncate font-medium ${node.active ? "" : "line-through"}`} title={node.description ?? undefined}>{node.name}</span>
          {children.length > 0 && <span className="text-xs text-muted">{children.length}</span>}
          <span className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {canAdd && <button className="btn btn-ghost !min-h-7 !px-2 text-xs" onClick={() => { setAdding(k); setOpen((p) => new Set(p).add(k)); }}>+ Add</button>}
            <button className="btn btn-ghost !min-h-7 !px-2 text-xs" onClick={() => setEditing(k)}>Edit</button>
            <button className="btn btn-ghost !min-h-7 !px-2 text-xs" onClick={() => call(`/api/admin/taxonomy/${node.level}/${node.id}`, { method: "PATCH", body: JSON.stringify({ active: !node.active }) })}>{node.active ? "Deactivate" : "Activate"}</button>
            <button className="btn btn-ghost !min-h-7 !px-2 text-xs text-bad" onClick={() => confirm(`Delete “${node.name}” and everything beneath it?`) && call(`/api/admin/taxonomy/${node.level}/${node.id}`, { method: "DELETE" })}>Delete</button>
          </span>
        </div>
        {editing === k && <div style={{ paddingLeft: depth * 18 + 32 }}><EditForm node={node} /></div>}
        {adding === k && <div style={{ paddingLeft: depth * 18 + 32 }}><AddForm parent={node} /></div>}
        {isOpen && children.length > 0 && (
          <ul>
            {children.map((c) => <Row key={key(c.level, c.id)} node={c} depth={depth + 1} />)}
          </ul>
        )}
      </li>
    );
  }

  void byKey;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input !w-72" placeholder="Filter tree by name…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter taxonomy" />
        <button className="btn" onClick={() => setOpen(new Set())}>Collapse all</button>
        <p className="text-xs text-muted">{nodes.length} entries · changes apply immediately to AI classification, filters and the question editor.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
      {ROOTS.map((root) => (
        <section key={root} className="card !p-3">
          <div className="mb-1 flex items-center justify-between px-2">
            <h2 className="section-title !mb-0">{LEVEL_PLURAL[root]}</h2>
            <button className="btn btn-ghost !min-h-7 text-xs" onClick={() => setAddingRoot(root)}>+ Add {LEVEL_LABEL[root].toLowerCase()}</button>
          </div>
          {addingRoot === root && <AddForm parent={null} level={root} />}
          <ul>{roots(root).map((n) => <Row key={key(n.level, n.id)} node={n} depth={0} />)}</ul>
          {roots(root).length === 0 && <p className="px-2 py-3 text-sm text-muted">Nothing here yet.</p>}
        </section>
      ))}
    </div>
  );
}
