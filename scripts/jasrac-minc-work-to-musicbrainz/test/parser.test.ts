import { JSDOM } from "jsdom";
import { parseJwid, parseMinc } from "../src/parser";
import { emptyDocument, jwidDocument, mincDocument } from "./helpers";

describe("parseJwid", () => {
  it("parses a vocal work with lyricists, composers, a publisher, titles, and an artist", () => {
    const info = parseJwid(jwidDocument("jwid-70342415"))!;
    expect(info.site).toBe("jwid");
    expect(info.sourceUrl).toBe("https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=70342415&subSessionID=001&subSession=start");
    expect(info.title).toBe("ＹＯＵＴＨＦＵＬ");
    expect(info.jasracCode).toBe("703-4241-5");
    expect(info.nextoneCode).toBeNull();
    expect(info.iswc).toBe("T-102.054.195-9");
    expect(info.domestic).toBe(true);
    expect(info.credits).toEqual([
      { source: "JASRAC", name: "堀内　孝太", role: "作詞", trust: null, society: null, note: null },
      { source: "JASRAC", name: "堀内　孝平", role: "作詞", trust: null, society: null, note: null },
      { source: "JASRAC", name: "堀内　孝太", role: "作曲", trust: null, society: null, note: null },
      { source: "JASRAC", name: "堀内　孝平", role: "作曲", trust: null, society: null, note: null },
      { source: "JASRAC", name: "日本テレビ音楽　株式会社", role: "出版者", trust: null, society: "JASRAC", note: null },
    ]);
    expect(info.titles).toEqual([
      { kind: "正題", title: "ＹＯＵＴＨＦＵＬ", kana: null, romaji: "YOUTHFUL", searchName: false },
      { kind: "副題1", title: "オープニング／ちはやふる（ＮＴＶ系アニメ）", kana: "チハヤフル", romaji: "CHIHAYAFURU", searchName: false },
    ]);
    expect(info.artists).toEqual(["９９　Ｒａｄｉｏ　Ｓｅｒｖｉｃｅ"]);
  });

  it("parses an instrumental work with 契約 and 所属団体 and no artist section", () => {
    const info = parseJwid(jwidDocument("jwid-70417750"))!;
    expect(info.title).toBe("かるた日和");
    expect(info.jasracCode).toBe("704-1775-0");
    expect(info.iswc).toBe("T-102.072.605-8");
    expect(info.credits).toEqual([
      { source: "JASRAC", name: "山下　康介", role: "作曲", trust: null, society: "JASRAC", note: null },
      { source: "JASRAC", name: "日本テレビ音楽　株式会社", role: "出版者", trust: "曲", society: "JASRAC", note: null },
    ]);
    expect(info.titles[0]).toEqual({ kind: "正題", title: "かるた日和", kana: "カルタ　ビヨリ", romaji: "KARUTA BIYORI", searchName: false });
    expect(info.titles[1]).toEqual({ kind: "副題1", title: "ちはやふるより（ＮＴＶ系アニメ）", kana: "チハヤフル　ヨリ", romaji: "CHIHAYAFURU YORI", searchName: false });
    expect(info.artists).toEqual([]);
  });

  it("parses a work without ISWC, with a 特記 note and a search-name subtitle", () => {
    const info = parseJwid(jwidDocument("jwid-15233952"))!;
    expect(info.title).toBe("ＡＬＭＩＧＨＴＹ　　ＴＨＥ");
    expect(info.jasracCode).toBe("152-3395-2");
    expect(info.iswc).toBeNull();
    expect(info.credits).toEqual([
      {
        source: "JASRAC",
        name: "目黒　将司",
        role: "作曲",
        trust: null,
        society: null,
        note: "この著作者/出版者は、この利用分野の著作権をJASRACに委託していません。",
      },
    ]);
    expect(info.titles).toEqual([
      { kind: "正題", title: "ＡＬＭＩＧＨＴＹ　　ＴＨＥ", kana: null, romaji: "ALMIGHTY  THE", searchName: false },
      { kind: "副題1", title: "＊ペルソナ４より", kana: "ペルソナ　４　ヨリ", romaji: "PERUSONA 4 YORI", searchName: true },
    ]);
    expect(info.artists).toEqual([]);
  });

  it("parses three artists and two subtitles", () => {
    const info = parseJwid(jwidDocument("jwid-20356293"))!;
    expect(info.title).toBe("ＤＡＺＺＬＩＮＧ　ＳＭＩＬＥ");
    expect(info.credits.map((c) => [c.name, c.role, c.society])).toEqual([
      ["小林　鉄兵", "作詞", null],
      ["目黒　将司", "作曲", null],
      ["ソニー・ミュージックパブリッシング", "出版者", "JASRAC"],
    ]);
    expect(info.titles.map((t) => [t.kind, t.title, t.searchName])).toEqual([
      ["正題", "ＤＡＺＺＬＩＮＧ　ＳＭＩＬＥ", false],
      ["副題1", "エンディング／ペルソナ４ザ・ゴールデン（アニメ）", false],
      ["副題2", "＊ＤＡＺＺＬＩＮＧ　ＳＭＩＬＥ－ＳＰＥＣＩＡＬ　ＭＩＸ－", true],
    ]);
    expect(info.artists).toEqual(["平田　志穂子", "℃－ＵＴＥ", "花澤　香菜"]);
  });

  it("returns null without .baseinfo--name", () => {
    expect(parseJwid(emptyDocument())).toBeNull();
  });

  it("falls back to the first content-block credit table when #tab-def is absent", () => {
    const doc = jwidDocument("jwid-70342415");
    doc.querySelector("#tab-def")!.remove();
    const info = parseJwid(doc)!;
    expect(info.credits.length).toBe(5);
    expect(info.credits[0].name).toBe("堀内　孝太");
  });

  it("gives null codes for malformed values and keeps the page URL as source", () => {
    const doc = new JSDOM(
      `<div class="baseinfo"><div class="baseinfo--code"><strong>bad</strong></div><div class="baseinfo--iswc"><strong>T-1</strong></div><div class="baseinfo--name"> X </div></div>`,
      { url: "https://www2.jasrac.or.jp/eJwid/main?trxID=F20101" },
    ).window.document;
    const info = parseJwid(doc)!;
    expect(info.title).toBe("X");
    expect(info.jasracCode).toBeNull();
    expect(info.iswc).toBeNull();
    expect(info.domestic).toBeNull();
    expect(info.sourceUrl).toBe("https://www2.jasrac.or.jp/eJwid/main?trxID=F20101");
    expect(info.credits).toEqual([]);
    expect(info.titles).toEqual([]);
  });
});

describe("parseMinc", () => {
  it("parses the JASRAC area and ignores an empty NexTone area", () => {
    const info = parseMinc(mincDocument("minc-70342415"))!;
    expect(info.site).toBe("minc");
    expect(info.sourceUrl).toBe("https://www.minc.or.jp/saku/detail/?jcd=70342415&ncd=");
    expect(info.title).toBe("ＹＯＵＴＨＦＵＬ");
    expect(info.jasracCode).toBe("703-4241-5");
    expect(info.nextoneCode).toBeNull();
    expect(info.iswc).toBe("T-102.054.195-9");
    expect(info.domestic).toBeNull();
    expect(info.titles).toEqual([
      { kind: "正題", title: "ＹＯＵＴＨＦＵＬ", kana: null, romaji: null, searchName: false },
      { kind: "副題", title: "オープニング／ちはやふる（ＮＴＶ系アニメ）", kana: null, romaji: null, searchName: false },
    ]);
    expect(info.artists).toEqual(["９９　Ｒａｄｉｏ　Ｓｅｒｖｉｃｅ"]);
    expect(info.credits).toEqual([
      { source: "JASRAC", name: "堀内　孝太", role: "作詞", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "堀内　孝平", role: "作詞", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "堀内　孝太", role: "作曲", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "堀内　孝平", role: "作曲", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "日本テレビ音楽　株式会社", role: "出版者", trust: "JASRAC", society: null, note: null },
    ]);
  });

  it("parses both areas and pairs NexTone names with roles", () => {
    const info = parseMinc(mincDocument("minc-25707965-N00913658"))!;
    expect(info.sourceUrl).toBe("https://www.minc.or.jp/saku/detail/?jcd=25707965&ncd=N00913658");
    expect(info.title).toBe("ダーリンダンス");
    expect(info.jasracCode).toBe("257-0796-5");
    expect(info.nextoneCode).toBe("N00913658");
    expect(info.iswc).toBe("T-302.445.339-8");
    expect(info.titles).toEqual([{ kind: "正題", title: "ダーリンダンス", kana: null, romaji: null, searchName: false }]);
    expect(info.artists).toEqual(["神田　沙也加", "Ｋｏｔｏｎｅ", "ＭｏｎｓｔｅｒＺ　ＭＡＴＥ"]);
    expect(info.credits).toEqual([
      { source: "JASRAC", name: "かいりきベア", role: "作詞", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "かいりきベア", role: "作曲", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "ドワンゴ　第７事業部", role: "出版者", trust: "部分信託", society: null, note: null },
      { source: "NexTone", name: "かいりきベア", role: "作詞", trust: null, society: null, note: null },
      { source: "NexTone", name: "株式会社 ドワンゴ 第七事業部", role: "出版社", trust: null, society: null, note: null },
      { source: "NexTone", name: "かいりきベア", role: "作曲", trust: null, society: null, note: null },
      { source: "NexTone", name: "株式会社 ドワンゴ 第七事業部", role: "出版社", trust: null, society: null, note: null },
    ]);
  });

  it("gives extra NexTone names the role 不明 and drops extra roles", () => {
    const doc = mincDocument("minc-25707965-N00913658");
    const tables = doc.querySelectorAll("#nextone-area table");
    tables[1].querySelectorAll("td")[0].innerHTML = "A / B / C";
    tables[1].querySelectorAll("td")[1].textContent = "作詞 / 出版社";
    tables[2].querySelectorAll("td")[0].innerHTML = "D";
    tables[2].querySelectorAll("td")[1].textContent = "作曲 / 出版社 / 編曲";
    const info = parseMinc(doc)!;
    expect(info.credits.filter((c) => c.source === "NexTone").map((c) => [c.name, c.role])).toEqual([
      ["A", "作詞"],
      ["B", "出版社"],
      ["C", "不明"],
      ["D", "作曲"],
    ]);
  });

  it("returns null without the JASRAC header table", () => {
    expect(parseMinc(emptyDocument("https://www.minc.or.jp/saku/detail/?jcd=1"))).toBeNull();
    const doc = mincDocument("minc-70342415");
    doc.querySelector("#jasrac-area table")!.remove();
    expect(parseMinc(doc)).toBeNull();
  });
});
