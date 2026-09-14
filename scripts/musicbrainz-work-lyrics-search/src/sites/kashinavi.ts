import type { Query, Row, Site } from "../types";
import { abs, row, text, withParams } from "./util";

export const kashinavi: Site = {
  id: "kashinavi",
  name: "歌詞ナビ",
  origin: "https://kashinavi.com",
  charset: "shift_jis",
  buildUrl(q: Query): string {
    return withParams("https://kashinavi.com/search.php", { kyoku: q.title, kashu: q.artist, sakushi: q.lyricist, sakkyoku: q.composer, start: "1" });
  },
  parse(doc: Document, origin: string): Row[] {
    const rows: Row[] = [];
    for (const tr of Array.from(doc.querySelectorAll("table tr"))) {
      const cells = tr.querySelectorAll(":scope > td");
      const link = cells[1]?.querySelector("a[href*='/lyrics/']");
      if (!link) continue;
      rows.push(row({ url: abs(origin, link.getAttribute("href")), title: text(link), artist: text(cells[2]?.querySelector("a")) }));
    }
    return rows;
  },
};
