import { searchQuery } from "../src/query";
import type { Query } from "../src/types";

describe("searchQuery", () => {
  it("keeps a query whose people fields hold one name each", () => {
    const q: Query = { title: "Lemon", artist: "米津玄師", lyricist: "米津玄師", composer: "米津 玄師" };
    expect(searchQuery(q)).toEqual(q);
  });

  it("drops a people field that holds alternatives", () => {
    const q: Query = {
      title: "もしも君が願うのなら",
      artist: "とくP, ライブP & 鏡音リン / Salamander Factory / May’n",
      lyricist: "藤林聖子",
      composer: "鷺巣詩郎",
    };
    expect(searchQuery(q)).toEqual({ title: "もしも君が願うのなら", artist: "", lyricist: "藤林聖子", composer: "鷺巣詩郎" });
  });

  it("keeps a title that contains a slash and drops every field with alternatives", () => {
    const q: Query = { title: "A / B", artist: "X / Y", lyricist: "P / Q", composer: "R / S" };
    expect(searchQuery(q)).toEqual({ title: "A / B", artist: "", lyricist: "", composer: "" });
  });
});
