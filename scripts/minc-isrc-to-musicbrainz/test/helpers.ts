import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

export function fixtureHtml(name: string): string {
  return readFileSync(`${FIXTURES}${name}.html`, "utf8");
}

/** Loads a saved modal fixture and returns its `.modal-body`, wrapped in `.modal.in` like the real page. */
export function loadFixture(name: string): Element {
  const dom = new JSDOM(`<div class="modal in"><div class="modal-dialog large">${fixtureHtml(name)}</div></div>`);
  return dom.window.document.querySelector(".modal-body")!;
}
