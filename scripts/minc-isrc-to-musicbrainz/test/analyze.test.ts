import { loadFixture } from "./helpers";
import { parseProductModal } from "../src/parser";
import { analyze } from "../src/analyze";

describe("analyze", () => {
  it("finds the duplicate ISRC in the 2CD edition", () => {
    const a = analyze(parseProductModal(loadFixture("two-cd-duplicate"))!);
    expect(a.duplicateIsrcs).toEqual([{ isrc: "JPTF02202404", where: ["Disc 1 track 4", "Disc 1 track 5"] }]);
    expect(a.tracksWithoutIsrc).toEqual([]);
    expect(a.submittableDiscs).toEqual([1, 2]);
  });

  it("lists tracks without ISRC and skips discs with none", () => {
    const a = analyze(parseProductModal(loadFixture("two-cd-dvd"))!);
    expect(a.duplicateIsrcs).toEqual([]);
    expect(a.tracksWithoutIsrc).toEqual([{ disc: 3, track: 1, title: "『Mr.Children -THEN-』 TALK ＆ DOCUMENTARY" }]);
    expect(a.submittableDiscs).toEqual([1, 2]);
  });

  it("keeps video discs that have ISRCs", () => {
    const a = analyze(parseProductModal(loadFixture("cd-bluray"))!);
    expect(a.submittableDiscs).toEqual([1, 2]);
  });

  it("returns no submittable disc when every ISRC is missing", () => {
    const a = analyze(parseProductModal(loadFixture("music-list-empty-pos"))!);
    expect(a.submittableDiscs).toEqual([]);
    expect(a.tracksWithoutIsrc).toHaveLength(11);
  });
});
