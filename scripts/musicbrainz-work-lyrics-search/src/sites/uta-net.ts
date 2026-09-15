import type { Query, Row, Site } from "../types";
import { abs, row, text, withParams } from "./util";

export const utaNet: Site = {
  id: "uta-net",
  name: "歌ネット",
  origin: "https://www.uta-net.com",
  emptyStatus: 404,
  buildUrl(q: Query): string {
    return withParams("https://www.uta-net.com/search/", { target: "songtitle", type: "in", Keyword: q.title });
  },
  parse(doc: Document, origin: string): Row[] {
    const rows: Row[] = [];
    for (const tr of Array.from(doc.querySelectorAll("table tbody tr"))) {
      const title = tr.querySelector(".songlist-title");
      const link = tr.querySelector("td a");
      if (!title || !link) continue;
      const url = abs(origin, link.getAttribute("href"));
      if (!url) continue;
      const cells = tr.querySelectorAll("td");
      rows.push(
        row({
          url,
          title: text(title),
          artist: text(cells[1]),
          lyricist: text(cells[2]),
          composer: text(cells[3]),
        }),
      );
    }
    return rows;
  },
};
