import { gmFetchText, type GmDetails } from "./fetch";
import { addLink, hasLink } from "./links";
import { fetchJson, lookupWorkPeople, mbidFromUrl } from "./musicbrainz";
import { SITES } from "./sites";
import type { PageInfo } from "./types";
import { enhancePage, MARKER, type UiDeps } from "./ui";

declare const __VERSION__: string;
declare function GM_xmlhttpRequest(details: GmDetails): void;

export const VERSION: string = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

const NAME_INPUT = "#id-edit-work\\.name";

/** What the current page is; null when it is not a work edit or create page. */
export function pageInfo(doc: Document, href: string): PageInfo | null {
  let path: string;
  try {
    path = new URL(href).pathname;
  } catch {
    return null;
  }
  const title = doc.querySelector<HTMLInputElement>(NAME_INPUT)?.value ?? "";
  const mbid = mbidFromUrl(href);
  if (mbid) return { kind: "edit", mbid, title };
  if (path === "/work/create") return { kind: "create", mbid: null, title };
  return null;
}

export function enhance(doc: Document, deps: UiDeps): "added" | "present" | "none" {
  if (doc.querySelector(`.${MARKER}`)) return "present";
  const info = pageInfo(doc, doc.location.href);
  if (!info) return "none";
  return enhancePage(doc, info, deps) ? "added" : "none";
}

function start(): void {
  const deps: UiDeps = {
    version: VERSION,
    sites: SITES,
    fetchText: (url, charset) => gmFetchText(url, charset, GM_xmlhttpRequest),
    lookupPeople: (mbid) => lookupWorkPeople(mbid, (url) => fetchJson(url)),
    hasLink: (url) => hasLink(document, url),
    addLink: (url) => addLink(document, url),
  };
  // The external links editor mounts after the page loads; poll until it is there.
  setInterval(() => enhance(document, deps), 1000);
}

if (typeof window !== "undefined" && typeof document !== "undefined" && /(^|\.)musicbrainz\.org$/.test(window.location.hostname)) {
  start();
}
