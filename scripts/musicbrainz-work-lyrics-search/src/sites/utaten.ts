import type { Query, Row, Site } from "../types";
import { abs, row, text, withParams } from "./util";

function writers(cell: Element | null, label: string): string {
  if (!cell) return "";
  const p = Array.from(cell.querySelectorAll("p")).find((x) => text(x).startsWith(label));
  return p ? Array.from(p.querySelectorAll(".songWriters a")).map(text).filter(Boolean).join(" / ") : "";
}

export const utaten: Site = {
  id: "utaten",
  name: "UtaTen",
  origin: "https://utaten.com",
  buildUrl(q: Query): string {
    return withParams("https://utaten.com/search", { title: q.title, artist_name: q.artist, lyricist: q.lyricist, composer: q.composer });
  },
  parse(doc: Document, origin: string): Row[] {
    const rows: Row[] = [];
    for (const tr of Array.from(doc.querySelectorAll("table.searchResult tr"))) {
      const link = tr.querySelector(".searchResult__title a");
      if (!link) continue;
      const writersCell = tr.querySelector(".searchResult__lyricist");
      rows.push(
        row({
          url: abs(origin, link.getAttribute("href")),
          title: text(link),
          artist: text(tr.querySelector(".searchResult__artist > p a")),
          lyricist: writers(writersCell, "作詞"),
          composer: writers(writersCell, "作曲"),
        }),
      );
    }
    return rows;
  },
};
