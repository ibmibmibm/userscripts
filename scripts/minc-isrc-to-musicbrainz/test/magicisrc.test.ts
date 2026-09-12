import { loadFixture } from "./helpers";
import { parseProductModal } from "../src/parser";
import { analyze } from "../src/analyze";
import { defaultMapping } from "../src/mapping";
import { collectEntries, buildEditNote, buildMagicIsrcUrl, mincProductUrl } from "../src/magicisrc";

describe("mincProductUrl", () => {
  it("encodes the catalog number", () => {
    expect(mincProductUrl("SECL-2001/2")).toBe("https://www.minc.or.jp/product/list/?dn=SECL-2001%2F2&type=search-form-diskno");
  });
});

describe("collectEntries", () => {
  it("uses only included discs and skips null ISRCs", () => {
    const r = parseProductModal(loadFixture("two-cd-dvd"))!;
    const mapping = defaultMapping(r, analyze(r), null);
    const entries = collectEntries(r, mapping);
    expect(entries).toHaveLength(27);
    expect(entries[0]).toEqual({ medium: 1, track: 1, isrc: "JPTF02202401" });
    expect(entries[26]).toEqual({ medium: 2, track: 13, isrc: "JPTF02202513" });
  });

  it("follows the chosen medium and the include flag", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    const entries = collectEntries(r, [
      { disc: 1, included: false, medium: 1 },
      { disc: 2, included: true, medium: 5 },
    ]);
    expect(entries).toHaveLength(10);
    expect(entries[0]).toEqual({ medium: 5, track: 1, isrc: "JPU981201583" });
  });
});

describe("buildEditNote", () => {
  it("names the catalog number, POS, source link, and version", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    expect(buildEditNote(r, "1.0.0")).toBe(
      "ISRCs from MINC (音楽権利情報検索ナビ) for 品番 SECL-2001/2, POS 4547557046427\n" +
        "https://www.minc.or.jp/product/list/?dn=SECL-2001%2F2&type=search-form-diskno\n" +
        "via MINC ISRC to MusicBrainz v1.0.0",
    );
  });
  it("writes none when POS is empty", () => {
    const r = parseProductModal(loadFixture("music-list-empty-pos"))!;
    expect(buildEditNote(r, "1.0.0")).toContain("POS none\n");
  });
});

describe("buildMagicIsrcUrl", () => {
  it("orders parameters as musicbrainzid, isrcM-T, edit-note", () => {
    const url = buildMagicIsrcUrl({
      mbid: "caf79703-2512-439d-b515-81c9c0f6542f",
      editNote: "note & more",
      entries: [
        { medium: 1, track: 1, isrc: "JPKI00311412" },
        { medium: 2, track: 10, isrc: "JPKI00311439" },
      ],
    });
    expect(url).toBe(
      "https://magicisrc.kepstin.ca/?musicbrainzid=caf79703-2512-439d-b515-81c9c0f6542f" +
        "&isrc1-1=JPKI00311412&isrc2-10=JPKI00311439&edit-note=note+%26+more",
    );
  });

  it("omits musicbrainzid when there is no MBID", () => {
    const url = buildMagicIsrcUrl({ mbid: null, editNote: "n", entries: [{ medium: 1, track: 1, isrc: "JPVP01106901" }] });
    expect(url).toBe("https://magicisrc.kepstin.ca/?isrc1-1=JPVP01106901&edit-note=n");
  });
});
