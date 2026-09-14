import type { Row } from "../types";

/** Text content with whitespace runs collapsed and trimmed; "" for null. */
export function text(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Absolute URL for a page link; "" when the href is missing. */
export function abs(origin: string, href: string | null | undefined): string {
  if (!href) return "";
  try {
    return new URL(href, origin).toString();
  } catch {
    return "";
  }
}

/** base + "?" + params, in the given order, without empty values. */
export function withParams(base: string, params: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v.trim()) p.set(k, v.trim());
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function row(partial: Partial<Row> & { url: string }): Row {
  return { title: "", artist: "", lyricist: "", composer: "", ...partial };
}
