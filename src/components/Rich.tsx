import { Fragment } from "react";
import katex from "katex";

const RE = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

function render(src: string, display: boolean): string {
  return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: "ignore", output: "html" });
}

/** Renders text containing $inline$ / $$display$$ LaTeX. Plain text is escaped by React. */
export function Rich({ text, className = "" }: { text: string; className?: string }) {
  const parts = (text ?? "").split(RE);
  return (
    <span className={`rich ${className}`}>
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith("$$") && p.endsWith("$$") && p.length > 4) return <span key={i} className="block" dangerouslySetInnerHTML={{ __html: render(p.slice(2, -2), true) }} />;
        if (p.startsWith("\\[") && p.endsWith("\\]")) return <span key={i} className="block" dangerouslySetInnerHTML={{ __html: render(p.slice(2, -2), true) }} />;
        if (p.startsWith("\\(") && p.endsWith("\\)")) return <span key={i} dangerouslySetInnerHTML={{ __html: render(p.slice(2, -2), false) }} />;
        if (p.startsWith("$") && p.endsWith("$") && p.length > 2) return <span key={i} dangerouslySetInnerHTML={{ __html: render(p.slice(1, -1), false) }} />;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </span>
  );
}

/** A bare LaTeX expression (no delimiters), displayed as a block. */
export function Tex({ latex, fallback }: { latex?: string | null; fallback?: string }) {
  if (!latex?.trim()) return <code className="rounded bg-surface2 px-1.5 py-0.5 text-sm">{fallback}</code>;
  return <span className="block" dangerouslySetInnerHTML={{ __html: render(latex, true) }} />;
}
