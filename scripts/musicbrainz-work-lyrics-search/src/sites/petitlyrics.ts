import type { Query, Row, Site } from "../types";
import { abs, row, text, withParams } from "./util";

export const petitlyrics: Site = {
  id: "petitlyrics",
  name: "プチリリ",
  origin: "https://petitlyrics.com",
  buildUrl(q: Query): string {
    return withParams("https://petitlyrics.com/search_lyrics", { title: q.title, artist: q.artist });
  },
  parse(doc: Document, origin: string): Row[] {
    const rows: Row[] = [];
    for (const title of Array.from(doc.querySelectorAll("#lyrics_list .lyrics-list-title"))) {
      const link = title.closest("a");
      const cell = title.closest("td");
      if (!link || !cell) continue;
      rows.push(row({ url: abs(origin, link.getAttribute("href")), title: text(title), artist: text(cell.querySelector(".lyrics-list-artist")) }));
    }
    return rows;
  },
};
