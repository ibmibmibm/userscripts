import type { Row } from "../types";

/** Text content with whitespace runs collapsed and trimmed; "" for null. */
export function text(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Absolute URL for a page link; "" when the href is missing or not http(s). */
export function abs(origin: string, href: string | null | undefined): string {
  if (!href) return "";
  try {
    const u = new URL(href, origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

/**
 * base + "?" + params, in the given order, without empty values.
 * Values are percent-encoded with `encode` (default: the same percent-encoding
 * `URLSearchParams` uses, which sends a space as "+").
 */
export function withParams(base: string, params: Record<string, string>, encode?: (value: string) => string): string {
  if (encode) {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      const trimmed = v.trim();
      if (trimmed) parts.push(`${k}=${encode(trimmed)}`);
    }
    return parts.length ? `${base}?${parts.join("&")}` : base;
  }
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v.trim()) p.set(k, v.trim());
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function row(partial: Partial<Row> & { url: string }): Row {
  return { title: "", artist: "", lyricist: "", composer: "", ...partial };
}
