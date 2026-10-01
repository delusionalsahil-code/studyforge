"use client";

import { HIERARCHY, LEVEL_LABEL, optionsFor, type ClientTaxonomy, type HierarchyLevel, type Selection } from "@/lib/taxonomy-types";

const NEEDS: Partial<Record<HierarchyLevel, HierarchyLevel>> = {
  unit: "subject",
  chapter: "subject",
  subchapter: "chapter",
  topic: "chapter",
  subtopic: "topic",
  concept: "chapter",
};

/** Drops any selection that is no longer valid under its (changed) ancestors. */
export function normalizeSelection(tax: ClientTaxonomy, sel: Selection): Selection {
  const next: Selection = { ...sel };
  for (const l of HIERARCHY) {
    const id = next[l];
    if (!id) continue;
    const need = NEEDS[l];
    if (need && !next[need]) next[l] = null;
    else if (!optionsFor(tax, l, next).some((o) => o.id === id)) next[l] = null;
  }
  return next;
}

interface Props {
  tax: ClientTaxonomy;
  value: Selection;
  onChange: (next: Selection) => void;
  levels?: readonly HierarchyLevel[];
  emptyLabel?: (level: HierarchyLevel) => string;
  className?: string;
}

/** Dependent hierarchy selects: each list only shows options beneath the current selection. */
export function HierarchyFields({ tax, value, onChange, levels = HIERARCHY, emptyLabel = (l) => `All ${LEVEL_LABEL[l].toLowerCase()}s`, className = "" }: Props) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {levels.map((level) => {
        const need = NEEDS[level];
        const blocked = Boolean(need && !value[need]);
        const opts = blocked ? [] : optionsFor(tax, level, value);
        return (
          <div key={level}>
            <label className="label" htmlFor={`h-${level}`}>
              {LEVEL_LABEL[level]}
            </label>
            <select
              id={`h-${level}`}
              className="input"
              value={value[level] ?? ""}
              disabled={blocked}
              onChange={(e) => onChange(normalizeSelection(tax, { ...value, [level]: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">{blocked ? `Select ${LEVEL_LABEL[need!].toLowerCase()} first` : opts.length ? emptyLabel(level) : `No ${LEVEL_LABEL[level].toLowerCase()} here`}</option>
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
