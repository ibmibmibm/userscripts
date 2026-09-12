import { buildEditNote } from "../src/note";
import { parseJwid, parseMinc } from "../src/parser";
import { jwidDocument, mincDocument } from "./helpers";

describe("buildEditNote", () => {
  it("writes the full note for a J-WID work", () => {
    const info = parseJwid(jwidDocument("jwid-70342415"))!;
    expect(buildEditNote(info, "1.0.0")).toBe(
      [
        "YOUTHFUL (JASRAC 703-4241-5 / ISWC T-102.054.195-9)",
        "",
        "CREDITS",
        "作詞：堀内　孝太",
        "作詞：堀内　孝平",
        "作曲：堀内　孝太",
        "作曲：堀内　孝平",
        "出版者：日本テレビ音楽　株式会社（JASRAC）",
        "",
        "TITLES",
        "正題：ＹＯＵＴＨＦＵＬ ／ YOUTHFUL",
        "副題1：オープニング／ちはやふる（ＮＴＶ系アニメ） ／ チハヤフル ／ CHIHAYAFURU",
        "",
        "PERFORMERS",
        "９９　Ｒａｄｉｏ　Ｓｅｒｖｉｃｅ",
        "",
        "https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=70342415&subSessionID=001&subSession=start",
        "JASRAC / MINC work to MusicBrainz v1.0.0",
      ].join("\n"),
    );
  });

  it("prefixes NexTone credits, prefers trust over society, and dedupes lines", () => {
    const info = parseMinc(mincDocument("minc-25707965-N00913658"))!;
    const note = buildEditNote(info, "1.0.0");
    expect(note.startsWith("ダーリンダンス (JASRAC 257-0796-5 / NexTone N00913658 / ISWC T-302.445.339-8)\n")).toBe(true);
    expect(note).toContain("\nCREDITS\n作詞：かいりきベア（無信託）\n作曲：かいりきベア（無信託）\n出版者：ドワンゴ　第７事業部（部分信託）\n[NexTone] 作詞：かいりきベア\n[NexTone] 出版社：株式会社 ドワンゴ 第七事業部\n[NexTone] 作曲：かいりきベア\n\n");
    expect(note).toContain("\nTITLES\n正題：ダーリンダンス\n\n");
    expect(note).toContain("\nPERFORMERS\n神田　沙也加\nＫｏｔｏｎｅ\nＭｏｎｓｔｅｒＺ　ＭＡＴＥ\n\n");
    expect(note.endsWith("\nhttps://www.minc.or.jp/saku/detail/?jcd=25707965&ncd=N00913658\nJASRAC / MINC work to MusicBrainz v1.0.0")).toBe(true);
  });

  it("omits empty blocks and caps performers at 10", () => {
    const info = parseJwid(jwidDocument("jwid-15233952"))!;
    const note = buildEditNote(info, "1.0.0");
    expect(note.startsWith("THE ALMIGHTY (JASRAC 152-3395-2)\n")).toBe(true);
    expect(note).not.toContain("PERFORMERS");
    expect(note).toContain("副題1：＊ペルソナ４より ／ ペルソナ　４　ヨリ ／ PERUSONA 4 YORI");
    const many = { ...info, artists: Array.from({ length: 12 }, (_, i) => `A${i + 1}`) };
    const capped = buildEditNote(many, "1.0.0");
    expect(capped).toContain("PERFORMERS\nA1\nA2\nA3\nA4\nA5\nA6\nA7\nA8\nA9\nA10\n… (12)\n");
    expect(capped).not.toContain("A11");
  });

  it("replaces dropped blocks with a pointer", () => {
    const info = parseJwid(jwidDocument("jwid-70342415"))!;
    const note = buildEditNote(info, "1.0.0", new Set(["artists", "titles", "credits"]));
    expect(note).toBe(
      [
        "YOUTHFUL (JASRAC 703-4241-5 / ISWC T-102.054.195-9)",
        "",
        "CREDITS omitted, see source page",
        "",
        "TITLES omitted, see source page",
        "",
        "PERFORMERS omitted, see source page",
        "",
        "https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=70342415&subSessionID=001&subSession=start",
        "JASRAC / MINC work to MusicBrainz v1.0.0",
      ].join("\n"),
    );
  });

  it("writes only the title when no identifier exists", () => {
    const info = { ...parseJwid(jwidDocument("jwid-70342415"))!, jasracCode: null, iswc: null };
    expect(buildEditNote(info, "1.0.0").split("\n")[0]).toBe("YOUTHFUL");
  });
});
