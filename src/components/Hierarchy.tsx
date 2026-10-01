import { HIERARCHY, LEVEL_LABEL, clearBelow, optionsFor, type ClientTaxonomy, type HierarchyLevel, type Selection } from "../lib/taxonomy-types";

const ANC_TO_LEVEL: Record<string, HierarchyLevel> = { subject: "subject", unit: "unit", chapter: "chapter", subchapter: "subchapter", topic: "topic", subtopic: "subtopic" };

/** Applies a change to one level: clears deeper levels, fills ancestors, and drops anything now incompatible. */
export function applySelection(tax: ClientTaxonomy, sel: Selection, level: HierarchyLevel, id: number | null): Selection {
  let next: Selection = { ...clearBelow(sel, level), [level]: id };
  if (id) {
    const node = tax[level]?.find((n) => n.id === id);
    if (node) {
      for (const [k, v] of Object.entries(node.a)) {
        const lv = ANC_TO_LEVEL[k];
        if (lv && v) next[lv] = v;
      }
      if (node.a.curriculum && !next.exam) {
        // exam stays untouched; subject carries the curriculum
      }
    }
  }
  // drop levels no longer valid under their parents (e.g. subject after exam change)
  for (const lv of HIERARCHY) {
    const v = next[lv];
    if (v && lv !== level && !optionsFor(tax, lv, next).some((n) => n.id === v)) next = { ...next, [lv]: null };
  }
  return next;
}

export function HierarchySelects({
  tax,
  value,
  onChange,
  levels = HIERARCHY as unknown as HierarchyLevel[],
  compact = false,
}: {
  tax: ClientTaxonomy;
  value: Selection;
  onChange: (s: Selection) => void;
  levels?: HierarchyLevel[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
      {levels.map((lv) => {
        const opts = optionsFor(tax, lv, value);
        const cur = value[lv] ?? "";
        const parentChosen = lv === "class" || lv === "exam" || lv === "subject" || Boolean(value.subject || value.chapter);
        const disabled = !opts.length || !parentChosen;
        return (
          <div key={lv}>
            <label className="label" htmlFor={`h-${lv}`}>
              {LEVEL_LABEL[lv]}
            </label>
            <select id={`h-${lv}`} className="input" value={cur} disabled={disabled} onChange={(e) => onChange(applySelection(tax, value, lv, e.target.value ? Number(e.target.value) : null))}>
              <option value="">{disabled && !opts.length ? "— none available —" : `Any ${LEVEL_LABEL[lv].toLowerCase()}`}</option>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
