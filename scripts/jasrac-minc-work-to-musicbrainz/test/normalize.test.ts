import {
  displayTitle,
  fold,
  isCjkOnly,
  isCompany,
  moveArticle,
  stripCompany,
  stripRightsHolder,
  targetName,
} from "../src/normalize";

describe("fold", () => {
  it("folds full-width Latin and collapses full-width spaces", () => {
    expect(fold("ＹＯＵＴＨＦＵＬ")).toBe("YOUTHFUL");
    expect(fold("ＡＬＭＩＧＨＴＹ　　ＴＨＥ")).toBe("ALMIGHTY THE");
    expect(fold("  堀内　孝太 ")).toBe("堀内 孝太");
    expect(fold("㈱ドワンゴ")).toBe("(株)ドワンゴ");
  });
});

describe("moveArticle", () => {
  it("moves a trailing THE, A, or AN that follows two or more spaces", () => {
    expect(moveArticle("ALMIGHTY  THE")).toBe("THE ALMIGHTY");
    expect(moveArticle("NEW WORLD FOOL  A")).toBe("A NEW WORLD FOOL");
    expect(moveArticle("ＡＬＭＩＧＨＴＹ　　ＴＨＥ")).toBe("THE ALMIGHTY");
    expect(moveArticle("Old Story   an")).toBe("an Old Story");
  });
  it("leaves single-spaced and other titles alone", () => {
    expect(moveArticle("PLAN A")).toBe("PLAN A");
    expect(moveArticle("SIDE AN")).toBe("SIDE AN");
    expect(moveArticle("ALMIGHTY THE")).toBe("ALMIGHTY THE");
    expect(moveArticle("DAZZLING SMILE")).toBe("DAZZLING SMILE");
    expect(moveArticle("THE END")).toBe("THE END");
    expect(moveArticle("A")).toBe("A");
    expect(moveArticle("かるた日和　　THE")).toBe("かるた日和 THE");
    expect(moveArticle("BREATHE")).toBe("BREATHE");
  });
});

describe("displayTitle", () => {
  it("folds then moves the article", () => {
    expect(displayTitle("ＡＬＭＩＧＨＴＹ　　ＴＨＥ")).toBe("THE ALMIGHTY");
    expect(displayTitle("ＮＥＷ　ＷＯＲＬＤ　ＦＯＯＬ　　Ａ")).toBe("A NEW WORLD FOOL");
    expect(displayTitle("かるた日和")).toBe("かるた日和");
  });
});

describe("company markers", () => {
  it("detects Japanese markers at either end, spaced or not", () => {
    expect(isCompany("日本テレビ音楽　株式会社")).toBe(true);
    expect(isCompany("株式会社 ドワンゴ 第七事業部")).toBe(true);
    expect(isCompany("株式会社ドワンゴ")).toBe(true);
    expect(isCompany("㈱ドワンゴ")).toBe(true);
    expect(isCompany("有限会社ハル")).toBe(true);
    expect(isCompany("ソニー・ミュージックパブリッシング")).toBe(false);
    expect(isCompany("堀内　孝太")).toBe(false);
  });
  it("detects Latin markers only as whole tokens", () => {
    expect(isCompany("Sony Music Publishing Inc.")).toBe(true);
    expect(isCompany("ACME Co., Ltd.")).toBe(true);
    expect(isCompany("Foo LLC")).toBe(true);
    expect(isCompany("Coldplay")).toBe(false);
    expect(isCompany("Include")).toBe(false);
  });
  it("strips the marker and the space next to it", () => {
    expect(stripCompany("日本テレビ音楽　株式会社")).toBe("日本テレビ音楽");
    expect(stripCompany("株式会社 ドワンゴ 第七事業部")).toBe("ドワンゴ 第七事業部");
    expect(stripCompany("株式会社ドワンゴ")).toBe("ドワンゴ");
    expect(stripCompany("Sony Music Publishing Inc.")).toBe("Sony Music Publishing");
    expect(stripCompany("ACME Co., Ltd.")).toBe("ACME");
    expect(stripCompany("ソニー・ミュージックパブリッシング")).toBe("ソニー・ミュージックパブリッシング");
  });
});

describe("isCjkOnly", () => {
  it("accepts kana, kanji, digits, ・, ー, 々 and spaces", () => {
    expect(isCjkOnly("堀内 孝太")).toBe(true);
    expect(isCjkOnly("ソニー・ミュージックパブリッシング")).toBe(true);
    expect(isCjkOnly("ドワンゴ 第7事業部")).toBe(true);
    expect(isCjkOnly("佐々木")).toBe(true);
  });
  it("rejects Latin letters", () => {
    expect(isCjkOnly("MonsterZ MATE")).toBe(false);
    expect(isCjkOnly("神田 沙也加 feat. X")).toBe(false);
  });
});

describe("targetName", () => {
  it("removes spaces in CJK names and keeps them in Latin names", () => {
    expect(targetName("堀内　孝太")).toBe("堀内孝太");
    expect(targetName("日本テレビ音楽　株式会社")).toBe("日本テレビ音楽");
    expect(targetName("株式会社 ドワンゴ 第七事業部")).toBe("ドワンゴ第七事業部");
    expect(targetName("ドワンゴ 第７事業部")).toBe("ドワンゴ第7事業部");
    expect(targetName("ＭｏｎｓｔｅｒＺ ＭＡＴＥ")).toBe("MonsterZ MATE");
    expect(targetName("ソニー・ミュージックパブリッシング")).toBe("ソニー・ミュージックパブリッシング");
  });
});

describe("stripRightsHolder", () => {
  it("removes the 権利者 prefix and following spaces", () => {
    expect(stripRightsHolder("権利者　㈱ソニー")).toBe("㈱ソニー");
    expect(stripRightsHolder("権利者 山田太郎")).toBe("山田太郎");
    expect(stripRightsHolder("山田太郎")).toBe("山田太郎");
  });
});
