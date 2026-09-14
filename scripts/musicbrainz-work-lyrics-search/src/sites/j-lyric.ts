import type { Query, Row, Site } from "../types";
import { abs, row, text, withParams } from "./util";

export const jLyric: Site = {
  id: "j-lyric",
  name: "J-Lyric",
  origin: "https://j-lyric.net",
  buildUrl(q: Query): string {
    const params: Record<string, string> = { kt: q.title, ct: "2" };
    if (q.artist.trim()) {
      params.ka = q.artist;
      params.ca = "2";
    }
    return withParams("https://j-lyric.net/search.php", params);
  },
  parse(doc: Document, origin: string): Row[] {
    const rows: Row[] = [];
    for (const bdy of Array.from(doc.querySelectorAll("div.bdy"))) {
      const link = bdy.querySelector("p.mid a");
      if (!link) continue;
      const singer = Array.from(bdy.querySelectorAll("p.sml")).find((p) => text(p).startsWith("歌："));
      rows.push(row({ url: abs(origin, link.getAttribute("href")), title: text(link), artist: text(singer?.querySelector("a")) }));
    }
    return rows;
  },
};
