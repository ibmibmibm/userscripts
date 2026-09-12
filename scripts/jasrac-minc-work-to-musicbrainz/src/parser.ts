import type { Credit, TitleLine, WorkInfo } from "./types";

/** Trimmed text content. Inner whitespace, including U+3000, is kept. */
export function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/ /g, " ").trim();
}

export function orNull(s: string): string | null {
  return s.length > 0 ? s : null;
}

export function iswcOf(s: string): string | null {
  const v = s.replace(/\s+/g, "");
  return /^T-\d{3}\.\d{3}\.\d{3}-\d$/.test(v) ? v : null;
}

export function jasracCodeOf(s: string): string | null {
  const v = s.trim();
  return /^\d{3}-\d{4}-\d$/.test(v) ? v : null;
}

export function nextoneCodeOf(s: string): string | null {
  const v = s.trim();
  return /^N\d{8}$/.test(v) ? v : null;
}

/** Text lines of a cell split at <br>. Blank lines ("", "－", "-") become null. */
export function cellLines(td: Element): (string | null)[] {
  const lines: string[] = [];
  let current = "";
  for (const node of Array.from(td.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === "BR") {
      lines.push(current);
      current = "";
    } else {
      current += node.textContent ?? "";
    }
  }
  lines.push(current);
  return lines.map((l) => {
    const t = l.replace(/ /g, " ").trim();
    return t === "" || t === "－" || t === "-" ? null : t;
  });
}

function jwidTitles(doc: Document): TitleLine[] {
  const table = Array.from(doc.querySelectorAll("table.detail.auto")).find((t) => t.textContent?.includes("作品タイトル"));
  if (!table) return [];
  const out: TitleLine[] = [];
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const td = tr.querySelectorAll("td");
    if (td.length < 2) continue;
    const kind = textOf(td[0]);
    const [title, kana, romaji] = cellLines(td[1]);
    if (!title) continue;
    out.push({ kind, title, kana: kana ?? null, romaji: romaji ?? null, searchName: /^[＊*]/.test(title) });
  }
  return out;
}

function jwidArtists(doc: Document): string[] {
  return Array.from(doc.querySelectorAll("section[data-role='artist'] table.detail tr"))
    .map((tr) => textOf(tr.querySelectorAll("td")[1]))
    .filter((s) => s.length > 0);
}

export function parseJwid(doc: Document): WorkInfo | null {
  const nameEl = doc.querySelector(".baseinfo--name");
  if (!nameEl) return null;
  const jasracCode = jasracCodeOf(textOf(doc.querySelector(".baseinfo--code strong")));
  const iswc = iswcOf(textOf(doc.querySelector(".baseinfo--iswc strong")));
  let domestic: boolean | null = null;
  for (const dl of Array.from(doc.querySelectorAll(".baseinfo--status dl"))) {
    if (textOf(dl.querySelector("dt")) !== "内外") continue;
    const v = textOf(dl.querySelector("dd"));
    domestic = v === "内国作品" ? true : v === "外国作品" ? false : null;
  }
  const table =
    doc.querySelector("div#tab-def .PC table.detail") ?? doc.querySelector("section.content-block .PC table.detail");
  const credits: Credit[] = [];
  for (const tr of Array.from(table?.querySelectorAll("tr") ?? [])) {
    const td = tr.querySelectorAll("td");
    if (td.length < 3) continue;
    credits.push({
      source: "JASRAC",
      name: textOf(td[1]),
      role: textOf(td[2]),
      trust: orNull(textOf(td[3])),
      society: orNull(textOf(td[4])),
      note: orNull(textOf(td[5])),
    });
  }
  const sourceUrl = jasracCode
    ? `https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=${jasracCode.replace(/-/g, "")}&subSessionID=001&subSession=start`
    : doc.location.href;
  return {
    site: "jwid",
    sourceUrl,
    title: textOf(nameEl),
    jasracCode,
    nextoneCode: null,
    iswc,
    domestic,
    titles: jwidTitles(doc),
    artists: jwidArtists(doc),
    credits,
  };
}
