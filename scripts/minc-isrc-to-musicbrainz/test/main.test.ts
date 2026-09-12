import { JSDOM } from "jsdom";
import { fixtureHtml } from "./helpers";
import { enhanceOpenModals } from "../src/main";

function page(...fixtures: { name: string; open: boolean }[]): Document {
  const html = fixtures
    .map((f) => `<div class="modal${f.open ? " in" : ""}"><div class="modal-dialog large">${fixtureHtml(f.name)}</div></div>`)
    .join("");
  return new JSDOM(`<body>${html}</body>`).window.document;
}

const deps = { version: "1.0.0", search: async () => [], open: () => {} };

describe("enhanceOpenModals", () => {
  it("enhances only open modals, once", () => {
    const doc = page({ name: "single-cd", open: true }, { name: "cd-bluray", open: false });
    expect(enhanceOpenModals(doc, deps)).toBe(1);
    expect(doc.querySelectorAll(".minc-isrc-mb-ui").length).toBe(1);
    expect(enhanceOpenModals(doc, deps)).toBe(0);
    doc.querySelectorAll(".modal")[1].classList.add("in");
    expect(enhanceOpenModals(doc, deps)).toBe(1);
  });

  it("ignores open modals without a track table", () => {
    const doc = page({ name: "single-cd", open: true });
    doc.querySelector(".table_wrapper")!.remove();
    expect(enhanceOpenModals(doc, deps)).toBe(0);
  });
});
