import type { Query, Row, Site } from "../types";
import { abs, row, text, withParams } from "./util";

export const joysound: Site = {
  id: "joysound",
  name: "JOYSOUND",
  origin: "https://www.joysound.com",
  buildUrl(q: Query): string {
    return withParams("https://www.joysound.com/web/search/song", { keyword: q.title, match: "1" });
  },
  parse(doc: Document, origin: string): Row[] {
    const rows: Row[] = [];
    for (const link of Array.from(doc.querySelectorAll("li a[href^='/web/search/song/']"))) {
      const title = link.querySelector("p");
      if (!title) continue;
      rows.push(row({ url: abs(origin, link.getAttribute("href")), title: text(title), artist: text(title.parentElement?.nextElementSibling) }));
    }
    return rows;
  },
};
