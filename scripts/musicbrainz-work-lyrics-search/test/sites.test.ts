import { JSDOM } from "jsdom";
import { SITES } from "../src/sites";
import { jLyric } from "../src/sites/j-lyric";
import { joysound } from "../src/sites/joysound";
import { kashinavi } from "../src/sites/kashinavi";
import { petitlyrics } from "../src/sites/petitlyrics";
import { utaNet } from "../src/sites/uta-net";
import { utaten } from "../src/sites/utaten";
import type { Query } from "../src/types";
import { siteDocument } from "./helpers";

const full: Query = { title: "Lemon", artist: "米津玄師", lyricist: "米津玄師", composer: "米津 玄師" };
const titleOnly: Query = { title: "Lemon", artist: "", lyricist: "", composer: "" };
const titleJapanese: Query = { title: "レモン", artist: "", lyricist: "", composer: "" };

describe("j-lyric", () => {
  it("builds a contains-match title and artist search", () => {
    expect(jLyric.buildUrl(full)).toBe("https://j-lyric.net/search.php?kt=Lemon&ct=2&ka=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&ca=2");
    expect(jLyric.buildUrl(titleOnly)).toBe("https://j-lyric.net/search.php?kt=Lemon&ct=2");
  });

  it("percent-encodes a Japanese title as UTF-8", () => {
    expect(jLyric.buildUrl(titleJapanese)).toBe("https://j-lyric.net/search.php?kt=%E3%83%AC%E3%83%A2%E3%83%B3&ct=2");
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

  it("percent-encodes a Japanese title as UTF-8", () => {
    expect(utaten.buildUrl(titleJapanese)).toBe("https://utaten.com/search?title=%E3%83%AC%E3%83%A2%E3%83%B3");
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
  it("sends the title only and treats HTTP 404 as no hits", () => {
    expect(utaNet.emptyStatus).toBe(404);
    expect(utaNet.buildUrl(full)).toBe("https://www.uta-net.com/search/?target=songtitle&type=in&Keyword=Lemon");
  });

  it("percent-encodes a Japanese title as UTF-8", () => {
    expect(utaNet.buildUrl(titleJapanese)).toBe("https://www.uta-net.com/search/?target=songtitle&type=in&Keyword=%E3%83%AC%E3%83%A2%E3%83%B3");
  });

  it("parses the song list table", () => {
    const rows = utaNet.parse(siteDocument("uta-net-search", "https://www.uta-net.com/search/?target=songtitle&type=in&Keyword=Lemon"), utaNet.origin);
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual({ url: "https://www.uta-net.com/song/268773/", title: "California Lemon Trees", artist: "少年ナイフ", lyricist: "Naoko", composer: "Naoko" });
    expect(rows[2]).toEqual({ url: "https://www.uta-net.com/song/314771/", title: "SUGAR×LEMONADE", artist: "シュガーポケッツ", lyricist: "永井正道", composer: "永井正道" });
  });
});

describe("kashinavi", () => {
  it("sends all four fields, Shift_JIS-encoded, and declares Shift_JIS", () => {
    expect(kashinavi.charset).toBe("shift_jis");
    expect(kashinavi.buildUrl(full)).toBe(
      "https://kashinavi.com/search.php?kyoku=%4C%65%6D%6F%6E&kashu=%95%C4%92%C3%8C%BA%8E%74&sakushi=%95%C4%92%C3%8C%BA%8E%74&sakkyoku=%95%C4%92%C3%20%8C%BA%8E%74&start=%31",
    );
    expect(kashinavi.buildUrl(titleOnly)).toBe("https://kashinavi.com/search.php?kyoku=%4C%65%6D%6F%6E&start=%31");
  });

  it("percent-encodes a Japanese title as Shift_JIS", () => {
    expect(kashinavi.buildUrl(titleJapanese)).toBe("https://kashinavi.com/search.php?kyoku=%83%8C%83%82%83%93&start=%31");
  });

  it("parses title and artist rows from the result table, whose header row sits below the count row", () => {
    const rows = kashinavi.parse(siteDocument("kashinavi-search", "https://kashinavi.com/search.php?kyoku=Lemon&start=1"), kashinavi.origin);
    expect(rows.length).toBe(6);
    expect(rows[0]).toEqual({ url: "https://kashinavi.com/lyrics/159368/", title: "Lime & Lemon", artist: "東方神起", lyricist: "", composer: "" });
    expect(rows[5].title).toBe("フェス!!最高 (from 2010.5.17 渋谷C.C.Lemonホール)");
    expect(rows[5].artist).toBe("グループ魂");
  });

  it("returns no rows on a no-hit page (ignoring the unrelated new-songs table)", () => {
    const rows = kashinavi.parse(
      siteDocument("kashinavi-empty", "https://kashinavi.com/search.php?kyoku=%83%8C%83%82%83%93%83%8C%83%82%83%93%83%8C%83%82%83%93&start=1"),
      kashinavi.origin,
    );
    expect(rows).toEqual([]);
  });

  it("ignores the rows of a table nested in the result table", () => {
    const html = `<table>
      <tr><td colspan=5>「Lemon」の検索結果該当件数1件</td></tr>
      <tr><td></td><td>- - - ◆　曲名</td><td>- - - ◆　歌手名</td><td>- - - ◆　歌い出し</td><td>- - - ◆　ミニ情報</td></tr>
      <tr><td></td><td><a href="/lyrics/1/">Good</a></td><td><a href="/artist/1">Artist</a></td><td></td><td></td></tr>
      <tr><td colspan=5><table><tr><td></td><td><a href="/lyrics/2/">Advert</a></td><td></td><td></td><td></td></tr></table></td></tr>
    </table>`;
    const doc = new JSDOM(html).window.document;
    expect(kashinavi.parse(doc, kashinavi.origin)).toEqual([
      { url: "https://kashinavi.com/lyrics/1/", title: "Good", artist: "Artist", lyricist: "", composer: "" },
    ]);
  });

  it("drops a row whose link uses a javascript: scheme", () => {
    const html = `<table>
      <tr><td></td><td>- - - ◆　曲名</td><td>- - - ◆　歌手名</td><td>- - - ◆　歌い出し</td><td>- - - ◆　ミニ情報</td></tr>
      <tr><td></td><td><a href="javascript:location.href='/lyrics/1/'">Bad</a></td><td><a href="/artist/1">Artist</a></td><td></td><td></td></tr>
    </table>`;
    const doc = new JSDOM(html).window.document;
    expect(kashinavi.parse(doc, kashinavi.origin)).toEqual([]);
  });
});

describe("petitlyrics", () => {
  it("sends title and artist", () => {
    expect(petitlyrics.buildUrl(full)).toBe("https://petitlyrics.com/search_lyrics?title=Lemon&artist=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB");
    expect(petitlyrics.buildUrl(titleOnly)).toBe("https://petitlyrics.com/search_lyrics?title=Lemon");
  });

  it("percent-encodes a Japanese title as UTF-8", () => {
    expect(petitlyrics.buildUrl(titleJapanese)).toBe("https://petitlyrics.com/search_lyrics?title=%E3%83%AC%E3%83%A2%E3%83%B3");
  });

  it("parses title and artist rows", () => {
    const rows = petitlyrics.parse(siteDocument("petitlyrics-search", "https://petitlyrics.com/search_lyrics?title=Lemon"), petitlyrics.origin);
    expect(rows.length).toBe(5);
    expect(rows[0]).toEqual({ url: "https://petitlyrics.com/lyrics/146932", title: "LEMON", artist: "serial TV drama", lyricist: "", composer: "" });
    expect(rows[4]).toEqual({ url: "https://petitlyrics.com/lyrics/1177020", title: "LEMON TEA", artist: "SHEENA & THE ROKKETS", lyricist: "", composer: "" });
  });
});

describe("joysound", () => {
  it("sends the title as the keyword", () => {
    expect(joysound.buildUrl(full)).toBe("https://www.joysound.com/web/search/song?keyword=Lemon&match=1");
  });

  it("percent-encodes a Japanese title as UTF-8", () => {
    expect(joysound.buildUrl(titleJapanese)).toBe("https://www.joysound.com/web/search/song?keyword=%E3%83%AC%E3%83%A2%E3%83%B3&match=1");
  });

  it("parses song cards", () => {
    const rows = joysound.parse(siteDocument("joysound-search", "https://www.joysound.com/web/search/song?keyword=Lemon&match=1"), joysound.origin);
    expect(rows.length).toBe(5);
    expect(rows[0]).toEqual({ url: "https://www.joysound.com/web/search/song/669975", title: "Lemon", artist: "米津玄師", lyricist: "", composer: "" });
    expect(rows[3]).toEqual({ url: "https://www.joysound.com/web/search/song/5904587", title: "LEMONADE", artist: "aespa (aespa)", lyricist: "", composer: "" });
  });
});

describe("SITES", () => {
  it("lists the six sites in display order with unique ids", () => {
    expect(SITES.map((s) => s.id)).toEqual(["j-lyric", "utaten", "uta-net", "kashinavi", "petitlyrics", "joysound"]);
  });
});
