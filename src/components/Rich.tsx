import katex from "katex";
import { memo, useMemo } from "react";

const MATH = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

function render(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore", output: "html" });
  } catch {
    return tex.replace(/</g, "&lt;");
  }
}

/** Text with $inline$ and $$display$$ LaTeX. Non-math text is rendered as plain React text (no HTML injection). */
export const Rich = memo(function Rich({ text, className = "" }: { text: string; className?: string }) {
  const parts = useMemo(() => (text ?? "").split(MATH), [text]);
  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((p, i) => {
        if (p.startsWith("$$") && p.endsWith("$$") && p.length > 4) return <span key={i} className="block" dangerouslySetInnerHTML={{ __html: render(p.slice(2, -2), true) }} />;
        if (p.startsWith("$") && p.endsWith("$") && p.length > 2) return <span key={i} dangerouslySetInnerHTML={{ __html: render(p.slice(1, -1), false) }} />;
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
});

/** A bare LaTeX expression (no delimiters). */
export function Tex({ tex, fallback, display = false }: { tex: string; fallback?: string; display?: boolean }) {
  const html = useMemo(() => (tex ? render(tex, display) : ""), [tex, display]);
  if (!tex) return <span className="font-mono text-sm">{fallback}</span>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
