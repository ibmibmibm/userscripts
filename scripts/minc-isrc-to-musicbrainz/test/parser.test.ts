import { loadFixture } from "./helpers";
import { parseProductModal, isValidIsrc } from "../src/parser";

describe("isValidIsrc", () => {
  it("accepts a normal ISRC", () => expect(isValidIsrc("JPVP01106901")).toBe(true));
  it("rejects dash, blank, and short codes", () => {
    expect(isValidIsrc("-")).toBe(false);
    expect(isValidIsrc("")).toBe(false);
    expect(isValidIsrc("JPVP0110690")).toBe(false);
  });
});

describe("parseProductModal", () => {
  it("parses a single CD", () => {
    const r = parseProductModal(loadFixture("single-cd"))!;
    expect(r.title).toBe("YOUTHFUL");
    expect(r.catalogNumber).toBe("VPCC-82301");
    expect(r.barcode).toBe("4988021823012");
    expect(r.discCount).toBe(1);
    expect(r.trackCount).toBe(3);
    expect(r.discs).toHaveLength(1);
    expect(r.discs[0]).toMatchObject({ position: 1, format: "CD", kind: "audio", catalogNumber: null });
    expect(r.discs[0].tracks).toEqual([
      { position: 1, title: "YOUTHFUL", isrc: "JPVP01106901" },
      { position: 2, title: "YOUTHFUL ～from Studio Yamato～", isrc: "JPVP01106902" },
      { position: 3, title: "Same love, Different heart", isrc: "JPVP01106903" },
    ]);
  });

  it("parses 2CD+DVD with formats, catalog numbers, and a null ISRC on the DVD", () => {
    const r = parseProductModal(loadFixture("two-cd-dvd"))!;
    expect(r.catalogNumber).toBe("TFCC-86851/3");
    expect(r.barcode).toBe("4988061868516");
    expect(r.discCount).toBe(3);
    expect(r.trackCount).toBe(27);
    expect(r.discs.map((d) => [d.position, d.format, d.kind, d.catalogNumber, d.tracks.length])).toEqual([
      [1, "CD12cm", "audio", "TFCC 86851", 14],
      [2, "CD12cm", "audio", "TFCC 86852", 13],
      [3, "DVD12cm", "video", "TFCC 86853", 1],
    ]);
    expect(r.discs[2].tracks[0].isrc).toBeNull();
    expect(r.discs[2].tracks[0].title).toBe("『Mr.Children -THEN-』 TALK ＆ DOCUMENTARY");
  });

  it("parses a Blu-ray disc with video ISRCs", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    expect(r.discs[1].format).toBe("Blu-rayDisc Video");
    expect(r.discs[1].kind).toBe("video");
    expect(r.discs[1].tracks[0].isrc).toBe("JPU981201583");
    expect(r.discs[1].tracks).toHaveLength(10);
  });

  it("parses thirteen discs including collapsed tables", () => {
    const r = parseProductModal(loadFixture("thirteen-discs"))!;
    expect(r.discs).toHaveLength(13);
    expect(r.discs.reduce((n, d) => n + d.tracks.length, 0)).toBe(134);
    expect(r.discs[12].kind).toBe("video");
    expect(r.discs[12].tracks.every((t) => t.isrc === null)).toBe(true);
    expect(r.discs[3].tracks.map((t) => t.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("handles an empty POS and all-dash ISRCs on the music list modal", () => {
    const r = parseProductModal(loadFixture("music-list-empty-pos"))!;
    expect(r.title).toBe("TODAY");
    expect(r.catalogNumber).toBe("RRCX 21017");
    expect(r.barcode).toBeNull();
    expect(r.discs[0].tracks).toHaveLength(11);
    expect(r.discs[0].tracks.every((t) => t.isrc === null)).toBe(true);
  });

  it("returns null when the track table is missing", () => {
    const body = loadFixture("single-cd");
    body.querySelector(".table_wrapper")!.remove();
    expect(parseProductModal(body)).toBeNull();
  });

  it("returns null when detail_data is missing", () => {
    const body = loadFixture("single-cd");
    body.querySelector(".detail_data")!.remove();
    expect(parseProductModal(body)).toBeNull();
  });
});
