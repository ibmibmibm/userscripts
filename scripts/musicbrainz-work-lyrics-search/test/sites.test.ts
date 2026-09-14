import { jLyric } from "../src/sites/j-lyric";
import { utaNet } from "../src/sites/uta-net";
import { utaten } from "../src/sites/utaten";
import type { Query } from "../src/types";
import { siteDocument } from "./helpers";

const full: Query = { title: "Lemon", artist: "米津玄師", lyricist: "米津玄師", composer: "米津 玄師" };
const titleOnly: Query = { title: "Lemon", artist: "", lyricist: "", composer: "" };

describe("j-lyric", () => {
  it("builds a contains-match title and artist search", () => {
    expect(jLyric.buildUrl(full)).toBe("https://j-lyric.net/search.php?kt=Lemon&ct=2&ka=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&ca=2");
    expect(jLyric.buildUrl(titleOnly)).toBe("https://j-lyric.net/search.php?kt=Lemon&ct=2");
  });

  it("parses title and artist rows", () => {
    const rows = jLyric.parse(siteDocument("j-lyric-search", "https://j-lyric.net/search.php?kt=Lemon&ct=2"), jLyric.origin);
    expect(rows.length).toBe(6);
    expect(rows[0]).toEqual({ url: "https://j-lyric.net/artist/a0670a8/l0626df.html", title: "Beautiful Lemonade", artist: "material club", lyricist: "", composer: "" });
    expect(rows[4]).toEqual({ url: "https://j-lyric.net/artist/a0579b7/l044ef6.html", title: "Lemon", artist: "米津玄師", lyricist: "", composer: "" });
  });
});

describe("utaten", () => {
  it("sends all four fields", () => {
    expect(utaten.buildUrl(full)).toBe("https://utaten.com/search?title=Lemon&artist_name=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&lyricist=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&composer=%E7%B1%B3%E6%B4%A5+%E7%8E%84%E5%B8%AB");
    expect(utaten.buildUrl(titleOnly)).toBe("https://utaten.com/search?title=Lemon");
  });

  it("parses title, artist, lyricist, and composer rows", () => {
    const rows = utaten.parse(siteDocument("utaten-search", "https://utaten.com/search?title=Lemon"), utaten.origin);
    expect(rows.length).toBe(5);
    expect(rows[0]).toEqual({ url: "https://utaten.com/lyric/sz26060401/", title: "LEMONADE", artist: "aespa", lyricist: "", composer: "" });
    expect(rows[1]).toEqual({ url: "https://utaten.com/lyric/sa18020902/", title: "Lemon(ドラマ 「アンナチュラル」 主題歌)", artist: "米津玄師", lyricist: "米津玄師", composer: "米津玄師" });
    expect(rows[4].lyricist).toBe("KENZIE");
    expect(rows[4].composer).toBe("Rouno / no2zcat / Andrew Choi / KENZIE / JSONG");
  });
});

describe("uta-net", () => {
  it("sends the title only", () => {
    expect(utaNet.buildUrl(full)).toBe("https://www.uta-net.com/search/?target=songtitle&type=in&Keyword=Lemon");
  });

  it("parses the song list table", () => {
    const rows = utaNet.parse(siteDocument("uta-net-search", "https://www.uta-net.com/search/?target=songtitle&type=in&Keyword=Lemon"), utaNet.origin);
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual({ url: "https://www.uta-net.com/song/268773/", title: "California Lemon Trees", artist: "少年ナイフ", lyricist: "Naoko", composer: "Naoko" });
    expect(rows[2]).toEqual({ url: "https://www.uta-net.com/song/314771/", title: "SUGAR×LEMONADE", artist: "シュガーポケッツ", lyricist: "永井正道", composer: "永井正道" });
  });
});
