import { enhance, pageInfo } from "../src/main";
import type { UiDeps } from "../src/ui";
import { createDocument, editDocument, emptyDocument } from "./helpers";

const MBID = "d2364f4b-3c9a-4698-af3e-0ec10eb52cf8";
const deps: UiDeps = {
  version: "1.0.0",
  sites: [],
  fetchText: async () => "",
  lookupPeople: async () => ({ artist: "", lyricist: "", composer: "" }),
  hasLink: () => false,
  addLink: async () => false,
};

describe("pageInfo", () => {
  it("reads the edit page", () => {
    expect(pageInfo(editDocument(), `https://musicbrainz.org/work/${MBID}/edit`)).toEqual({ kind: "edit", mbid: MBID, title: "SPINDLE STORY" });
  });

  it("reads the create page and rejects other pages", () => {
    expect(pageInfo(createDocument(), "https://musicbrainz.org/work/create")).toEqual({ kind: "create", mbid: null, title: "" });
    expect(pageInfo(createDocument(), "https://beta.musicbrainz.org/work/create?edit-work.name=X")).toEqual({ kind: "create", mbid: null, title: "" });
    expect(pageInfo(emptyDocument(`https://musicbrainz.org/work/${MBID}`), `https://musicbrainz.org/work/${MBID}`)).toBeNull();
  });
});

describe("enhance", () => {
  it("adds one panel and never a second", () => {
    const doc = editDocument();
    expect(enhance(doc, deps)).toBe("added");
    expect(enhance(doc, deps)).toBe("present");
    expect(doc.querySelectorAll(".mb-lyrics").length).toBe(1);
  });

  it("returns none when the editor is not on the page yet", () => {
    const doc = editDocument();
    doc.querySelector("#external-links-editor")!.remove();
    expect(enhance(doc, deps)).toBe("none");
    expect(enhance(emptyDocument("https://musicbrainz.org/work/create"), deps)).toBe("none");
  });
});
