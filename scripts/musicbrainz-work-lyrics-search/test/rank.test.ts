import { rankRows, scoreRow } from "../src/rank";
import type { Query, Row } from "../src/types";

const q: Query = { title: "Lemon", artist: "米津玄師", lyricist: "米津玄師", composer: "米津玄師" };
const row = (over: Partial<Row>): Row => ({ url: "https://example.invalid/1", title: "", artist: "", lyricist: "", composer: "", ...over });

describe("scoreRow", () => {
  it("counts fields that are filled on both sides and match", () => {
    const s = scoreRow(q, row({ title: "Lemon(ドラマ 「アンナチュラル」 主題歌)", artist: "米津 玄師", lyricist: "米津玄師", composer: "米津玄師" }));
    expect(s.score).toBe(3);
    expect(s.matched).toEqual(["artist", "lyricist", "composer"]);
  });

  it("ignores fields that are empty in the query or the row", () => {
    const s = scoreRow({ ...q, lyricist: "", composer: "" }, row({ title: "LEMON", artist: "米津玄師", lyricist: "someone" }));
    expect(s.score).toBe(2);
    expect(s.matched).toEqual(["title", "artist"]);
  });

  it("matches any of several names in the query", () => {
    const s = scoreRow({ ...q, composer: "伊藤真澄 / 米津玄師" }, row({ composer: "米津玄師" }));
    expect(s.matched).toEqual(["composer"]);
  });
});

describe("rankRows", () => {
  it("sorts by score, then keeps the site order", () => {
    const rows = [
      row({ url: "a", title: "Lemonade", artist: "aespa" }),
      row({ url: "b", title: "Lemon", artist: "島津亜矢" }),
      row({ url: "c", title: "Lemon", artist: "米津玄師" }),
      row({ url: "d", title: "LEMON", artist: "serial TV drama" }),
    ];
    expect(rankRows(q, rows).map((s) => `${s.row.url}:${s.score}`)).toEqual(["c:2", "b:1", "d:1", "a:0"]);
  });
});
