import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

export function fixtureHtml(name: string): string {
  return readFileSync(`${FIXTURES}${name}.html`, "utf8");
}

/** A lyrics site search results page. The fixture is a fragment of the page. */
export function siteDocument(name: string, url: string): Document {
  return new JSDOM(`<!doctype html><html><body>${fixtureHtml(name)}</body></html>`, { url }).window.document;
}

const EDIT_URL = "https://musicbrainz.org/work/d2364f4b-3c9a-4698-af3e-0ec10eb52cf8/edit";
const CREATE_URL = "https://musicbrainz.org/work/create";

/** The work edit page fixture (fieldsets and the external links editor). */
export function editDocument(): Document {
  return new JSDOM(`<!doctype html><html><body>${fixtureHtml("mb-work-edit")}</body></html>`, { url: EDIT_URL }).window.document;
}

/** The same markup with an empty name and no existing links, at the create URL. */
export function createDocument(): Document {
  const doc = new JSDOM(`<!doctype html><html><body>${fixtureHtml("mb-work-edit")}</body></html>`, { url: CREATE_URL }).window.document;
  doc.querySelector<HTMLInputElement>("#id-edit-work\\.name")!.value = "";
  for (const tr of Array.from(doc.querySelectorAll("#external-links-editor tr"))) {
    if (!tr.querySelector("input[type=url]")) tr.remove();
  }
  return doc;
}

export function emptyDocument(url = "https://example.invalid/"): Document {
  return new JSDOM("<!doctype html><html><body></body></html>", { url }).window.document;
}

export function mbJson(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8"));
}
