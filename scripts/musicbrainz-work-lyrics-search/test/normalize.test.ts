import { fold, namesMatch, namesOverlap, splitNames, titlesMatch } from "../src/normalize";

describe("fold", () => {
  it("applies NFKC, lower case, and strips spaces and separators", () => {
    expect(fold("Ｌｅｍｏｎ")).toBe("lemon");
    expect(fold("畑　亜貴")).toBe("畑亜貴");
    expect(fold("Aki Hata")).toBe("akihata");
    expect(fold("TAK feat. 初音ミク")).toBe("takfeat.初音ミク");
    expect(fold("鈴木・田中, 佐藤，山田、")).toBe("鈴木田中佐藤山田");
    expect(fold("  ")).toBe("");
  });
});

describe("splitNames", () => {
  it("splits on ' / ' and drops empty parts", () => {
    expect(splitNames("畑亜貴 / 伊藤真澄")).toEqual(["畑亜貴", "伊藤真澄"]);
    expect(splitNames(" 米津玄師 ")).toEqual(["米津玄師"]);
    expect(splitNames("")).toEqual([]);
    expect(splitNames("AC/DC")).toEqual(["AC/DC"]);
  });
});

describe("namesMatch", () => {
  it("matches folded names and swapped two-part names", () => {
    expect(namesMatch("畑 亜貴", "畑亜貴")).toBe(true);
    expect(namesMatch("Aki Hata", "Hata Aki")).toBe(true);
    expect(namesMatch("Hata Aki", "aki hata")).toBe(true);
    expect(namesMatch("米津玄師", "米津 玄師")).toBe(true);
    expect(namesMatch("米津玄師", "島津亜矢")).toBe(false);
    expect(namesMatch("", "")).toBe(false);
    expect(namesMatch("a b c", "c b a")).toBe(false);
  });
});

describe("namesOverlap", () => {
  it("is true when any name on either side matches", () => {
    expect(namesOverlap("畑亜貴 / 伊藤真澄", "伊藤 真澄")).toBe(true);
    expect(namesOverlap("KENZIE", "Rouno / no2zcat / KENZIE")).toBe(true);
    expect(namesOverlap("畑亜貴", "伊藤真澄")).toBe(false);
  });
});

describe("titlesMatch", () => {
  it("compares folded titles without the swap rule", () => {
    expect(titlesMatch("Lemon", "ＬＥＭＯＮ")).toBe(true);
    expect(titlesMatch("SPINDLE STORY", "spindle story")).toBe(true);
    expect(titlesMatch("Lemon Tang", "Tang Lemon")).toBe(false);
    expect(titlesMatch("Lemon", "Lemon(ドラマ 「アンナチュラル」 主題歌)")).toBe(false);
  });
});
