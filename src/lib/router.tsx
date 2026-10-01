import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from "react";

/** Tiny hash router (works from a single static file). Routes look like  #/questions?subjectId=3 */
export interface Route {
  path: string;
  segments: string[];
  params: Record<string, string>;
}

const parse = (hash: string): Route => {
  const raw = hash.replace(/^#/, "") || "/dashboard";
  const [p, qs = ""] = raw.split("?");
  const path = p.startsWith("/") ? p : `/${p}`;
  const params: Record<string, string> = {};
  new URLSearchParams(qs).forEach((v, k) => (params[k] = v));
  return { path, segments: path.split("/").filter(Boolean), params };
};

let cached = { hash: "", route: parse("") };
const getRoute = (): Route => {
  const h = window.location.hash;
  if (h !== cached.hash) cached = { hash: h, route: parse(h) };
  return cached.route;
};
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export const useRoute = (): Route => useSyncExternalStore(subscribe, getRoute);

export function href(path: string, params?: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return `#${path}${s ? `?${s}` : ""}`;
}
export function go(path: string, params?: Record<string, string | number | null | undefined>) {
  window.location.hash = href(path, params).slice(1);
}
export function setParams(route: Route, patch: Record<string, string | null | undefined>, resetPage = true) {
  const next: Record<string, string> = { ...route.params };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") delete next[k];
    else next[k] = v;
  }
  if (resetPage && !("page" in patch)) delete next.page;
  // replace instead of push so filter tweaks don't flood history
  const url = href(route.path, next);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function Link({ to, params, children, ...rest }: { to: string; params?: Record<string, string | number | null | undefined>; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a href={href(to, params)} {...rest}>
      {children}
    </a>
  );
}

export function useScrollTop(dep: string) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [dep]);
}
