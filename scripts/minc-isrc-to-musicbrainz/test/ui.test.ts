import { loadFixture, mbHits } from "./helpers";
import { toReleaseHit } from "../src/musicbrainz";
import { enhanceModalBody, type UiDeps } from "../src/ui";
import type { MbReleaseHit } from "../src/types";

const hit = (name: string): MbReleaseHit => mbHits(name, toReleaseHit)[0];

const tick = () => new Promise((r) => setTimeout(r, 0));

function deps(overrides: Partial<UiDeps> = {}) {
  const opened: string[] = [];
  const d: UiDeps = {
    version: "1.0.0",
    search: async () => [],
    open: (url) => opened.push(url),
    ...overrides,
  };
  return { d, opened };
}

describe("enhanceModalBody", () => {
  it("adds the UI once and marks the body", () => {
    const body = loadFixture("single-cd");
    const { d } = deps();
    expect(enhanceModalBody(body, d)).toBe(true);
    expect(body.classList.contains("minc-isrc-mb")).toBe(true);
    expect(body.querySelectorAll(".minc-isrc-mb-ui").length).toBe(1);
    expect(enhanceModalBody(body, d)).toBe(false);
    expect(body.querySelectorAll(".minc-isrc-mb-ui").length).toBe(1);
  });

  it("disables the button when there is no ISRC", () => {
    const body = loadFixture("music-list-empty-pos");
    enhanceModalBody(body, deps().d);
    const btn = body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!;
    expect(btn.disabled).toBe(true);
    expect(body.querySelector(".minc-isrc-mb-status")!.textContent).toBe("No ISRC in this product");
  });

  it("returns false and adds nothing when the table is missing", () => {
    const body = loadFixture("single-cd");
    body.querySelector(".table_wrapper")!.remove();
    expect(enhanceModalBody(body, deps().d)).toBe(false);
    expect(body.querySelector(".minc-isrc-mb-ui")).toBeNull();
  });

  it("opens MagicISRC with the single hit", async () => {
    const body = loadFixture("single-cd");
    const { d, opened } = deps({ search: async () => [hit("barcode-single-cd")] });
    enhanceModalBody(body, d);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    expect(body.querySelector(".minc-isrc-mb-status")!.textContent).toContain("YOUTHFUL");
    const rows = body.querySelectorAll(".minc-isrc-mb-mapping tbody tr");
    expect(rows.length).toBe(1);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(opened).toHaveLength(1);
    const u = new URL(opened[0]);
    expect(u.searchParams.get("musicbrainzid")).toBe(hit("barcode-single-cd").mbid);
    expect(u.searchParams.get("isrc1-1")).toBe("JPVP01106901");
    expect(u.searchParams.get("isrc1-3")).toBe("JPVP01106903");
    expect(u.searchParams.get("edit-note")).toContain("VPCC-82301");
  });

  it("shows a picker for several hits and honors the choice", async () => {
    const body = loadFixture("two-cd-duplicate");
    const hits = mbHits("catno-multi", toReleaseHit);
    const { d, opened } = deps({ search: async () => hits });
    enhanceModalBody(body, d);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    const useButtons = body.querySelectorAll<HTMLButtonElement>(".minc-isrc-mb-picker .minc-isrc-mb-use");
    expect(useButtons.length).toBe(2);
    useButtons[1].click();
    expect(body.querySelector(".minc-isrc-mb-warnings")!.textContent).toContain("JPTF02202404");
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(new URL(opened[0]).searchParams.get("musicbrainzid")).toBe(hits[1].mbid);
  });

  it("excludes the video disc by default and includes it when checked", async () => {
    const body = loadFixture("cd-bluray");
    const { d, opened } = deps({ search: async () => [hit("barcode-cd-bluray")] });
    enhanceModalBody(body, d);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    const boxes = body.querySelectorAll<HTMLInputElement>(".minc-isrc-mb-mapping input[type=checkbox]");
    expect(Array.from(boxes).map((b) => b.checked)).toEqual([true, false]);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(new URL(opened[0]).searchParams.has("isrc2-1")).toBe(false);
    boxes[1].checked = true;
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(new URL(opened[1]).searchParams.get("isrc2-1")).toBe("JPU981201583");
  });

  it("lets the user change the medium", async () => {
    const body = loadFixture("cd-bluray");
    const { d, opened } = deps({ search: async () => [hit("barcode-cd-bluray")] });
    enhanceModalBody(body, d);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    const selects = body.querySelectorAll<HTMLSelectElement>(".minc-isrc-mb-mapping select");
    expect(selects.length).toBe(2);
    selects[0].value = "2";
    selects[0].dispatchEvent(new (body.ownerDocument.defaultView as Window & typeof globalThis).Event("change"));
    expect(body.querySelector(".minc-isrc-mb-warnings")!.textContent).toContain("track count differs");
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(new URL(opened[0]).searchParams.get("isrc2-1")).toBe("JPU901601692");
  });

  it("offers the no-MBID path on zero hits and on failure", async () => {
    const body = loadFixture("single-cd");
    const { d, opened } = deps({ search: async () => [] });
    enhanceModalBody(body, d);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    expect(body.querySelector(".minc-isrc-mb-status")!.textContent).toBe("No MusicBrainz release found");
    expect(body.querySelector<HTMLAnchorElement>(".minc-isrc-mb-picker a")!.href).toContain("musicbrainz.org/search");
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-nombid")!.click();
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(new URL(opened[0]).searchParams.has("musicbrainzid")).toBe(false);
    expect(new URL(opened[0]).searchParams.get("isrc1-2")).toBe("JPVP01106902");

    const body2 = loadFixture("single-cd");
    const d2 = deps({ search: async () => { throw new Error("HTTP 503"); } });
    enhanceModalBody(body2, d2.d);
    body2.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    expect(body2.querySelector(".minc-isrc-mb-status")!.textContent).toBe("MusicBrainz lookup failed (HTTP 503). Try again.");
    expect(body2.querySelector(".minc-isrc-mb-nombid")).not.toBeNull();
  });
});
