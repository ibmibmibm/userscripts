# MusicBrainz work lyrics search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A userscript that adds a "Lyrics search" fieldset to MusicBrainz work edit pages, searches six Japanese lyrics sites inline, ranks the rows against title, artist, lyricist and composer, and adds a chosen page to the external links editor.

**Architecture:** One script folder `scripts/musicbrainz-work-lyrics-search/` built by the existing `build.mjs` into `dist/musicbrainz-work-lyrics-search.user.js`. Pure modules (normalize, rank, sites, musicbrainz mapping, links) are unit tested with vitest and jsdom; `ui.ts` takes injected dependencies (`fetchText`, `lookupPeople`, `hasLink`, `addLink`); `main.ts` wires the browser globals (`fetch`, `GM_xmlhttpRequest`, `document`).

**Tech Stack:** TypeScript, esbuild (`node build.mjs <name>`), vitest + jsdom, Tampermonkey/Violentmonkey `GM_xmlhttpRequest`.

**Spec:** `docs/superpowers/specs/2026-09-15-musicbrainz-work-lyrics-search-design.md`

## Global Constraints

- Every CSS class starts with `mb-lyrics-`; the panel root also carries the class `mb-lyrics`.
- `header.txt` has `@version 1.0.0`, `@grant GM_xmlhttpRequest`, and `@connect` for exactly `j-lyric.net`, `utaten.com`, `www.uta-net.com`, `kashinavi.com`, `petitlyrics.com`, `www.joysound.com`.
- Site requests use the exact URLs from the spec table; empty query fields are left out of the query string.
- Several names in one field are joined with ` / ` (space, slash, space) both in prefilled fields and in parsed row fields.
- Normalization: NFKC, lower case, remove all whitespace including U+3000, remove `・･·,，、`. Names also match with their two whitespace-separated parts swapped.
- Status texts are exactly: `Searching…`, `No results`, `No results parsed`, `Request failed: <message>`, `MusicBrainz lookup failed: <message>`, `Could not add, paste the URL by hand`, `added`.
- Fixtures already exist under `scripts/musicbrainz-work-lyrics-search/test/fixtures/` (captured 2026-09-15): `j-lyric-search.html`, `utaten-search.html`, `uta-net-search.html`, `kashinavi-search.html`, `petitlyrics-search.html`, `joysound-search.html`, `mb-work-edit.html`, `mb-work-artist-rels.json`, `mb-recordings-by-work.json`. Do not edit them.
- Run tests from the repository root: `npx vitest run scripts/musicbrainz-work-lyrics-search` and typecheck with `npm run typecheck`. The worktree has no `node_modules`; run `npm install` once first.
- Commit messages: imperative subject, ended with the two attribution lines given in the session (`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_019fGcbh6vctLHn27JjJSkvH`).
- Match the code style of `scripts/jasrac-minc-work-to-musicbrainz/src/` (2-space indent, double quotes, semicolons, `el(doc, tag, className, text)` helper in ui).

---

## File structure

```
scripts/musicbrainz-work-lyrics-search/
  header.txt                 userscript metadata
  README.md                  install and use notes
  src/
    types.ts                 Query, Field, FIELDS, Row, Site, ScoredRow, WorkPeople, PageInfo
    normalize.ts             fold, splitNames, namesMatch, namesOverlap, titlesMatch
    rank.ts                  scoreRow, rankRows
    musicbrainz.ts           mbidFromUrl, fetchJson, peopleFromWork, artistFromRecordings, lookupWorkPeople
    fetch.ts                 gmFetchText (GM_xmlhttpRequest wrapper)
    links.ts                 existingLinks, hasLink, addLink
    sites/util.ts            text, abs, query helpers shared by site modules
    sites/j-lyric.ts         one Site per file
    sites/utaten.ts
    sites/uta-net.ts
    sites/kashinavi.ts
    sites/petitlyrics.ts
    sites/joysound.ts
    sites/index.ts           SITES: Site[] in display order
    ui.ts                    MARKER, UiDeps, enhancePage
    main.ts                  VERSION, pageInfo, enhance, start
  test/
    helpers.ts               fixture loaders
    normalize.test.ts rank.test.ts musicbrainz.test.ts sites.test.ts links.test.ts
    fetch.test.ts ui.test.ts main.test.ts build.test.ts
    fixtures/                (already present)
```

---

### Task 1: Scaffold, types, and normalization

**Files:**
- Create: `scripts/musicbrainz-work-lyrics-search/header.txt`
- Create: `scripts/musicbrainz-work-lyrics-search/src/types.ts`
- Create: `scripts/musicbrainz-work-lyrics-search/src/normalize.ts`
- Create: `scripts/musicbrainz-work-lyrics-search/test/helpers.ts`
- Test: `scripts/musicbrainz-work-lyrics-search/test/normalize.test.ts`

**Interfaces:**
- Produces: everything in `types.ts` below; `fold(s: string): string`, `splitNames(s: string): string[]`, `namesMatch(a: string, b: string): boolean`, `namesOverlap(a: string, b: string): boolean`, `titlesMatch(a: string, b: string): boolean`; helpers `fixtureHtml(name)`, `siteDocument(name, url)`, `editDocument()`, `createDocument()`, `mbJson(name)`.

- [ ] **Step 1: Run `npm install` in the worktree if `node_modules` is missing**

Run: `npm install`
Expected: completes without errors.

- [ ] **Step 2: Write `header.txt`**

```
// ==UserScript==
// @name         MusicBrainz work lyrics search
// @namespace    https://github.com/ibmibmibm/userscripts
// @version      1.0.0
// @description  Search Japanese lyrics sites from a MusicBrainz work edit page and add the lyrics page to the external links
// @author       Shen-Ta Hsieh
// @downloadURL  https://github.com/ibmibmibm/userscripts/raw/main/dist/musicbrainz-work-lyrics-search.user.js
// @updateURL    https://github.com/ibmibmibm/userscripts/raw/main/dist/musicbrainz-work-lyrics-search.user.js
// @match        https://musicbrainz.org/work/*/edit*
// @match        https://musicbrainz.org/work/create*
// @match        https://beta.musicbrainz.org/work/*/edit*
// @match        https://beta.musicbrainz.org/work/create*
// @grant        GM_xmlhttpRequest
// @connect      j-lyric.net
// @connect      utaten.com
// @connect      www.uta-net.com
// @connect      kashinavi.com
// @connect      petitlyrics.com
// @connect      www.joysound.com
// @run-at       document-end
// ==/UserScript==
```

- [ ] **Step 3: Write `src/types.ts`**

```ts
export interface Query {
  title: string;
  artist: string;
  lyricist: string;
  composer: string;
}

export type Field = keyof Query;

export const FIELDS: Field[] = ["title", "artist", "lyricist", "composer"];

/** One search result row. Fields the site does not list are "". */
export interface Row {
  url: string;
  title: string;
  artist: string;
  lyricist: string;
  composer: string;
}

export interface Site {
  id: string; // "j-lyric"
  name: string; // "J-Lyric"
  origin: string; // "https://j-lyric.net"
  charset?: string; // "shift_jis" for pages that are not UTF-8
  buildUrl(q: Query): string;
  parse(doc: Document, origin: string): Row[];
}

export interface ScoredRow {
  row: Row;
  score: number;
  matched: Field[];
}

export interface WorkPeople {
  artist: string;
  lyricist: string;
  composer: string;
}

export interface PageInfo {
  kind: "edit" | "create";
  mbid: string | null;
  title: string;
}
```

- [ ] **Step 4: Write `test/helpers.ts`**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

export function fixtureHtml(name: string): string {
  return readFileSync(`${FIXTURES}${name}.html`, "utf8");
}

/** A lyrics site search results page. The fixture is a fragment of the page. */
export function siteDocument(name: string, url: string): Document {
  return new JSDOM(`<!doctype html><html><body>${fixtureHtml(name)}</body></html>`, { url }).window.document;
}

const EDIT_URL = "https://musicbrainz.org/work/d2364f4b-3c9a-4698-af3e-0ec10eb52cf8/edit";
const CREATE_URL = "https://musicbrainz.org/work/create";

/** The work edit page fixture (fieldsets and the external links editor). */
export function editDocument(): Document {
  return new JSDOM(`<!doctype html><html><body>${fixtureHtml("mb-work-edit")}</body></html>`, { url: EDIT_URL }).window.document;
}

/** The same markup with an empty name and no existing links, at the create URL. */
export function createDocument(): Document {
  const doc = new JSDOM(`<!doctype html><html><body>${fixtureHtml("mb-work-edit")}</body></html>`, { url: CREATE_URL }).window.document;
  doc.querySelector<HTMLInputElement>("#id-edit-work\\.name")!.value = "";
  for (const tr of Array.from(doc.querySelectorAll("#external-links-editor tr"))) {
    if (!tr.querySelector("input[type=url]")) tr.remove();
  }
  return doc;
}

export function emptyDocument(url = "https://example.invalid/"): Document {
  return new JSDOM("<!doctype html><html><body></body></html>", { url }).window.document;
}

export function mbJson(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8"));
}
```

- [ ] **Step 5: Write the failing test `test/normalize.test.ts`**

```ts
import { fold, namesMatch, namesOverlap, splitNames, titlesMatch } from "../src/normalize";

describe("fold", () => {
  it("applies NFKC, lower case, and strips spaces and separators", () => {
    expect(fold("Ｌｅｍｏｎ")).toBe("lemon");
    expect(fold("畑　亜貴")).toBe("畑亜貴");
    expect(fold("Aki Hata")).toBe("akihata");
    expect(fold("TAK feat. 初音ミク")).toBe("takfeat.初音ミク");
    expect(fold("鈴木・田中, 佐藤，山田、")).toBe("鈴木田中佐藤山田");
    expect(fold("  ")).toBe("");
  });
});

describe("splitNames", () => {
  it("splits on ' / ' and drops empty parts", () => {
    expect(splitNames("畑亜貴 / 伊藤真澄")).toEqual(["畑亜貴", "伊藤真澄"]);
    expect(splitNames(" 米津玄師 ")).toEqual(["米津玄師"]);
    expect(splitNames("")).toEqual([]);
    expect(splitNames("AC/DC")).toEqual(["AC/DC"]);
  });
});

describe("namesMatch", () => {
  it("matches folded names and swapped two-part names", () => {
    expect(namesMatch("畑 亜貴", "畑亜貴")).toBe(true);
    expect(namesMatch("Aki Hata", "Hata Aki")).toBe(true);
    expect(namesMatch("Hata Aki", "aki hata")).toBe(true);
    expect(namesMatch("米津玄師", "米津 玄師")).toBe(true);
    expect(namesMatch("米津玄師", "島津亜矢")).toBe(false);
    expect(namesMatch("", "")).toBe(false);
    expect(namesMatch("a b c", "c b a")).toBe(false);
  });
});

describe("namesOverlap", () => {
  it("is true when any name on either side matches", () => {
    expect(namesOverlap("畑亜貴 / 伊藤真澄", "伊藤 真澄")).toBe(true);
    expect(namesOverlap("KENZIE", "Rouno / no2zcat / KENZIE")).toBe(true);
    expect(namesOverlap("畑亜貴", "伊藤真澄")).toBe(false);
  });
});

describe("titlesMatch", () => {
  it("compares folded titles without the swap rule", () => {
    expect(titlesMatch("Lemon", "ＬＥＭＯＮ")).toBe(true);
    expect(titlesMatch("SPINDLE STORY", "spindle story")).toBe(true);
    expect(titlesMatch("Lemon Tang", "Tang Lemon")).toBe(false);
    expect(titlesMatch("Lemon", "Lemon(ドラマ 「アンナチュラル」 主題歌)")).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/normalize.test.ts`
Expected: FAIL, cannot resolve `../src/normalize`.

- [ ] **Step 7: Write `src/normalize.ts`**

```ts
const STRIP = /[\s　・･·,，、]/g;

/** NFKC, lower case, no whitespace, no name separators. */
export function fold(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(STRIP, "");
}

/** "畑亜貴 / 伊藤真澄" -> ["畑亜貴", "伊藤真澄"]. */
export function splitNames(s: string): string[] {
  return s
    .split(" / ")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

/** "Aki Hata" -> "Hata Aki"; null unless the name has exactly two parts. */
function swapped(s: string): string | null {
  const parts = s.normalize("NFKC").trim().split(/\s+/);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : null;
}

/** Folded equality, or equality after swapping family and given name. */
export function namesMatch(a: string, b: string): boolean {
  const fa = fold(a);
  const fb = fold(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const sa = swapped(a);
  const sb = swapped(b);
  return (sa !== null && fold(sa) === fb) || (sb !== null && fold(sb) === fa);
}

/** True when any name in a matches any name in b. */
export function namesOverlap(a: string, b: string): boolean {
  const bs = splitNames(b);
  return splitNames(a).some((x) => bs.some((y) => namesMatch(x, y)));
}

export function titlesMatch(a: string, b: string): boolean {
  const fa = fold(a);
  return fa.length > 0 && fa === fold(b);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/normalize.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Commit**

```bash
git add scripts/musicbrainz-work-lyrics-search/header.txt scripts/musicbrainz-work-lyrics-search/src/types.ts scripts/musicbrainz-work-lyrics-search/src/normalize.ts scripts/musicbrainz-work-lyrics-search/test/helpers.ts scripts/musicbrainz-work-lyrics-search/test/normalize.test.ts
git commit -m "Add the lyrics search script header, types, and name normalization"
```

---

### Task 2: Ranking

**Files:**
- Create: `scripts/musicbrainz-work-lyrics-search/src/rank.ts`
- Test: `scripts/musicbrainz-work-lyrics-search/test/rank.test.ts`

**Interfaces:**
- Consumes: `Query`, `Row`, `ScoredRow`, `FIELDS` from `types.ts`; `namesOverlap`, `titlesMatch` from `normalize.ts`.
- Produces: `scoreRow(query: Query, row: Row): ScoredRow`, `rankRows(query: Query, rows: Row[]): ScoredRow[]`.

- [ ] **Step 1: Write the failing test `test/rank.test.ts`**

```ts
import { rankRows, scoreRow } from "../src/rank";
import type { Query, Row } from "../src/types";

const q: Query = { title: "Lemon", artist: "米津玄師", lyricist: "米津玄師", composer: "米津玄師" };
const row = (over: Partial<Row>): Row => ({ url: "https://example.invalid/1", title: "", artist: "", lyricist: "", composer: "", ...over });

describe("scoreRow", () => {
  it("counts fields that are filled on both sides and match", () => {
    const s = scoreRow(q, row({ title: "Lemon(ドラマ 「アンナチュラル」 主題歌)", artist: "米津 玄師", lyricist: "米津玄師", composer: "米津玄師" }));
    expect(s.score).toBe(3);
    expect(s.matched).toEqual(["artist", "lyricist", "composer"]);
  });

  it("ignores fields that are empty in the query or the row", () => {
    const s = scoreRow({ ...q, lyricist: "", composer: "" }, row({ title: "LEMON", artist: "米津玄師", lyricist: "someone" }));
    expect(s.score).toBe(2);
    expect(s.matched).toEqual(["title", "artist"]);
  });

  it("matches any of several names in the query", () => {
    const s = scoreRow({ ...q, composer: "伊藤真澄 / 米津玄師" }, row({ composer: "米津玄師" }));
    expect(s.matched).toEqual(["composer"]);
  });
});

describe("rankRows", () => {
  it("sorts by score, then keeps the site order", () => {
    const rows = [
      row({ url: "a", title: "Lemonade", artist: "aespa" }),
      row({ url: "b", title: "Lemon", artist: "島津亜矢" }),
      row({ url: "c", title: "Lemon", artist: "米津玄師" }),
      row({ url: "d", title: "LEMON", artist: "serial TV drama" }),
    ];
    expect(rankRows(q, rows).map((s) => `${s.row.url}:${s.score}`)).toEqual(["c:2", "b:1", "d:1", "a:0"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/rank.test.ts`
Expected: FAIL, cannot resolve `../src/rank`.

- [ ] **Step 3: Write `src/rank.ts`**

```ts
import { namesOverlap, titlesMatch } from "./normalize";
import { FIELDS, type Field, type Query, type Row, type ScoredRow } from "./types";

function fieldMatches(field: Field, query: string, value: string): boolean {
  if (!query.trim() || !value.trim()) return false;
  return field === "title" ? titlesMatch(query, value) : namesOverlap(query, value);
}

export function scoreRow(query: Query, row: Row): ScoredRow {
  const matched = FIELDS.filter((f) => fieldMatches(f, query[f], row[f]));
  return { row, score: matched.length, matched };
}

/** Highest score first; equal scores keep the site's order. */
export function rankRows(query: Query, rows: Row[]): ScoredRow[] {
  return rows
    .map((row, index) => ({ scored: scoreRow(query, row), index }))
    .sort((a, b) => b.scored.score - a.scored.score || a.index - b.index)
    .map((x) => x.scored);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/rank.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/musicbrainz-work-lyrics-search/src/rank.ts scripts/musicbrainz-work-lyrics-search/test/rank.test.ts
git commit -m "Rank lyrics search rows by matched fields"
```

---

### Task 3: MusicBrainz web service lookups

**Files:**
- Create: `scripts/musicbrainz-work-lyrics-search/src/musicbrainz.ts`
- Test: `scripts/musicbrainz-work-lyrics-search/test/musicbrainz.test.ts`

**Interfaces:**
- Consumes: `WorkPeople` from `types.ts`; fixtures `mb-work-artist-rels.json` (work SPINDLE STORY with relations composer 伊藤真澄 and lyricist 畑亜貴) and `mb-recordings-by-work.json` (one recording "spindle story" credited to 結城アイラ).
- Produces: `mbidFromUrl(href: string): string | null`, `type FetchJson = (url: string) => Promise<unknown>`, `fetchJson: FetchJson` (browser default with one retry on 503), `peopleFromWork(json: unknown): { lyricist: string; composer: string }`, `artistFromRecordings(json: unknown): string`, `lookupWorkPeople(mbid: string, fetchJson: FetchJson): Promise<WorkPeople>`.

- [ ] **Step 1: Write the failing test `test/musicbrainz.test.ts`**

```ts
import { artistFromRecordings, fetchJson, lookupWorkPeople, mbidFromUrl, peopleFromWork } from "../src/musicbrainz";
import { mbJson } from "./helpers";

const MBID = "d2364f4b-3c9a-4698-af3e-0ec10eb52cf8";

describe("mbidFromUrl", () => {
  it("reads the MBID from a work edit URL", () => {
    expect(mbidFromUrl(`https://musicbrainz.org/work/${MBID}/edit`)).toBe(MBID);
    expect(mbidFromUrl(`https://beta.musicbrainz.org/work/${MBID.toUpperCase()}/edit?returnto=1`)).toBe(MBID);
    expect(mbidFromUrl("https://musicbrainz.org/work/create")).toBeNull();
    expect(mbidFromUrl(`https://musicbrainz.org/work/${MBID}`)).toBeNull();
  });
});

describe("peopleFromWork", () => {
  it("joins lyricist and composer names from artist relations", () => {
    expect(peopleFromWork(mbJson("mb-work-artist-rels"))).toEqual({ lyricist: "畑亜貴", composer: "伊藤真澄" });
  });

  it("deduplicates names and ignores other relation types", () => {
    const json = {
      relations: [
        { type: "lyricist", artist: { name: "A" } },
        { type: "lyricist", artist: { name: "A" } },
        { type: "lyricist", artist: { name: "B" } },
        { type: "composer", artist: { name: "B" } },
        { type: "publisher", label: { name: "L" } },
      ],
    };
    expect(peopleFromWork(json)).toEqual({ lyricist: "A / B", composer: "B" });
    expect(peopleFromWork({})).toEqual({ lyricist: "", composer: "" });
  });
});

describe("artistFromRecordings", () => {
  it("joins the distinct artist credit phrases", () => {
    expect(artistFromRecordings(mbJson("mb-recordings-by-work"))).toBe("結城アイラ");
    const json = {
      recordings: [
        { "artist-credit": [{ name: "A", joinphrase: " feat. " }, { name: "B", joinphrase: "" }] },
        { "artist-credit": [{ name: "A", joinphrase: " feat. " }, { name: "B", joinphrase: "" }] },
        { "artist-credit": [{ name: "C", joinphrase: "" }] },
      ],
    };
    expect(artistFromRecordings(json)).toBe("A feat. B / C");
    expect(artistFromRecordings({})).toBe("");
  });
});

describe("lookupWorkPeople", () => {
  it("requests the work and its recordings and merges the names", async () => {
    const urls: string[] = [];
    const fake = async (url: string) => {
      urls.push(url);
      return url.includes("/work/") ? mbJson("mb-work-artist-rels") : mbJson("mb-recordings-by-work");
    };
    await expect(lookupWorkPeople(MBID, fake)).resolves.toEqual({ artist: "結城アイラ", lyricist: "畑亜貴", composer: "伊藤真澄" });
    expect(urls).toEqual([
      `https://musicbrainz.org/ws/2/work/${MBID}?inc=artist-rels&fmt=json`,
      `https://musicbrainz.org/ws/2/recording?work=${MBID}&inc=artist-credits&fmt=json&limit=100`,
    ]);
  });
});

describe("fetchJson", () => {
  it("sends Accept json, retries once on 503, and throws on other errors", async () => {
    const calls: RequestInit[] = [];
    let status = 503;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      calls.push(init ?? {});
      const s = status;
      status = 200;
      return { ok: s === 200, status: s, json: async () => ({ ok: true }) } as Response;
    }) as unknown as typeof fetch;
    await expect(fetchJson("https://musicbrainz.org/ws/2/x", { fetchFn, sleep: async () => {} })).resolves.toEqual({ ok: true });
    expect(calls.length).toBe(2);
    expect((calls[0].headers as Record<string, string>).Accept).toBe("application/json");
    const bad = (async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    await expect(fetchJson("https://musicbrainz.org/ws/2/x", { fetchFn: bad })).rejects.toThrow("HTTP 500");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/musicbrainz.test.ts`
Expected: FAIL, cannot resolve `../src/musicbrainz`.

- [ ] **Step 3: Write `src/musicbrainz.ts`**

```ts
import type { WorkPeople } from "./types";

const WS = "https://musicbrainz.org/ws/2/";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EDIT_PATH = new RegExp(`^/work/(${UUID})/edit$`, "i");

type Json = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function arr(v: unknown): Json[] {
  return Array.isArray(v) ? (v as Json[]) : [];
}

/** Lower-cased MBID from a work edit URL, null for other pages. */
export function mbidFromUrl(href: string): string | null {
  let path: string;
  try {
    path = new URL(href).pathname;
  } catch {
    return null;
  }
  const m = EDIT_PATH.exec(path);
  return m ? m[1].toLowerCase() : null;
}

export type FetchJson = (url: string) => Promise<unknown>;

export interface FetchOptions {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** GET JSON from the web service; retries once after two seconds on 503. */
export async function fetchJson(url: string, opts: FetchOptions = {}): Promise<unknown> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (res.status === 503 && attempt < 1) {
      await sleep(2000);
      continue;
    }
    if (!res.ok) throw new Error(`MusicBrainz responded with HTTP ${res.status}`);
    return res.json();
  }
}

function unique(names: string[]): string[] {
  return names.filter((n, i) => n.length > 0 && names.indexOf(n) === i);
}

/** Names of related artists with link type "lyricist" and "composer", joined with " / ". */
export function peopleFromWork(json: unknown): { lyricist: string; composer: string } {
  const rels = arr((json as Json)?.relations);
  const names = (type: string) => unique(rels.filter((r) => str(r.type) === type && r.artist).map((r) => str((r.artist as Json).name))).join(" / ");
  return { lyricist: names("lyricist"), composer: names("composer") };
}

/** Distinct artist credit phrases of the recordings, joined with " / ". */
export function artistFromRecordings(json: unknown): string {
  const recordings = arr((json as Json)?.recordings);
  const phrases = recordings.map((rec) => arr(rec["artist-credit"]).map((c) => str(c.name) + str(c.joinphrase)).join(""));
  return unique(phrases).join(" / ");
}

export async function lookupWorkPeople(mbid: string, fetchJsonFn: FetchJson): Promise<WorkPeople> {
  const work = await fetchJsonFn(`${WS}work/${mbid}?inc=artist-rels&fmt=json`);
  const recordings = await fetchJsonFn(`${WS}recording?work=${mbid}&inc=artist-credits&fmt=json&limit=100`);
  return { artist: artistFromRecordings(recordings), ...peopleFromWork(work) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/musicbrainz.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/musicbrainz-work-lyrics-search/src/musicbrainz.ts scripts/musicbrainz-work-lyrics-search/test/musicbrainz.test.ts
git commit -m "Look up work writers and performers from the MusicBrainz web service"
```

---

### Task 4: Site modules for j-lyric, utaten, and uta-net

**Files:**
- Create: `scripts/musicbrainz-work-lyrics-search/src/sites/util.ts`
- Create: `scripts/musicbrainz-work-lyrics-search/src/sites/j-lyric.ts`
- Create: `scripts/musicbrainz-work-lyrics-search/src/sites/utaten.ts`
- Create: `scripts/musicbrainz-work-lyrics-search/src/sites/uta-net.ts`
- Test: `scripts/musicbrainz-work-lyrics-search/test/sites.test.ts`

**Interfaces:**
- Consumes: `Site`, `Query`, `Row` from `types.ts`; `siteDocument` from `test/helpers.ts`.
- Produces: `text(el: Element | null): string`, `abs(origin: string, href: string | null): string`, `withParams(base: string, params: Record<string, string>): string` (drops empty values), `row(partial: Partial<Row> & { url: string }): Row`; sites `jLyric`, `utaten`, `utaNet` (each `Site`).

- [ ] **Step 1: Write the failing test `test/sites.test.ts` (first half)**

```ts
import { jLyric } from "../src/sites/j-lyric";
import { utaNet } from "../src/sites/uta-net";
import { utaten } from "../src/sites/utaten";
import type { Query } from "../src/types";
import { siteDocument } from "./helpers";

const full: Query = { title: "Lemon", artist: "米津玄師", lyricist: "米津玄師", composer: "米津 玄師" };
const titleOnly: Query = { title: "Lemon", artist: "", lyricist: "", composer: "" };

describe("j-lyric", () => {
  it("builds a contains-match title and artist search", () => {
    expect(jLyric.buildUrl(full)).toBe("https://j-lyric.net/search.php?kt=Lemon&ct=2&ka=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&ca=2");
    expect(jLyric.buildUrl(titleOnly)).toBe("https://j-lyric.net/search.php?kt=Lemon&ct=2");
  });

  it("parses title and artist rows", () => {
    const rows = jLyric.parse(siteDocument("j-lyric-search", "https://j-lyric.net/search.php?kt=Lemon&ct=2"), jLyric.origin);
    expect(rows.length).toBe(6);
    expect(rows[0]).toEqual({ url: "https://j-lyric.net/artist/a0670a8/l0626df.html", title: "Beautiful Lemonade", artist: "material club", lyricist: "", composer: "" });
    expect(rows[4]).toEqual({ url: "https://j-lyric.net/artist/a0579b7/l044ef6.html", title: "Lemon", artist: "米津玄師", lyricist: "", composer: "" });
  });
});

describe("utaten", () => {
  it("sends all four fields", () => {
    expect(utaten.buildUrl(full)).toBe("https://utaten.com/search?title=Lemon&artist_name=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&lyricist=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&composer=%E7%B1%B3%E6%B4%A5+%E7%8E%84%E5%B8%AB");
    expect(utaten.buildUrl(titleOnly)).toBe("https://utaten.com/search?title=Lemon");
  });

  it("parses title, artist, lyricist, and composer rows", () => {
    const rows = utaten.parse(siteDocument("utaten-search", "https://utaten.com/search?title=Lemon"), utaten.origin);
    expect(rows.length).toBe(5);
    expect(rows[0]).toEqual({ url: "https://utaten.com/lyric/sz26060401/", title: "LEMONADE", artist: "aespa", lyricist: "", composer: "" });
    expect(rows[1]).toEqual({ url: "https://utaten.com/lyric/sa18020902/", title: "Lemon(ドラマ 「アンナチュラル」 主題歌)", artist: "米津玄師", lyricist: "米津玄師", composer: "米津玄師" });
    expect(rows[4].lyricist).toBe("KENZIE");
    expect(rows[4].composer).toBe("Rouno / no2zcat / Andrew Choi / KENZIE / JSONG");
  });
});

describe("uta-net", () => {
  it("sends the title only", () => {
    expect(utaNet.buildUrl(full)).toBe("https://www.uta-net.com/search/?target=songtitle&type=in&Keyword=Lemon");
  });

  it("parses the song list table", () => {
    const rows = utaNet.parse(siteDocument("uta-net-search", "https://www.uta-net.com/search/?target=songtitle&type=in&Keyword=Lemon"), utaNet.origin);
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual({ url: "https://www.uta-net.com/song/268773/", title: "California Lemon Trees", artist: "少年ナイフ", lyricist: "Naoko", composer: "Naoko" });
    expect(rows[2]).toEqual({ url: "https://www.uta-net.com/song/314771/", title: "SUGAR×LEMONADE", artist: "シュガーポケッツ", lyricist: "永井正道", composer: "永井正道" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/sites.test.ts`
Expected: FAIL, cannot resolve `../src/sites/j-lyric`.

- [ ] **Step 3: Write `src/sites/util.ts`**

```ts
import type { Row } from "../types";

/** Text content with whitespace runs collapsed and trimmed; "" for null. */
export function text(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Absolute URL for a page link; "" when the href is missing. */
export function abs(origin: string, href: string | null | undefined): string {
  if (!href) return "";
  try {
    return new URL(href, origin).toString();
  } catch {
    return "";
  }
}

/** base + "?" + params, in the given order, without empty values. */
export function withParams(base: string, params: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v.trim()) p.set(k, v.trim());
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function row(partial: Partial<Row> & { url: string }): Row {
  return { title: "", artist: "", lyricist: "", composer: "", ...partial };
}
```

- [ ] **Step 4: Write `src/sites/j-lyric.ts`**

```ts
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
```

- [ ] **Step 5: Write `src/sites/utaten.ts`**

```ts
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
```

- [ ] **Step 6: Write `src/sites/uta-net.ts`**

```ts
import type { Query, Row, Site } from "../types";
import { abs, row, text, withParams } from "./util";

export const utaNet: Site = {
  id: "uta-net",
  name: "歌ネット",
  origin: "https://www.uta-net.com",
  buildUrl(q: Query): string {
    return withParams("https://www.uta-net.com/search/", { target: "songtitle", type: "in", Keyword: q.title });
  },
  parse(doc: Document, origin: string): Row[] {
    const rows: Row[] = [];
    for (const tr of Array.from(doc.querySelectorAll("table tbody tr"))) {
      const title = tr.querySelector(".songlist-title");
      const link = tr.querySelector("td a");
      if (!title || !link) continue;
      const cells = tr.querySelectorAll("td");
      rows.push(
        row({
          url: abs(origin, link.getAttribute("href")),
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
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/sites.test.ts`
Expected: PASS (6 tests). If the utaten composer of row 4 differs, print `rows[4]` and adjust only the parser (the fixture is fixed).

- [ ] **Step 8: Commit**

```bash
git add scripts/musicbrainz-work-lyrics-search/src/sites scripts/musicbrainz-work-lyrics-search/test/sites.test.ts
git commit -m "Add j-lyric, utaten, and uta-net search modules"
```

---

### Task 5: Site modules for kashinavi, petitlyrics, and JOYSOUND, and the site list

**Files:**
- Create: `scripts/musicbrainz-work-lyrics-search/src/sites/kashinavi.ts`
- Create: `scripts/musicbrainz-work-lyrics-search/src/sites/petitlyrics.ts`
- Create: `scripts/musicbrainz-work-lyrics-search/src/sites/joysound.ts`
- Create: `scripts/musicbrainz-work-lyrics-search/src/sites/index.ts`
- Modify: `scripts/musicbrainz-work-lyrics-search/test/sites.test.ts` (append)

**Interfaces:**
- Consumes: `util.ts` helpers from Task 4.
- Produces: sites `kashinavi` (with `charset: "shift_jis"`), `petitlyrics`, `joysound`; `SITES: Site[]` in the order j-lyric, utaten, uta-net, kashinavi, petitlyrics, joysound; `MUSIXMATCH_SEARCH = "https://www.musixmatch.com/search"`.

- [ ] **Step 1: Append the failing tests to `test/sites.test.ts`**

Add these imports at the top:

```ts
import { SITES } from "../src/sites";
import { joysound } from "../src/sites/joysound";
import { kashinavi } from "../src/sites/kashinavi";
import { petitlyrics } from "../src/sites/petitlyrics";
```

Append these blocks:

```ts
describe("kashinavi", () => {
  it("sends all four fields and declares Shift_JIS", () => {
    expect(kashinavi.charset).toBe("shift_jis");
    expect(kashinavi.buildUrl(full)).toBe("https://kashinavi.com/search.php?kyoku=Lemon&kashu=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&sakushi=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&sakkyoku=%E7%B1%B3%E6%B4%A5+%E7%8E%84%E5%B8%AB&start=1");
    expect(kashinavi.buildUrl(titleOnly)).toBe("https://kashinavi.com/search.php?kyoku=Lemon&start=1");
  });

  it("parses title and artist rows from the result table", () => {
    const rows = kashinavi.parse(siteDocument("kashinavi-search", "https://kashinavi.com/search.php?kyoku=Lemon&start=1"), kashinavi.origin);
    expect(rows.length).toBe(6);
    expect(rows[0]).toEqual({ url: "https://kashinavi.com/lyrics/159368/", title: "Lime & Lemon", artist: "東方神起", lyricist: "", composer: "" });
    expect(rows[5].title).toBe("フェス!!最高 (from 2010.5.17 渋谷C.C.Lemonホール)");
    expect(rows[5].artist).toBe("グループ魂");
  });
});

describe("petitlyrics", () => {
  it("sends title and artist", () => {
    expect(petitlyrics.buildUrl(full)).toBe("https://petitlyrics.com/search_lyrics?title=Lemon&artist=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB");
    expect(petitlyrics.buildUrl(titleOnly)).toBe("https://petitlyrics.com/search_lyrics?title=Lemon");
  });

  it("parses title and artist rows", () => {
    const rows = petitlyrics.parse(siteDocument("petitlyrics-search", "https://petitlyrics.com/search_lyrics?title=Lemon"), petitlyrics.origin);
    expect(rows.length).toBe(5);
    expect(rows[0]).toEqual({ url: "https://petitlyrics.com/lyrics/146932", title: "LEMON", artist: "serial TV drama", lyricist: "", composer: "" });
    expect(rows[4]).toEqual({ url: "https://petitlyrics.com/lyrics/1177020", title: "LEMON TEA", artist: "SHEENA & THE ROKKETS", lyricist: "", composer: "" });
  });
});

describe("joysound", () => {
  it("sends the title as the keyword", () => {
    expect(joysound.buildUrl(full)).toBe("https://www.joysound.com/web/search/song?keyword=Lemon&match=1");
  });

  it("parses song cards", () => {
    const rows = joysound.parse(siteDocument("joysound-search", "https://www.joysound.com/web/search/song?keyword=Lemon&match=1"), joysound.origin);
    expect(rows.length).toBe(5);
    expect(rows[0]).toEqual({ url: "https://www.joysound.com/web/search/song/669975", title: "Lemon", artist: "米津玄師", lyricist: "", composer: "" });
    expect(rows[3]).toEqual({ url: "https://www.joysound.com/web/search/song/5904587", title: "LEMONADE", artist: "aespa (aespa)", lyricist: "", composer: "" });
  });
});

describe("SITES", () => {
  it("lists the six sites in display order with unique ids", () => {
    expect(SITES.map((s) => s.id)).toEqual(["j-lyric", "utaten", "uta-net", "kashinavi", "petitlyrics", "joysound"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/sites.test.ts`
Expected: FAIL, cannot resolve `../src/sites`.

- [ ] **Step 3: Write `src/sites/kashinavi.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/sites/petitlyrics.ts`**

```ts
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
```

- [ ] **Step 5: Write `src/sites/joysound.ts`**

```ts
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
```

- [ ] **Step 6: Write `src/sites/index.ts`**

```ts
import type { Site } from "../types";
import { jLyric } from "./j-lyric";
import { joysound } from "./joysound";
import { kashinavi } from "./kashinavi";
import { petitlyrics } from "./petitlyrics";
import { utaNet } from "./uta-net";
import { utaten } from "./utaten";

export const SITES: Site[] = [jLyric, utaten, utaNet, kashinavi, petitlyrics, joysound];

export const MUSIXMATCH_SEARCH = "https://www.musixmatch.com/search";
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/sites.test.ts`
Expected: PASS (13 tests). If a kashinavi row count differs, print the parsed rows: the fixture table has unclosed `<tr>` tags and jsdom builds one `tr` per row; adjust only the selector.

- [ ] **Step 8: Commit**

```bash
git add scripts/musicbrainz-work-lyrics-search/src/sites scripts/musicbrainz-work-lyrics-search/test/sites.test.ts
git commit -m "Add kashinavi, petitlyrics, and JOYSOUND search modules"
```

---

### Task 6: External links editor helpers

**Files:**
- Create: `scripts/musicbrainz-work-lyrics-search/src/links.ts`
- Test: `scripts/musicbrainz-work-lyrics-search/test/links.test.ts`

**Interfaces:**
- Consumes: `editDocument()` from helpers (two existing `a.url` links and one empty `input[type=url]`).
- Produces: `normalizeUrl(url: string): string`, `existingLinks(doc: Document): Set<string>`, `hasLink(doc: Document, url: string): boolean`, `addLink(doc: Document, url: string, sleep?: (ms: number) => Promise<void>): Promise<boolean>`.

- [ ] **Step 1: Write the failing test `test/links.test.ts`**

```ts
import { addLink, existingLinks, hasLink, normalizeUrl } from "../src/links";
import { createDocument, editDocument, emptyDocument } from "./helpers";

const JL = "https://j-lyric.net/artist/a04d770/l01afdb.html";
const NEW = "https://utaten.com/lyric/sa18020902/";

/** Makes the fixture editor behave like MusicBrainz: on input, add a new empty url input. */
function reactLikeEditor(doc: Document): void {
  doc.querySelector("#external-links-editor")!.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.value) return;
    const tr = doc.createElement("tr");
    tr.className = "external-link-item";
    tr.innerHTML = '<td></td><td class="link-actions"></td><td><input class="value with-button" placeholder="Add another link" type="url" value=""></td>';
    input.closest("tbody")!.appendChild(tr);
  });
}

describe("existingLinks", () => {
  it("collects link hrefs and non-empty url inputs, without trailing slashes", () => {
    const doc = editDocument();
    expect(Array.from(existingLinks(doc))).toEqual([JL, "https://www.uta-net.com/song/96028"]);
    expect(hasLink(doc, JL)).toBe(true);
    expect(hasLink(doc, "https://www.uta-net.com/song/96028/")).toBe(true);
    expect(hasLink(doc, NEW)).toBe(false);
    expect(normalizeUrl(" https://x.invalid/a/ ")).toBe("https://x.invalid/a");
    expect(existingLinks(emptyDocument()).size).toBe(0);
  });
});

describe("addLink", () => {
  it("writes the URL into the empty input, fires input, and resolves true when the editor reacts", async () => {
    const doc = editDocument();
    reactLikeEditor(doc);
    await expect(addLink(doc, NEW, async () => {})).resolves.toBe(true);
    const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>("#external-links-editor input[type=url]")).map((i) => i.value);
    expect(inputs).toEqual([NEW, ""]);
    expect(hasLink(doc, NEW)).toBe(true);
  });

  it("resolves false when the editor does not react or is missing", async () => {
    let waited = 0;
    await expect(addLink(editDocument(), NEW, async () => void waited++)).resolves.toBe(false);
    expect(waited).toBe(10);
    await expect(addLink(emptyDocument(), NEW, async () => {})).resolves.toBe(false);
  });

  it("works on the create page fixture", async () => {
    const doc = createDocument();
    reactLikeEditor(doc);
    await expect(addLink(doc, NEW, async () => {})).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/links.test.ts`
Expected: FAIL, cannot resolve `../src/links`.

- [ ] **Step 3: Write `src/links.ts`**

```ts
const EDITOR = "#external-links-editor";

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function urlInputs(doc: Document): HTMLInputElement[] {
  return Array.from(doc.querySelectorAll<HTMLInputElement>(`${EDITOR} input[type=url]`));
}

/** URLs already in the external links editor: saved links and typed inputs. */
export function existingLinks(doc: Document): Set<string> {
  const urls = new Set<string>();
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>(`${EDITOR} a.url`))) {
    const href = normalizeUrl(a.getAttribute("href") ?? "");
    if (href) urls.add(href);
  }
  for (const input of urlInputs(doc)) {
    const v = normalizeUrl(input.value);
    if (v) urls.add(v);
  }
  return urls;
}

export function hasLink(doc: Document, url: string): boolean {
  return existingLinks(doc).has(normalizeUrl(url));
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Writes the URL into the empty url input the way a user would type it, then
 * waits up to one second for the editor to add a fresh empty input.
 */
export async function addLink(doc: Document, url: string, sleep: (ms: number) => Promise<void> = defaultSleep): Promise<boolean> {
  const win = doc.defaultView;
  const input = urlInputs(doc).find((i) => i.value === "");
  if (!win || !input) return false;
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
  if (!setter) return false;
  setter.call(input, url);
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  for (let i = 0; i < 10; i++) {
    const inputs = urlInputs(doc);
    if (inputs.some((x) => x.value === url) && inputs.some((x) => x.value === "")) return true;
    await sleep(100);
  }
  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/links.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/musicbrainz-work-lyrics-search/src/links.ts scripts/musicbrainz-work-lyrics-search/test/links.test.ts
git commit -m "Read and add external links on the work edit page"
```

---

### Task 7: GM_xmlhttpRequest wrapper

**Files:**
- Create: `scripts/musicbrainz-work-lyrics-search/src/fetch.ts`
- Test: `scripts/musicbrainz-work-lyrics-search/test/fetch.test.ts`

**Interfaces:**
- Produces: `interface GmResponse { status: number; responseText: string }`, `interface GmDetails { method: "GET"; url: string; timeout: number; overrideMimeType?: string; onload: (r: GmResponse) => void; onerror: () => void; ontimeout: () => void }`, `type GmRequest = (d: GmDetails) => void`, `gmFetchText(url: string, charset: string | undefined, request: GmRequest): Promise<string>`.

- [ ] **Step 1: Write the failing test `test/fetch.test.ts`**

```ts
import { gmFetchText, type GmDetails } from "../src/fetch";

describe("gmFetchText", () => {
  it("resolves the response text on 2xx and passes the charset as a mime override", async () => {
    let seen: GmDetails | null = null;
    const request = (d: GmDetails) => {
      seen = d;
      d.onload({ status: 200, responseText: "<p>ok</p>" });
    };
    await expect(gmFetchText("https://kashinavi.com/search.php?kyoku=x", "shift_jis", request)).resolves.toBe("<p>ok</p>");
    expect(seen!.method).toBe("GET");
    expect(seen!.timeout).toBe(15000);
    expect(seen!.overrideMimeType).toBe("text/html; charset=shift_jis");
    let plain: GmDetails | null = null;
    await gmFetchText("https://j-lyric.net/", undefined, (d) => ((plain = d), d.onload({ status: 200, responseText: "" })));
    expect(plain!.overrideMimeType).toBeUndefined();
  });

  it("rejects on HTTP errors, network errors, and timeouts", async () => {
    await expect(gmFetchText("u", undefined, (d) => d.onload({ status: 503, responseText: "" }))).rejects.toThrow("HTTP 503");
    await expect(gmFetchText("u", undefined, (d) => d.onerror())).rejects.toThrow("Request failed");
    await expect(gmFetchText("u", undefined, (d) => d.ontimeout())).rejects.toThrow("Timed out");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/fetch.test.ts`
Expected: FAIL, cannot resolve `../src/fetch`.

- [ ] **Step 3: Write `src/fetch.ts`**

```ts
export interface GmResponse {
  status: number;
  responseText: string;
}

export interface GmDetails {
  method: "GET";
  url: string;
  timeout: number;
  overrideMimeType?: string;
  onload: (r: GmResponse) => void;
  onerror: () => void;
  ontimeout: () => void;
}

export type GmRequest = (d: GmDetails) => void;

/** GET a page through the userscript manager (cross-origin, with the site's cookies). */
export function gmFetchText(url: string, charset: string | undefined, request: GmRequest): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const details: GmDetails = {
      method: "GET",
      url,
      timeout: 15000,
      onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error(`HTTP ${r.status}`))),
      onerror: () => reject(new Error("Request failed")),
      ontimeout: () => reject(new Error("Timed out")),
    };
    if (charset) details.overrideMimeType = `text/html; charset=${charset}`;
    request(details);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/fetch.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/musicbrainz-work-lyrics-search/src/fetch.ts scripts/musicbrainz-work-lyrics-search/test/fetch.test.ts
git commit -m "Wrap GM_xmlhttpRequest for lyrics site requests"
```

---

### Task 8: Panel UI

**Files:**
- Create: `scripts/musicbrainz-work-lyrics-search/src/ui.ts`
- Test: `scripts/musicbrainz-work-lyrics-search/test/ui.test.ts`

**Interfaces:**
- Consumes: `rankRows` (Task 2), `Site`, `Query`, `Row`, `ScoredRow`, `PageInfo`, `WorkPeople`, `FIELDS` (Task 1), `MUSIXMATCH_SEARCH` (Task 5).
- Produces: `MARKER = "mb-lyrics"`, `interface UiDeps { version: string; sites: Site[]; fetchText: (url: string, charset?: string) => Promise<string>; lookupPeople: (mbid: string) => Promise<WorkPeople>; hasLink: (url: string) => boolean; addLink: (url: string) => Promise<boolean> }`, `enhancePage(doc: Document, info: PageInfo, deps: UiDeps): HTMLElement | null` (null when the "External links" fieldset is missing).

Element classes (all prefixed `mb-lyrics-`): `panel` (a `fieldset`, also class `mb-lyrics`), `legend`, `fields`, inputs `title` `artist` `lyricist` `composer`, `search` (button), `musixmatch` (link), `status`, per site `site` (with `data-site="<id>"`), `site-name`, `site-status`, `retry` (button, hidden unless the request failed), `rows` (`ul`), `row` (`li`), `link` (a, target `_blank`, rel `noreferrer`), `hit` (`b` around a matched field), `add` (button), `added` (span with text `added`).

- [ ] **Step 1: Write the failing test `test/ui.test.ts`**

```ts
import { enhancePage, MARKER, type UiDeps } from "../src/ui";
import type { PageInfo, Site } from "../src/types";
import { createDocument, editDocument } from "./helpers";

const MBID = "d2364f4b-3c9a-4698-af3e-0ec10eb52cf8";
const editInfo: PageInfo = { kind: "edit", mbid: MBID, title: "Lemon" };
const createInfo: PageInfo = { kind: "create", mbid: null, title: "" };
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};
const q = <T extends Element>(root: ParentNode, cls: string) => root.querySelector<T>(`.${MARKER}-${cls}`)!;
const qa = (root: ParentNode, cls: string) => Array.from(root.querySelectorAll(`.${MARKER}-${cls}`));

const siteA: Site = {
  id: "a",
  name: "Site A",
  origin: "https://a.invalid",
  buildUrl: (qq) => `https://a.invalid/s?t=${encodeURIComponent(qq.title)}&ar=${encodeURIComponent(qq.artist)}`,
  parse: (doc, origin) =>
    Array.from(doc.querySelectorAll("li")).map((li) => ({
      url: `${origin}${li.getAttribute("data-url")}`,
      title: li.getAttribute("data-title") ?? "",
      artist: li.getAttribute("data-artist") ?? "",
      lyricist: li.getAttribute("data-lyricist") ?? "",
      composer: "",
    })),
};
const siteB: Site = { ...siteA, id: "b", name: "Site B", origin: "https://b.invalid", buildUrl: () => "https://b.invalid/s" };

const PAGE_A = `<ul>
<li data-url="/1" data-title="Lemonade" data-artist="aespa"></li>
<li data-url="/2" data-title="Lemon" data-artist="米津玄師" data-lyricist="米津玄師"></li>
<li data-url="/3" data-title="Lemon" data-artist="島津亜矢"></li>
</ul>`;

function deps(over: Partial<UiDeps> = {}) {
  const fetched: string[] = [];
  const added: string[] = [];
  const d: UiDeps = {
    version: "1.0.0",
    sites: [siteA, siteB],
    fetchText: async (url) => {
      fetched.push(url);
      return url.startsWith("https://a.invalid") ? PAGE_A : "<ul></ul>";
    },
    lookupPeople: async () => ({ artist: "米津玄師", lyricist: "米津玄師", composer: "米津玄師" }),
    hasLink: () => false,
    addLink: async (url) => {
      added.push(url);
      return true;
    },
    ...over,
  };
  return { d, fetched, added };
}

describe("enhancePage", () => {
  it("inserts the panel after the External links fieldset and returns null without it", () => {
    const doc = editDocument();
    const panel = enhancePage(doc, editInfo, deps().d)!;
    expect(panel.classList.contains(MARKER)).toBe(true);
    expect(panel.tagName).toBe("FIELDSET");
    const legends = Array.from(doc.querySelectorAll("fieldset > legend")).map((l) => l.textContent);
    expect(legends.indexOf("External links") + 1).toBe(legends.findIndex((t) => t!.startsWith("Lyrics search")));
    expect(q(panel, "legend").textContent).toBe("Lyrics search (1.0.0)");
    const doc2 = editDocument();
    doc2.querySelector("#external-links-editor")!.closest("fieldset")!.remove();
    expect(enhancePage(doc2, editInfo, deps().d)).toBeNull();
  });

  it("prefills the title at once and the people after the lookup, without overwriting typed text", async () => {
    const doc = editDocument();
    let resolvePeople: (p: { artist: string; lyricist: string; composer: string }) => void = () => {};
    const { d } = deps({ lookupPeople: () => new Promise((r) => (resolvePeople = r)) });
    const panel = enhancePage(doc, editInfo, d)!;
    expect(q<HTMLInputElement>(panel, "title").value).toBe("Lemon");
    expect(q(panel, "status").textContent).toBe("Looking up MusicBrainz…");
    q<HTMLInputElement>(panel, "artist").value = "typed";
    resolvePeople({ artist: "米津玄師", lyricist: "L", composer: "C" });
    await settle();
    expect(q<HTMLInputElement>(panel, "artist").value).toBe("typed");
    expect(q<HTMLInputElement>(panel, "lyricist").value).toBe("L");
    expect(q<HTMLInputElement>(panel, "composer").value).toBe("C");
    expect(q(panel, "status").textContent).toBe("");
  });

  it("reports a failed lookup and does no lookup on the create page", async () => {
    const doc = editDocument();
    const panel = enhancePage(doc, editInfo, deps({ lookupPeople: async () => { throw new Error("HTTP 503"); } }).d)!;
    await settle();
    expect(q(panel, "status").textContent).toBe("MusicBrainz lookup failed: HTTP 503");
    let called = false;
    const panel2 = enhancePage(createDocument(), createInfo, deps({ lookupPeople: async () => ((called = true), { artist: "", lyricist: "", composer: "" }) }).d)!;
    await settle();
    expect(called).toBe(false);
    expect(q<HTMLInputElement>(panel2, "title").value).toBe("");
    expect(q(panel2, "status").textContent).toBe("");
  });

  it("keeps the Musixmatch link in step with title and artist", async () => {
    const doc = editDocument();
    const panel = enhancePage(doc, editInfo, deps().d)!;
    await settle();
    const link = q<HTMLAnchorElement>(panel, "musixmatch");
    expect(link.target).toBe("_blank");
    expect(link.href).toBe("https://www.musixmatch.com/search?query=Lemon%20%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB");
    const artist = q<HTMLInputElement>(panel, "artist");
    artist.value = "";
    artist.dispatchEvent(new doc.defaultView!.Event("input"));
    expect(link.href).toBe("https://www.musixmatch.com/search?query=Lemon");
  });

  it("searches every site with the current fields, ranks rows, and marks matched fields", async () => {
    const doc = editDocument();
    const { d, fetched } = deps();
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLInputElement>(panel, "composer").value = "";
    q<HTMLButtonElement>(panel, "search").click();
    expect(qa(panel, "site-status").map((s) => s.textContent)).toEqual(["Searching…", "Searching…"]);
    await settle();
    expect(fetched).toEqual(["https://a.invalid/s?t=Lemon&ar=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB", "https://b.invalid/s"]);
    const siteEl = panel.querySelector(`.${MARKER}-site[data-site="a"]`)!;
    expect(q(siteEl, "site-status").textContent).toBe("3 results");
    const rows = qa(siteEl, "row");
    expect(rows.map((r) => q<HTMLAnchorElement>(r, "link").href)).toEqual(["https://a.invalid/2", "https://a.invalid/3", "https://a.invalid/1"]);
    expect(rows[0].textContent).toContain("Lemon");
    expect(rows[0].textContent).toContain("米津玄師");
    expect(qa(rows[0], "hit").map((h) => h.textContent)).toEqual(["Lemon", "米津玄師", "米津玄師"]);
    expect(qa(rows[1], "hit").map((h) => h.textContent)).toEqual(["Lemon"]);
    expect(qa(rows[2], "hit").length).toBe(0);
    expect(q<HTMLAnchorElement>(rows[0], "link").target).toBe("_blank");
    expect(q<HTMLAnchorElement>(rows[0], "link").rel).toBe("noreferrer");
    const siteB2 = panel.querySelector(`.${MARKER}-site[data-site="b"]`)!;
    expect(q(siteB2, "site-status").textContent).toBe("No results");
  });

  it("says No results parsed for a long page without rows and ignores clicks while searching", async () => {
    const doc = editDocument();
    let count = 0;
    const { d } = deps({ fetchText: async () => ((count += 1), "<p>" + "x".repeat(1200) + "</p>") });
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLButtonElement>(panel, "search").click();
    q<HTMLButtonElement>(panel, "search").click();
    await settle();
    expect(count).toBe(2);
    expect(qa(panel, "site-status").map((s) => s.textContent)).toEqual(["No results parsed", "No results parsed"]);
  });

  it("shows Request failed with a Retry button that searches that site again", async () => {
    const doc = editDocument();
    let fail = true;
    const { d } = deps({
      fetchText: async (url) => {
        if (url.startsWith("https://b.invalid") && fail) throw new Error("Timed out");
        return url.startsWith("https://a.invalid") ? PAGE_A : "<ul></ul>";
      },
    });
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLButtonElement>(panel, "search").click();
    await settle();
    const siteB2 = panel.querySelector(`.${MARKER}-site[data-site="b"]`)!;
    expect(q(siteB2, "site-status").textContent).toBe("Request failed: Timed out");
    expect(q<HTMLButtonElement>(siteB2, "retry").hidden).toBe(false);
    const siteA2 = panel.querySelector(`.${MARKER}-site[data-site="a"]`)!;
    expect(q<HTMLButtonElement>(siteA2, "retry").hidden).toBe(true);
    fail = false;
    q<HTMLButtonElement>(siteB2, "retry").click();
    expect(q(siteB2, "site-status").textContent).toBe("Searching…");
    await settle();
    expect(q(siteB2, "site-status").textContent).toBe("No results");
    expect(q<HTMLButtonElement>(siteB2, "retry").hidden).toBe(true);
  });

  it("adds a row's URL, marks it added, and marks rows that are already linked", async () => {
    const doc = editDocument();
    const { d, added } = deps({ hasLink: (url) => url === "https://a.invalid/3" });
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLButtonElement>(panel, "search").click();
    await settle();
    const rows = qa(panel.querySelector(`.${MARKER}-site[data-site="a"]`)!, "row");
    expect(rows[1].querySelector(`.${MARKER}-add`)).toBeNull();
    expect(q(rows[1], "added").textContent).toBe("added");
    q<HTMLButtonElement>(rows[0], "add").click();
    await settle();
    expect(added).toEqual(["https://a.invalid/2"]);
    expect(rows[0].querySelector(`.${MARKER}-add`)).toBeNull();
    expect(q(rows[0], "added").textContent).toBe("added");
  });

  it("reports when adding fails and keeps the button", async () => {
    const doc = editDocument();
    const { d } = deps({ addLink: async () => false });
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLButtonElement>(panel, "search").click();
    await settle();
    const row = qa(panel.querySelector(`.${MARKER}-site[data-site="a"]`)!, "row")[0];
    q<HTMLButtonElement>(row, "add").click();
    await settle();
    expect(q(panel, "status").textContent).toBe("Could not add, paste the URL by hand");
    expect(q<HTMLButtonElement>(row, "add").disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/ui.test.ts`
Expected: FAIL, cannot resolve `../src/ui`.

- [ ] **Step 3: Write `src/ui.ts`**

```ts
import { rankRows } from "./rank";
import { MUSIXMATCH_SEARCH } from "./sites";
import { FIELDS, type Field, type PageInfo, type Query, type ScoredRow, type Site, type WorkPeople } from "./types";

export const MARKER = "mb-lyrics";

export interface UiDeps {
  version: string;
  sites: Site[];
  /** GET a lyrics site page through the userscript manager. */
  fetchText: (url: string, charset?: string) => Promise<string>;
  lookupPeople: (mbid: string) => Promise<WorkPeople>;
  /** True when the external links editor already holds the URL. */
  hasLink: (url: string) => boolean;
  /** Writes the URL into the external links editor; false when the editor did not react. */
  addLink: (url: string) => Promise<boolean>;
}

const LABELS: Record<Field, string> = { title: "Title", artist: "Artist", lyricist: "Lyricist", composer: "Composer" };

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (className) e.className = `${MARKER}-${className}`;
  if (text) e.textContent = text;
  return e;
}

interface SiteView {
  site: Site;
  status: HTMLElement;
  retry: HTMLButtonElement;
  rows: HTMLUListElement;
  seq: number;
}

export function enhancePage(doc: Document, info: PageInfo, deps: UiDeps): HTMLElement | null {
  const editor = doc.querySelector("#external-links-editor");
  const anchor = editor?.closest("fieldset");
  if (!anchor) return null;

  const panel = el(doc, "fieldset", "panel");
  panel.classList.add(MARKER);
  panel.appendChild(el(doc, "legend", "legend", `Lyrics search (${deps.version})`));

  const fields = el(doc, "div", "fields");
  const inputs = {} as Record<Field, HTMLInputElement>;
  for (const f of FIELDS) {
    const label = el(doc, "label", "", `${LABELS[f]}: `);
    const input = el(doc, "input", f);
    input.type = "text";
    input.size = 28;
    label.appendChild(input);
    label.style.marginRight = "8px";
    fields.appendChild(label);
    inputs[f] = input;
  }
  inputs.title.value = info.title;
  panel.appendChild(fields);

  const controls = el(doc, "div", "controls");
  const search = el(doc, "button", "search", "Search lyrics");
  search.type = "button";
  const musixmatch = el(doc, "a", "musixmatch", "Search on Musixmatch");
  musixmatch.target = "_blank";
  musixmatch.rel = "noreferrer";
  musixmatch.style.marginLeft = "8px";
  const status = el(doc, "span", "status");
  status.style.marginLeft = "8px";
  controls.append(search, musixmatch, status);
  panel.appendChild(controls);

  const query = (): Query => ({
    title: inputs.title.value.trim(),
    artist: inputs.artist.value.trim(),
    lyricist: inputs.lyricist.value.trim(),
    composer: inputs.composer.value.trim(),
  });
  const updateMusixmatch = () => {
    const q = query();
    musixmatch.href = `${MUSIXMATCH_SEARCH}?query=${encodeURIComponent([q.title, q.artist].filter(Boolean).join(" "))}`;
  };
  inputs.title.addEventListener("input", updateMusixmatch);
  inputs.artist.addEventListener("input", updateMusixmatch);
  updateMusixmatch();

  const views: SiteView[] = deps.sites.map((site) => {
    const box = el(doc, "div", "site");
    box.dataset.site = site.id;
    box.style.marginTop = "6px";
    const name = el(doc, "span", "site-name", site.name);
    name.style.fontWeight = "bold";
    const siteStatus = el(doc, "span", "site-status");
    siteStatus.style.marginLeft = "8px";
    const retry = el(doc, "button", "retry", "Retry");
    retry.type = "button";
    retry.hidden = true;
    retry.style.marginLeft = "8px";
    const rows = el(doc, "ul", "rows");
    rows.style.margin = "2px 0 0 16px";
    box.append(name, siteStatus, retry, rows);
    panel.appendChild(box);
    const view: SiteView = { site, status: siteStatus, retry, rows, seq: 0 };
    retry.addEventListener("click", () => void searchSite(view, query()));
    return view;
  });

  function renderRow(scored: ScoredRow): HTMLLIElement {
    const li = el(doc, "li", "row");
    const link = el(doc, "a", "link");
    link.href = scored.row.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    const parts: Array<[Field, string]> = [
      ["title", ""],
      ["artist", ""],
      ["lyricist", "作詞 "],
      ["composer", "作曲 "],
    ];
    let first = true;
    for (const [field, prefix] of parts) {
      const value = scored.row[field];
      if (!value) continue;
      if (!first) link.append(" — ");
      first = false;
      if (prefix) link.append(prefix);
      if (scored.matched.includes(field)) link.appendChild(el(doc, "b", "hit", value));
      else link.append(value);
    }
    li.appendChild(link);
    li.append(" ");
    if (deps.hasLink(scored.row.url)) {
      li.appendChild(el(doc, "span", "added", "added"));
    } else {
      const add = el(doc, "button", "add", "Add");
      add.type = "button";
      add.addEventListener("click", async () => {
        add.disabled = true;
        status.textContent = "";
        const ok = await deps.addLink(scored.row.url);
        if (ok) {
          add.replaceWith(el(doc, "span", "added", "added"));
        } else {
          status.textContent = "Could not add, paste the URL by hand";
          add.disabled = false;
        }
      });
      li.appendChild(add);
    }
    return li;
  }

  async function searchSite(view: SiteView, q: Query): Promise<void> {
    const seq = ++view.seq;
    view.retry.hidden = true;
    view.status.textContent = "Searching…";
    view.rows.replaceChildren();
    try {
      const text = await deps.fetchText(view.site.buildUrl(q), view.site.charset);
      if (seq !== view.seq) return;
      const parsed = new (doc.defaultView as Window & typeof globalThis).DOMParser().parseFromString(text, "text/html");
      const rows = view.site.parse(parsed, view.site.origin);
      if (rows.length === 0) {
        view.status.textContent = text.length > 1000 ? "No results parsed" : "No results";
        return;
      }
      view.status.textContent = `${rows.length} result${rows.length === 1 ? "" : "s"}`;
      for (const scored of rankRows(q, rows)) view.rows.appendChild(renderRow(scored));
    } catch (e) {
      if (seq !== view.seq) return;
      view.status.textContent = `Request failed: ${(e as Error).message}`;
      view.retry.hidden = false;
    }
  }

  let searching = false;
  search.addEventListener("click", async () => {
    if (searching) return;
    searching = true;
    const q = query();
    try {
      await Promise.all(views.map((v) => searchSite(v, q)));
    } finally {
      searching = false;
    }
  });

  if (info.mbid) {
    status.textContent = "Looking up MusicBrainz…";
    deps
      .lookupPeople(info.mbid)
      .then((people) => {
        for (const f of ["artist", "lyricist", "composer"] as const) {
          if (!inputs[f].value) inputs[f].value = people[f];
        }
        status.textContent = "";
        updateMusixmatch();
      })
      .catch((e: Error) => {
        status.textContent = `MusicBrainz lookup failed: ${e.message}`;
      });
  }

  anchor.after(panel);
  return panel;
}
```

Note on `renderRow`: for lyricist and composer the visible text is `作詞 <b>name</b>`; the `b.hit` holds only the name. The test asserts the `hit` texts `["Lemon", "米津玄師", "米津玄師"]` for a row matched on title, artist and lyricist.

Note on `seq`: Retry is only visible after a failure, so a stale response cannot reach the panel through the buttons; `seq` is a cheap guard against a Retry that races a still running request of the same site.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/ui.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/musicbrainz-work-lyrics-search/src/ui.ts scripts/musicbrainz-work-lyrics-search/test/ui.test.ts
git commit -m "Add the lyrics search panel"
```

---

### Task 9: Entry point, README, build

**Files:**
- Create: `scripts/musicbrainz-work-lyrics-search/src/main.ts`
- Create: `scripts/musicbrainz-work-lyrics-search/README.md`
- Modify: `README.md` (root, add a table row)
- Create: `dist/musicbrainz-work-lyrics-search.user.js` (built)
- Test: `scripts/musicbrainz-work-lyrics-search/test/main.test.ts`, `scripts/musicbrainz-work-lyrics-search/test/build.test.ts`

**Interfaces:**
- Consumes: `enhancePage`, `MARKER`, `UiDeps` (Task 8); `mbidFromUrl`, `fetchJson`, `lookupWorkPeople` (Task 3); `gmFetchText` (Task 7); `hasLink`, `addLink` (Task 6); `SITES` (Task 5).
- Produces: `VERSION`, `pageInfo(doc: Document, href: string): PageInfo | null`, `enhance(doc: Document, deps: UiDeps): "added" | "present" | "none"`.

- [ ] **Step 1: Write the failing tests**

`test/main.test.ts`:

```ts
import { enhance, pageInfo } from "../src/main";
import type { UiDeps } from "../src/ui";
import { createDocument, editDocument, emptyDocument } from "./helpers";

const MBID = "d2364f4b-3c9a-4698-af3e-0ec10eb52cf8";
const deps: UiDeps = {
  version: "1.0.0",
  sites: [],
  fetchText: async () => "",
  lookupPeople: async () => ({ artist: "", lyricist: "", composer: "" }),
  hasLink: () => false,
  addLink: async () => false,
};

describe("pageInfo", () => {
  it("reads the edit page", () => {
    expect(pageInfo(editDocument(), `https://musicbrainz.org/work/${MBID}/edit`)).toEqual({ kind: "edit", mbid: MBID, title: "SPINDLE STORY" });
  });

  it("reads the create page and rejects other pages", () => {
    expect(pageInfo(createDocument(), "https://musicbrainz.org/work/create")).toEqual({ kind: "create", mbid: null, title: "" });
    expect(pageInfo(createDocument(), "https://beta.musicbrainz.org/work/create?edit-work.name=X")).toEqual({ kind: "create", mbid: null, title: "" });
    expect(pageInfo(emptyDocument(`https://musicbrainz.org/work/${MBID}`), `https://musicbrainz.org/work/${MBID}`)).toBeNull();
  });
});

describe("enhance", () => {
  it("adds one panel and never a second", () => {
    const doc = editDocument();
    expect(enhance(doc, deps)).toBe("added");
    expect(enhance(doc, deps)).toBe("present");
    expect(doc.querySelectorAll(".mb-lyrics").length).toBe(1);
  });

  it("returns none when the editor is not on the page yet", () => {
    const doc = editDocument();
    doc.querySelector("#external-links-editor")!.remove();
    expect(enhance(doc, deps)).toBe("none");
    expect(enhance(emptyDocument("https://musicbrainz.org/work/create"), deps)).toBe("none");
  });
});
```

`test/build.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function versionFromHeader(header: string): string {
  const m = header.match(/^\/\/ @version\s+(\S+)/m);
  if (!m) throw new Error("header.txt has no @version line");
  return m[1];
}

describe("build", () => {
  it("writes one user.js file with the header, grants, and connects", () => {
    execFileSync("node", ["build.mjs", "musicbrainz-work-lyrics-search"], { stdio: "pipe" });
    const out = readFileSync("dist/musicbrainz-work-lyrics-search.user.js", "utf8");
    const header = readFileSync("scripts/musicbrainz-work-lyrics-search/header.txt", "utf8");
    const version = versionFromHeader(header);
    expect(out.startsWith(header.trimEnd() + "\n")).toBe(true);
    expect(out).toContain("@match        https://musicbrainz.org/work/*/edit*");
    expect(out).toContain("@match        https://musicbrainz.org/work/create*");
    expect(out).toContain("@grant        GM_xmlhttpRequest");
    for (const host of ["j-lyric.net", "utaten.com", "www.uta-net.com", "kashinavi.com", "petitlyrics.com", "www.joysound.com"]) {
      expect(out).toContain(`@connect      ${host}`);
    }
    expect(out).toContain(`"${version}"`);
    expect(out).not.toContain("__VERSION__");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search/test/main.test.ts scripts/musicbrainz-work-lyrics-search/test/build.test.ts`
Expected: FAIL, cannot resolve `../src/main`; the build test fails with "no script folder with header.txt and src/main.ts found".

- [ ] **Step 3: Write `src/main.ts`**

```ts
import { gmFetchText, type GmDetails } from "./fetch";
import { addLink, hasLink } from "./links";
import { fetchJson, lookupWorkPeople, mbidFromUrl } from "./musicbrainz";
import { SITES } from "./sites";
import type { PageInfo } from "./types";
import { enhancePage, MARKER, type UiDeps } from "./ui";

declare const __VERSION__: string;
declare function GM_xmlhttpRequest(details: GmDetails): void;

export const VERSION: string = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

const NAME_INPUT = "#id-edit-work\\.name";

/** What the current page is; null when it is not a work edit or create page. */
export function pageInfo(doc: Document, href: string): PageInfo | null {
  let path: string;
  try {
    path = new URL(href).pathname;
  } catch {
    return null;
  }
  const title = doc.querySelector<HTMLInputElement>(NAME_INPUT)?.value ?? "";
  const mbid = mbidFromUrl(href);
  if (mbid) return { kind: "edit", mbid, title };
  if (path === "/work/create") return { kind: "create", mbid: null, title };
  return null;
}

export function enhance(doc: Document, deps: UiDeps): "added" | "present" | "none" {
  if (doc.querySelector(`.${MARKER}`)) return "present";
  const info = pageInfo(doc, doc.location.href);
  if (!info) return "none";
  return enhancePage(doc, info, deps) ? "added" : "none";
}

function start(): void {
  const deps: UiDeps = {
    version: VERSION,
    sites: SITES,
    fetchText: (url, charset) => gmFetchText(url, charset, GM_xmlhttpRequest),
    lookupPeople: (mbid) => lookupWorkPeople(mbid, (url) => fetchJson(url)),
    hasLink: (url) => hasLink(document, url),
    addLink: (url) => addLink(document, url),
  };
  // The external links editor mounts after the page loads; poll until it is there.
  setInterval(() => enhance(document, deps), 1000);
}

if (typeof window !== "undefined" && typeof document !== "undefined" && /(^|\.)musicbrainz\.org$/.test(window.location.hostname)) {
  start();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/musicbrainz-work-lyrics-search`
Expected: PASS for every file in the folder (the build test writes `dist/musicbrainz-work-lyrics-search.user.js`).

- [ ] **Step 5: Write `scripts/musicbrainz-work-lyrics-search/README.md`**

```markdown
# MusicBrainz work lyrics search

A userscript for MusicBrainz work edit pages (`/work/<mbid>/edit` and `/work/create`). It adds a
"Lyrics search" fieldset under "External links" that searches J-Lyric, UtaTen, 歌ネット, 歌詞ナビ,
プチリリ, and JOYSOUND for the work, ranks the results against the work's title, artist, lyricist,
and composer, and adds a chosen page to the external links as a "lyrics page" relationship.
Musixmatch gets a plain search link because its search needs a login.

## Install

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Open https://github.com/ibmibmibm/userscripts/raw/main/dist/musicbrainz-work-lyrics-search.user.js and accept the install.
   The script updates itself from that URL. Allow the cross-origin requests to the six lyrics sites when the manager asks.

## Use

1. Open a work edit page. The title comes from the name field. On an edit page the lyricist and composer come from the
   work's relationships and the artist from the work's recordings, through the MusicBrainz web service.
2. Change any field and click "Search lyrics". Every site is searched by title. UtaTen and 歌詞ナビ also receive the
   artist, lyricist, and composer, and J-Lyric and プチリリ also receive the artist.
3. Rows with more matching fields come first. Matching fields are bold. Click a row to open the page in a new tab.
4. Click "Add" to put the URL into the external links editor. MusicBrainz sets the relationship type to "lyrics page".
   Rows already in the editor show "added".
5. Review the links and submit on MusicBrainz.

## Develop

Run `npm test` and `node build.mjs musicbrainz-work-lyrics-search` from the repository root. Test fixtures under
`test/fixtures/` are fragments of real search result pages captured on 2026-09-15 and MusicBrainz web service responses.
Bump `@version` in `header.txt` before a release.

Each site is one module in `src/sites/`. When a site changes its page structure, its status shows "No results parsed";
update that module's `parse` and its fixture.
```

- [ ] **Step 6: Add the row to the root `README.md` table**

Insert after the JASRAC / MINC row:

```markdown
| MusicBrainz work lyrics search | [dist/musicbrainz-work-lyrics-search.user.js](https://github.com/ibmibmibm/userscripts/raw/main/dist/musicbrainz-work-lyrics-search.user.js) | [scripts/musicbrainz-work-lyrics-search](scripts/musicbrainz-work-lyrics-search/README.md) |
```

- [ ] **Step 7: Run the full suite, the typecheck, and the build**

Run: `npm test` then `npm run typecheck` then `node build.mjs musicbrainz-work-lyrics-search`
Expected: all tests pass, no type errors, `built dist/musicbrainz-work-lyrics-search.user.js (v1.0.0)`.

- [ ] **Step 8: Commit**

```bash
git add scripts/musicbrainz-work-lyrics-search/src/main.ts scripts/musicbrainz-work-lyrics-search/README.md README.md scripts/musicbrainz-work-lyrics-search/test/main.test.ts scripts/musicbrainz-work-lyrics-search/test/build.test.ts dist/musicbrainz-work-lyrics-search.user.js
git commit -m "Add the MusicBrainz work lyrics search userscript"
```
