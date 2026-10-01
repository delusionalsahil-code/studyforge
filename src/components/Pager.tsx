import Link from "next/link";

export function Pager({ basePath, params, page, pages }: { basePath: string; params: Record<string, string>; page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams(params);
    qs.set("page", String(p));
    qs.delete("focus");
    return `${basePath}?${qs.toString()}`;
  };
  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn">
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="btn">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function paramsOf(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) out[k] = v;
  return out;
}
