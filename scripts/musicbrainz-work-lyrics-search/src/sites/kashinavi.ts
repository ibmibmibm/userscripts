import type { Query, Row, Site } from "../types";
import { shiftJisEncode } from "./shift-jis";
import { abs, row, text, withParams } from "./util";

const RESULT_HEADERS = ["曲名", "歌手名", "歌い出し", "ミニ情報"];

/** Header cells read "- - - ◆　曲名" etc; strip that prefix before comparing. */
function stripHeaderPrefix(s: string): string {
  return s.replace(/^[-\s]*◆\s*/, "");
}

/** The rows of this table, without the rows of tables nested inside it. */
function ownRows(table: Element): Element[] {
  return Array.from(table.querySelectorAll(":scope > tr, :scope > thead > tr, :scope > tbody > tr"));
}

function isHeaderRow(tr: Element): boolean {
  const headers = Array.from(tr.querySelectorAll(":scope > td")).map((td) => stripHeaderPrefix(text(td)));
  return RESULT_HEADERS.every((h) => headers.includes(h));
}

/**
 * The one table (among ads, forms, and the "new songs" list) that holds results. A search with hits
 * puts a count row ("該当件数1件") above the header row, so every row of the table is a candidate.
 */
function findResultTable(doc: Document): Element | null {
  for (const table of Array.from(doc.querySelectorAll("table"))) {
    if (ownRows(table).some(isHeaderRow)) return table;
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
    for (const tr of ownRows(table)) {
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
