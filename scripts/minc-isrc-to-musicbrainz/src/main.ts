import { searchReleases } from "./musicbrainz";
import { enhanceModalBody, MARKER, type UiDeps } from "./ui";

declare const __VERSION__: string;

export function enhanceOpenModals(doc: Document, deps: UiDeps): number {
  let count = 0;
  const bodies = doc.querySelectorAll(`.modal.in .modal-body:not(.${MARKER})`);
  for (const body of Array.from(bodies)) {
    if (!body.querySelector(".detail_data") || !body.querySelector("table.cd-detail2-track-list")) continue;
    if (enhanceModalBody(body, deps)) count += 1;
  }
  return count;
}

function start(): void {
  const deps: UiDeps = {
    version: typeof __VERSION__ === "string" ? __VERSION__ : "dev",
    search: (release) => searchReleases(release),
    open: (url) => {
      window.open(url, "_blank", "noopener");
    },
  };
  setInterval(() => enhanceOpenModals(document, deps), 1000);
}

if (typeof window !== "undefined" && typeof document !== "undefined" && /minc\.or\.jp$/.test(window.location.hostname)) {
  start();
}
