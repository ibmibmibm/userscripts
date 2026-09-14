import { MbNotFound, toMbWork, toWorkHit } from "../src/musicbrainz";
import { parseJwid, parseMinc } from "../src/parser";
import { enhancePage, MARKER, type UiDeps } from "../src/ui";
import type { MbWork, WorkHit } from "../src/types";
import { jwidDocument, mbJson, mincDocument } from "./helpers";

const LEMON = "d69ecd96-bb2c-461f-9762-29102d2b50a1";
const lemonHit = (): WorkHit => toWorkHit((mbJson("mb-work-search-iswc") as { works: unknown[] }).works[0]);
const lemonWork = (): MbWork => toMbWork(mbJson("mb-work-lookup"));
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

function deps(over: Partial<UiDeps> = {}) {
  const opened: string[] = [];
  const d: UiDeps = {
    version: "1.0.0",
    searchByIswc: async () => [],
    searchByTitle: async () => [],
    lookupWork: async () => lemonWork(),
    open: (url) => {
      opened.push(url);
      return {} as Window;
    },
    ...over,
  };
  return { d, opened };
}

const q = <T extends Element>(root: ParentNode, cls: string) => root.querySelector<T>(`.jasrac-minc-mb-${cls}`)!;

describe("enhancePage", () => {
  it("places the panel after .baseinfo on J-WID and before #jasrac-area on minc", () => {
    const jw = jwidDocument("jwid-70342415");
    const panel = enhancePage(jw, parseJwid(jw)!, deps().d);
    expect(panel.classList.contains(MARKER)).toBe(true);
    expect(jw.querySelector(".baseinfo")!.nextElementSibling).toBe(panel);
    const mc = mincDocument("minc-70342415");
    const panel2 = enhancePage(mc, parseMinc(mc)!, deps().d);
    expect(mc.querySelector("#jasrac-area")!.previousElementSibling).toBe(panel2);
  });

  it("shows the summary, mapped relationships, and skipped credits", () => {
    const doc = jwidDocument("jwid-70342415");
    const info = parseJwid(doc)!;
    info.credits.push({ source: "JASRAC", name: "誰か", role: "演奏", trust: null, society: null, note: null });
    const panel = enhancePage(doc, info, deps().d);
    expect(q(panel, "summary").textContent).toContain("YOUTHFUL");
    expect(q(panel, "summary").textContent).toContain("703-4241-5");
    expect(q(panel, "summary").textContent).toContain("T-102.054.195-9");
    expect(q(panel, "summary").textContent).toContain("song");
    const rows = Array.from(q(panel, "rels").querySelectorAll("tbody tr")).map((tr) => tr.textContent);
    expect(rows.length).toBe(5);
    expect(rows[0]).toContain("lyricist");
    expect(rows[0]).toContain("堀内孝太");
    expect(rows[4]).toContain("publisher");
    expect(rows[4]).toContain("日本テレビ音楽");
    expect(q(panel, "skipped").textContent).toContain("誰か");
    expect(q(panel, "skipped").textContent).toContain("not mapped");
  });

  it("does not search on creation, then searches by ISWC on click, preselects a single hit, and enables Update", async () => {
    const doc = jwidDocument("jwid-70342415");
    const calls: string[] = [];
    const { d, opened } = deps({
      searchByIswc: async (iswc) => {
        calls.push(iswc);
        return [lemonHit()];
      },
    });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    await settle();
    expect(calls).toEqual([]);
    expect(q(panel, "status").textContent).toBe("");
    q<HTMLButtonElement>(panel, "search-iswc").click();
    expect(q(panel, "status").textContent).toBe("Searching MusicBrainz by ISWC…");
    await settle();
    expect(calls).toEqual(["T-102.054.195-9"]);
    const radio = q<HTMLInputElement>(panel, "picker").querySelector<HTMLInputElement>("input[type=radio]")!;
    expect(radio.checked).toBe(true);
    expect(radio.value).toBe(LEMON);
    expect(q(panel, "diff").textContent).toContain("Will add:");
    expect(q(panel, "diff").textContent).toContain("T-102.054.195-9");
    expect(q(panel, "diff").textContent).toContain("703-4241-5");
    const update = q<HTMLButtonElement>(panel, "update");
    expect(update.disabled).toBe(false);
    expect(update.textContent).toBe('Update "Lemon"');
    update.click();
    expect(opened.length).toBe(1);
    expect(opened[0].startsWith(`https://musicbrainz.org/work/${LEMON}/edit?`)).toBe(true);
    expect(opened[0]).toContain("edit-work.iswcs.1=T-102.054.195-9");
  });

  it("reports no ISWC hit, clears a pasted target on click, and hides the button when the work has no ISWC", async () => {
    const doc = jwidDocument("jwid-70342415");
    const panel = enhancePage(doc, parseJwid(doc)!, deps().d);
    const ref = q<HTMLInputElement>(panel, "ref");
    ref.value = LEMON;
    ref.dispatchEvent(new doc.defaultView!.Event("input"));
    await settle();
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(false);
    q<HTMLButtonElement>(panel, "search-iswc").click();
    await settle();
    expect(ref.value).toBe("");
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(true);
    expect(q(panel, "status").textContent).toBe("No work with this ISWC");
    const doc2 = jwidDocument("jwid-15233952");
    const panel2 = enhancePage(doc2, parseJwid(doc2)!, deps().d);
    expect(panel2.querySelector(".jasrac-minc-mb-search-iswc")).toBeNull();
    expect(q(panel2, "status").textContent).toBe("");
  });

  it("searches by title on click without preselecting, and ignores a second click while running", async () => {
    const doc = jwidDocument("jwid-15233952");
    let resolve: (h: WorkHit[]) => void = () => {};
    let calls = 0;
    const { d } = deps({
      searchByTitle: (title) => {
        calls++;
        expect(title).toBe("THE ALMIGHTY");
        return new Promise<WorkHit[]>((r) => (resolve = r));
      },
    });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    q<HTMLButtonElement>(panel, "search").click();
    q<HTMLButtonElement>(panel, "search").click();
    expect(calls).toBe(1);
    expect(q(panel, "status").textContent).toBe("Searching MusicBrainz by title…");
    resolve([lemonHit(), { ...lemonHit(), mbid: "22222222-2222-4222-8222-222222222222", title: "Lemon (2)" }]);
    await settle();
    const radios = q(panel, "picker").querySelectorAll<HTMLInputElement>("input[type=radio]");
    expect(radios.length).toBe(2);
    expect(Array.from(radios).some((r) => r.checked)).toBe(false);
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(true);
    expect(q(panel, "picker").textContent).toContain("Lemon (2)");
  });

  it("clears a selected target when a title search starts", async () => {
    const doc = jwidDocument("jwid-70342415");
    const { d } = deps({ searchByIswc: async () => [lemonHit()], searchByTitle: async () => [lemonHit()] });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    q<HTMLButtonElement>(panel, "search-iswc").click();
    await settle();
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(false);
    q<HTMLButtonElement>(panel, "search").click();
    await settle();
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(true);
    const radio = q(panel, "picker").querySelector<HTMLInputElement>("input[type=radio]")!;
    expect(radio.checked).toBe(false);
  });

  it("accepts a pasted work URL, rejects other text, and clears the picker selection", async () => {
    const doc = jwidDocument("jwid-70342415");
    const looked: string[] = [];
    const { d } = deps({
      searchByIswc: async () => [lemonHit()],
      lookupWork: async (mbid) => {
        looked.push(mbid);
        return lemonWork();
      },
    });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    q<HTMLButtonElement>(panel, "search-iswc").click();
    await settle();
    const input = q<HTMLInputElement>(panel, "ref");
    input.value = "not a work";
    input.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event("input"));
    await settle();
    expect(q(panel, "status").textContent).toBe("Not a MusicBrainz work URL or MBID");
    input.value = "https://musicbrainz.org/work/33333333-3333-4333-8333-333333333333";
    input.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event("input"));
    await settle();
    expect(looked).toEqual([LEMON, "33333333-3333-4333-8333-333333333333"]);
    const radio = q(panel, "picker").querySelector<HTMLInputElement>("input[type=radio]")!;
    expect(radio.checked).toBe(false);
  });

  it("shows Nothing to add and disables Update when the diff is empty", async () => {
    const doc = jwidDocument("jwid-70342415");
    const info = parseJwid(doc)!;
    info.iswc = "T-924.390.287-6";
    info.jasracCode = "720-5540-5";
    info.credits = [];
    const { d } = deps({ searchByIswc: async () => [lemonHit()] });
    const panel = enhancePage(doc, info, d);
    q<HTMLButtonElement>(panel, "search-iswc").click();
    await settle();
    expect(q(panel, "diff").textContent).toBe("Nothing to add");
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(true);
  });

  it("shows Work not found on 404 and a Retry button on other errors", async () => {
    const doc = jwidDocument("jwid-70342415");
    let fail: Error = new MbNotFound();
    const { d } = deps({
      searchByIswc: async () => [lemonHit()],
      lookupWork: async () => {
        throw fail;
      },
    });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    q<HTMLButtonElement>(panel, "search-iswc").click();
    await settle();
    expect(q(panel, "status").textContent).toBe("Work not found");
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(true);
    fail = new Error("MusicBrainz responded with HTTP 503");
    const input = q<HTMLInputElement>(panel, "ref");
    input.value = LEMON;
    input.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event("input"));
    await settle();
    expect(q(panel, "status").textContent).toContain("MusicBrainz responded with HTTP 503");
    const retry = q<HTMLButtonElement>(panel, "retry");
    fail = new MbNotFound();
    retry.click();
    await settle();
    expect(q(panel, "status").textContent).toBe("Work not found");
  });

  it("discards a lookup result that arrives after the target changed", async () => {
    const doc = jwidDocument("jwid-70342415");
    const pending: ((w: MbWork) => void)[] = [];
    const { d } = deps({
      searchByIswc: async () => [lemonHit()],
      lookupWork: () => new Promise<MbWork>((r) => pending.push(r)),
    });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    q<HTMLButtonElement>(panel, "search-iswc").click();
    await settle();
    const input = q<HTMLInputElement>(panel, "ref");
    input.value = "33333333-3333-4333-8333-333333333333";
    input.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event("input"));
    await settle();
    expect(pending.length).toBe(2);
    pending[0]({ ...lemonWork(), title: "STALE" });
    await settle();
    expect(q(panel, "status").textContent).toBe("Loading work…");
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(true);
    pending[1]({ ...lemonWork(), title: "FRESH" });
    await settle();
    expect(q<HTMLButtonElement>(panel, "update").textContent).toBe('Update "FRESH"');
  });

  it("creates with a seeded URL and shows a link when the popup is blocked", () => {
    const doc = mincDocument("minc-25707965-N00913658");
    const { d, opened } = deps({ open: () => null });
    const panel = enhancePage(doc, parseMinc(doc)!, d);
    q<HTMLButtonElement>(panel, "create").click();
    expect(opened.length).toBe(0);
    const link = q(panel, "notice").querySelector("a")!;
    expect(link.textContent).toBe("Popup blocked, open this link");
    expect(link.href.startsWith("https://musicbrainz.org/work/create?")).toBe(true);
    expect(link.href).toContain("edit-work.attributes.1.value=N00913658");
    expect(link.target).toBe("_blank");
  });

  it("tells when the edit note was shortened", () => {
    const doc = jwidDocument("jwid-70342415");
    const info = parseJwid(doc)!;
    info.artists = Array.from({ length: 10 }, (_, i) => `名前${i}`.repeat(300));
    const { d, opened } = deps();
    const panel = enhancePage(doc, info, d);
    q<HTMLButtonElement>(panel, "create").click();
    expect(opened[0].length).toBeLessThanOrEqual(8000);
    expect(q(panel, "notice").textContent).toBe("Edit note shortened: artists");
  });
});
