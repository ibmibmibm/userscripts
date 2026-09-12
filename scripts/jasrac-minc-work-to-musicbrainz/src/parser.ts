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

/** th -> td map of a minc header table (作品名, 作品コード, ISWC, 副題, アーティスト). */
function headerFields(table: Element): Map<string, Element> {
  const fields = new Map<string, Element>();
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const th = tr.querySelector("th");
    const td = tr.querySelector("td");
    if (th && td) fields.set(textOf(th), td);
  }
  return fields;
}

function normalizeSpaces(s: string): string {
  return s.replace(/　/g, " ");
}

function nonBlankLines(td: Element | undefined): string[] {
  if (!td) return [];
  return cellLines(td)
    .filter((l): l is string => l !== null)
    .map((l) => normalizeSpaces(l));
}

function splitSlash(s: string): string[] {
  return s.split("/").map((p) => p.trim());
}

function mincJasracCredits(area: Element): Credit[] {
  const out: Credit[] = [];
  for (const table of Array.from(area.querySelectorAll("table")).slice(1)) {
    const td = table.querySelectorAll("td");
    if (td.length < 2) continue;
    const [role = "", trust = ""] = splitSlash(textOf(td[1]));
    out.push({
      source: "JASRAC",
      name: normalizeSpaces(textOf(td[0])),
      role,
      trust: orNull(trust),
      society: null,
      note: null,
    });
  }
  return out;
}

function mincNextoneCredits(area: Element): Credit[] {
  const out: Credit[] = [];
  for (const table of Array.from(area.querySelectorAll("table")).slice(1)) {
    const td = table.querySelectorAll("td");
    if (td.length < 2) continue;
    const names = splitSlash(normalizeSpaces(textOf(td[0]))).filter((n) => n.length > 0);
    const roles = splitSlash(textOf(td[1]));
    names.forEach((name, i) => {
      out.push({ source: "NexTone", name, role: roles[i] || "不明", trust: null, society: null, note: null });
    });
  }
  return out;
}

export function parseMinc(doc: Document): WorkInfo | null {
  const jasracArea = doc.querySelector("#jasrac-area");
  const head = jasracArea?.querySelector("table");
  if (!jasracArea || !head) return null;
  const fields = headerFields(head);
  // Validate that we have a proper header table by checking for required fields
  if (!fields.has("作品名") && !fields.has("作品コード")) return null;
  const title = normalizeSpaces(textOf(fields.get("作品名")));
  const jasracCode = jasracCodeOf(textOf(fields.get("作品コード")));
  const iswc = iswcOf(textOf(fields.get("ISWC")));
  const titles: TitleLine[] = [{ kind: "正題", title, kana: null, romaji: null, searchName: false }];
  for (const sub of nonBlankLines(fields.get("副題"))) {
    titles.push({ kind: "副題", title: sub, kana: null, romaji: null, searchName: /^[＊*]/.test(sub) });
  }
  const artists = nonBlankLines(fields.get("アーティスト"));
  const credits = mincJasracCredits(jasracArea);

  let nextoneCode: string | null = null;
  const nextoneArea = doc.querySelector("#nextone-area");
  const nextoneHead = nextoneArea?.querySelector("table");
  if (nextoneArea && nextoneHead) {
    const nf = headerFields(nextoneHead);
    nextoneCode = nextoneCodeOf(textOf(nf.get("作品コード")));
    for (const sub of nonBlankLines(nf.get("副題"))) {
      if (!titles.some((t) => t.title === sub)) {
        titles.push({ kind: "副題", title: sub, kana: null, romaji: null, searchName: /^[＊*]/.test(sub) });
      }
    }
    for (const a of nonBlankLines(nf.get("アーティスト"))) if (!artists.includes(a)) artists.push(a);
    credits.push(...mincNextoneCredits(nextoneArea));
  }

  const jcd = jasracCode ? jasracCode.replace(/-/g, "") : new URL(doc.location.href).searchParams.get("jcd") ?? "";
  return {
    site: "minc",
    sourceUrl: `https://www.minc.or.jp/saku/detail/?jcd=${jcd}&ncd=${nextoneCode ?? ""}`,
    title,
    jasracCode,
    nextoneCode,
    iswc,
    domestic: null,
    titles,
    artists,
    credits,
  };
}
