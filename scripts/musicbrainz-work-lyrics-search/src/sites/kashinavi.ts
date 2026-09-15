import type { Query, Row, Site } from "../types";
import { shiftJisEncode } from "./shift-jis";
import { abs, row, text, withParams } from "./util";

const RESULT_HEADERS = ["曲名", "歌手名", "歌い出し", "ミニ情報"];

/** Header cells read "- - - ◆　曲名" etc; strip that prefix before comparing. */
function stripHeaderPrefix(s: string): string {
  return s.replace(/^[-\s]*◆\s*/, "");
}

/** The one table (among ads, forms, and the "new songs" list) that holds results. */
function findResultTable(doc: Document): Element | null {
  for (const table of Array.from(doc.querySelectorAll("table"))) {
    const headerRow = table.querySelector("tr");
    if (!headerRow) continue;
    const headers = Array.from(headerRow.querySelectorAll(":scope > td")).map((td) => stripHeaderPrefix(text(td)));
    if (RESULT_HEADERS.every((h) => headers.includes(h))) return table;
  }
  return null;
}

export const kashinavi: Site = {
  id: "kashinavi",
  name: "歌詞ナビ",
  origin: "https://kashinavi.com",
  charset: "shift_jis",
  buildUrl(q: Query): string {
    return withParams(
      "https://kashinavi.com/search.php",
      { kyoku: q.title, kashu: q.artist, sakushi: q.lyricist, sakkyoku: q.composer, start: "1" },
      shiftJisEncode,
    );
  },
  parse(doc: Document, origin: string): Row[] {
    const table = findResultTable(doc);
    if (!table) return [];
    const rows: Row[] = [];
    for (const tr of Array.from(table.querySelectorAll("tr"))) {
      const cells = tr.querySelectorAll(":scope > td");
      const link = cells[1]?.querySelector("a[href*='/lyrics/']");
      if (!link) continue;
      const url = abs(origin, link.getAttribute("href"));
      if (!url) continue;
      rows.push(row({ url, title: text(link), artist: text(cells[2]?.querySelector("a")) }));
    }
    return rows;
  },
};
