import { loadFixture, mbHits } from "./helpers";
import { parseProductModal } from "../src/parser";
import { analyze } from "../src/analyze";
import { toReleaseHit } from "../src/musicbrainz";
import { defaultMapping, mappingMarks, isVideoFormat } from "../src/mapping";

const hit = (name: string) => mbHits(name, toReleaseHit)[0];

describe("isVideoFormat", () => {
  it("detects video formats", () => {
    expect(isVideoFormat("DVD-Video")).toBe(true);
    expect(isVideoFormat("Blu-ray")).toBe(true);
    expect(isVideoFormat("CD")).toBe(false);
    expect(isVideoFormat(null)).toBe(false);
  });
});

describe("defaultMapping", () => {
  it("includes audio discs, excludes video discs, and maps by position", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    const m = defaultMapping(r, analyze(r), hit("barcode-cd-bluray"));
    expect(m).toEqual([
      { disc: 1, included: true, medium: 1 },
      { disc: 2, included: false, medium: 2 },
    ]);
  });

  it("omits discs with no ISRC", () => {
    const r = parseProductModal(loadFixture("two-cd-dvd"))!;
    const m = defaultMapping(r, analyze(r), hit("barcode-two-cd-dvd"));
    expect(m.map((x) => x.disc)).toEqual([1, 2]);
  });

  it("uses the disc position without a MusicBrainz release", () => {
    const r = parseProductModal(loadFixture("thirteen-discs"))!;
    const m = defaultMapping(r, analyze(r), null);
    expect(m).toHaveLength(12);
    expect(m[11]).toEqual({ disc: 12, included: true, medium: 12 });
  });

  it("clamps to the last medium when MusicBrainz has fewer media", () => {
    const r = parseProductModal(loadFixture("two-cd-duplicate"))!;
    const single = hit("barcode-single-cd");
    const m = defaultMapping(r, analyze(r), single);
    expect(m.map((x) => x.medium)).toEqual([1, 1]);
  });
});

describe("mappingMarks", () => {
  it("is empty when everything lines up", () => {
    const r = parseProductModal(loadFixture("thirteen-discs"))!;
    const h = hit("barcode-thirteen-discs");
    expect(mappingMarks(r, defaultMapping(r, analyze(r), h), h)).toEqual([]);
  });

  it("flags a track count difference and a kind difference", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    const h = hit("barcode-cd-bluray");
    const m = [
      { disc: 1, included: true, medium: 2 },
      { disc: 2, included: true, medium: 1 },
    ];
    const marks = mappingMarks(r, m, h);
    expect(marks).toEqual([
      "Disc 1 (CD12cm, 13 tracks) is mapped to medium 2 (Blu-ray, 10 tracks): track count differs, kind differs",
      "Disc 2 (Blu-rayDisc Video, 10 tracks) is mapped to medium 1 (CD, 13 tracks): track count differs, kind differs",
    ]);
  });

  it("flags fewer media on MusicBrainz", () => {
    const r = parseProductModal(loadFixture("two-cd-duplicate"))!;
    const h = hit("barcode-single-cd");
    const marks = mappingMarks(r, defaultMapping(r, analyze(r), h), h);
    expect(marks[0]).toBe("MusicBrainz release has 1 medium but minc has 2 discs with ISRCs");
  });

  it("returns nothing without a MusicBrainz release", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    expect(mappingMarks(r, defaultMapping(r, analyze(r), null), null)).toEqual([]);
  });
});
