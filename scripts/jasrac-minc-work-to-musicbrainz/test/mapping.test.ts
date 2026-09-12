import { ATTR, LINK, mapCredits, workKind } from "../src/mapping";
import type { Credit } from "../src/types";

const c = (role: string, name: string, source: "JASRAC" | "NexTone" = "JASRAC"): Credit => ({
  source,
  name,
  role,
  trust: null,
  society: null,
  note: null,
});

describe("mapCredits", () => {
  it("maps every role of the table", () => {
    const { rels, skipped } = mapCredits([
      c("作詞", "堀内　孝太"),
      c("補詞", "山田　花子"),
      c("訳詞", "鈴木　一郎"),
      c("作曲", "堀内　孝平"),
      c("編曲", "佐藤　次郎"),
      c("作曲作詞", "田中　三郎"),
      c("不明", "高橋　四郎"),
      c("出版者", "日本テレビ音楽　株式会社"),
      c("出版社", "株式会社 ドワンゴ 第七事業部"),
      c("サブ出版", "ソニー・ミュージックパブリッシング"),
    ]);
    expect(skipped).toEqual([]);
    expect(rels.map((r) => [r.label, r.linkType, r.targetType, r.target, r.attributes])).toEqual([
      ["lyricist", LINK.lyricist, "artist", "堀内孝太", []],
      ["additional lyricist", LINK.lyricist, "artist", "山田花子", [ATTR.additional]],
      ["translator", LINK.translator, "artist", "鈴木一郎", []],
      ["composer", LINK.composer, "artist", "堀内孝平", []],
      ["arranger", LINK.arranger, "artist", "佐藤次郎", []],
      ["writer", LINK.writer, "artist", "田中三郎", []],
      ["writer", LINK.writer, "artist", "高橋四郎", []],
      ["publisher", LINK.publishing, "label", "日本テレビ音楽", []],
      ["publisher", LINK.publishing, "label", "ドワンゴ第七事業部", []],
      ["sub-publisher", LINK.publishing, "label", "ソニー・ミュージックパブリッシング", [ATTR.sub]],
    ]);
  });

  it("skips unknown roles, rights-holder persons, and UNKNOWN PUBLISHER", () => {
    const credits = [c("演奏", "誰か"), c("作詞", "権利者　山田太郎"), c("出版者", "UNKNOWN PUBLISHER")];
    const { rels, skipped } = mapCredits(credits);
    expect(rels).toEqual([]);
    expect(skipped).toEqual([
      { credit: credits[0], reason: "not mapped" },
      { credit: credits[1], reason: "rights holder" },
      { credit: credits[2], reason: "unknown publisher" },
    ]);
  });

  it("maps a rights-holder company to publisher whatever the role", () => {
    const { rels } = mapCredits([c("作曲", "権利者　㈱ソニー・ミュージックパブリッシング")]);
    expect(rels.map((r) => [r.label, r.targetType, r.target])).toEqual([["publisher", "label", "ソニー・ミュージックパブリッシング"]]);
  });

  it("merges duplicates across JASRAC and NexTone and keeps first-seen order", () => {
    const credits = [
      c("作詞", "かいりきベア"),
      c("作曲", "かいりきベア"),
      c("作詞", "かいりきベア", "NexTone"),
      c("出版者", "ドワンゴ 第７事業部"),
      c("出版社", "株式会社 ドワンゴ 第七事業部", "NexTone"),
    ];
    const { rels } = mapCredits(credits);
    expect(rels.map((r) => [r.label, r.target, r.from.length])).toEqual([
      ["lyricist", "かいりきベア", 2],
      ["composer", "かいりきベア", 1],
      ["publisher", "ドワンゴ第7事業部", 1],
      ["publisher", "ドワンゴ第七事業部", 1],
    ]);
    expect(rels[0].from).toEqual([credits[0], credits[2]]);
  });

  it("does not merge a plain lyricist with an additional lyricist", () => {
    const { rels } = mapCredits([c("作詞", "A"), c("補詞", "A")]);
    expect(rels.length).toBe(2);
  });
});

describe("workKind", () => {
  it("is song when any role contains 詞", () => {
    expect(workKind([c("作曲", "A"), c("作詞", "B")])).toBe("song");
    expect(workKind([c("訳詞", "B")])).toBe("song");
    expect(workKind([c("作曲作詞", "B")])).toBe("song");
  });
  it("is instrumental when only 作曲 or 編曲 and publishers", () => {
    expect(workKind([c("作曲", "A"), c("出版者", "P")])).toBe("instrumental");
    expect(workKind([c("編曲", "A")])).toBe("instrumental");
  });
  it("is unknown for 不明, publishers only, or no credits", () => {
    expect(workKind([c("不明", "A"), c("作曲", "B")])).toBe("unknown");
    expect(workKind([c("出版者", "P")])).toBe("unknown");
    expect(workKind([])).toBe("unknown");
  });
});
