import { lookupWork, searchByIswc, searchByTitle } from "./musicbrainz";
import { parseJwid, parseMinc } from "./parser";
import type { Site } from "./types";
import { enhancePage, MARKER, type UiDeps } from "./ui";

declare const __VERSION__: string;

export const VERSION: string = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

export function siteOf(hostname: string): Site | null {
  if (hostname === "www2.jasrac.or.jp") return "jwid";
  if (hostname === "www.minc.or.jp") return "minc";
  return null;
}

const warned = new WeakSet<Document>();

export function enhance(doc: Document, site: Site, deps: UiDeps): "added" | "present" | "none" {
  if (doc.querySelector(`.${MARKER}`)) return "present";
  const info = site === "jwid" ? parseJwid(doc) : parseMinc(doc);
  if (!info) {
    if (!warned.has(doc)) {
      warned.add(doc);
      console.warn(`[${MARKER}] no work found on this ${site} page`);
    }
    return "none";
  }
  enhancePage(doc, info, deps);
  return "added";
}

function start(site: Site): void {
  const deps: UiDeps = {
    version: VERSION,
    searchByIswc: (iswc) => searchByIswc(iswc),
    searchByTitle: (title) => searchByTitle(title),
    lookupWork: (mbid) => lookupWork(mbid),
    // Contract: returns null only when the browser blocked the popup.
    open: (url) => {
      const w = window.open(url, "_blank");
      if (w) w.opener = null;
      return w;
    },
  };
  setInterval(() => enhance(document, site, deps), 1000);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const site = siteOf(window.location.hostname);
  if (site) start(site);
}
