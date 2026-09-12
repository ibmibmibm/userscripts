# jasrac-minc-work-to-musicbrainz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A userscript that adds a MusicBrainz panel to J-WID and minc work detail pages and opens the MusicBrainz work editor (create or edit) prefilled with name, ISWC, JASRAC and NexTone codes, type or language, credit relationships, and an edit note.

**Architecture:** Pure functions in small modules: two page parsers produce one `WorkInfo`; `normalize` folds names and titles; `mapping` turns credits into seed relationships; `musicbrainz` searches and looks up works; `diff` computes what an existing work lacks; `note` and `seed` build the edit note and the GET URLs; `ui` renders a panel with injected dependencies; `main` polls the page. Every module is unit-tested with vitest and jsdom against captured fixtures.

**Tech Stack:** TypeScript 5, esbuild (via the root `build.mjs`), vitest 2 with jsdom, no runtime dependencies, `@grant none` userscript.

**Spec:** `docs/superpowers/specs/2026-09-12-jasrac-minc-work-to-musicbrainz-design.md`

## Global Constraints

- Script folder: `scripts/jasrac-minc-work-to-musicbrainz/`; built file: `dist/jasrac-minc-work-to-musicbrainz.user.js`; build with `node build.mjs jasrac-minc-work-to-musicbrainz` from the repository root.
- Header `@name         JASRAC / MINC work to MusicBrainz`, `@version      1.0.0`, `@match        https://www2.jasrac.or.jp/eJwid/main?trxID=F20101*`, `@match        https://www.minc.or.jp/saku/detail/*`, `@grant        none`, `@run-at       document-end`.
- Panel marker class: `jasrac-minc-mb`. All panel element classes start with `jasrac-minc-mb-`.
- Only GET URLs to `https://musicbrainz.org/work/create?…` and `https://musicbrainz.org/work/<mbid>/edit?…`. Never POST to MusicBrainz.
- MusicBrainz web service base `https://musicbrainz.org/ws/2/`, `Accept: application/json`, 15 s timeout, 503 retried twice after a 2 s wait, other errors throw `MusicBrainz responded with HTTP <status>`.
- ISWC search query is `iswc:"<formatted ISWC>"` (for example `iswc:"T-924.390.287-6"`); the digits-only form returns nothing.
- Link type MBIDs: lyricist `3e48faba-ec01-47fd-8e89-30e81161661c`, translator `da6c5d8a-ce13-474d-9375-61feb29039a5`, composer `d59d99ea-23d4-4a80-b066-edca32ee158f`, writer `a255bca1-b157-4518-9108-7b147dc3fc68`, arranger `d3fd781c-5894-47e2-8c12-86cc0e2c8d08`, publishing `05ee6f18-4517-342d-afdf-5897f64276e3`. Attribute MBIDs: additional `0a5341f8-3b1d-4f99-a0c6-26b7f4e42c7f`, sub `4521ce8e-3d24-4b64-9805-59df6f3a4740`. Work attribute ids: JASRAC ID `3`, NexTone ID `33`. Work type Song `17`. Language `[No lyrics]` `486`.
- Parsers keep the page spelling. Do not collapse whitespace in parsers: JavaScript `\s` matches the full-width space U+3000 that J-WID uses inside names and titles. Only `trim()`.
- URL length limit 8000 characters; the edit note drops `artists`, then `titles`, then `credits`.
- Tests: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz` must pass; `npm run typecheck` must pass. Commit after every task with the attribution lines the session requires.
- Prose in README and commit messages: plain English, no contractions, no semicolons.

---

## File structure

```
scripts/jasrac-minc-work-to-musicbrainz/
  header.txt                 userscript header (Task 1)
  README.md                  install, use, develop (Task 11)
  src/types.ts               WorkInfo, Credit, TitleLine, WorkHit, MbWork, MbRelation (Task 1)
  src/normalize.ts           fold, moveArticle, displayTitle, company markers, targetName (Task 2)
  src/parser.ts              parseJwid, parseMinc (Tasks 3, 4)
  src/mapping.ts             constants, mapCredits, workKind (Task 5)
  src/musicbrainz.ts         searchByIswc, searchByTitle, lookupWork, parseWorkRef (Task 6)
  src/diff.ts                diffWork, isEmpty (Task 7)
  src/note.ts                buildEditNote (Task 8)
  src/seed.ts                buildCreateUrl, buildEditUrl, fitUrl (Task 9)
  src/ui.ts                  enhancePage, MARKER, UiDeps (Task 10)
  src/main.ts                enhance, start (Task 11)
  test/helpers.ts            fixture loaders (Task 1)
  test/fixtures/             already committed: jwid-*.html, minc-*.html, mb-*.json
  test/*.test.ts             one per module
```

Fixture facts (verified with jsdom, use these exact values in tests):

| fixture | title (`.baseinfo--name`) | code | ISWC | credits (name / role / 契約 / 所属団体 / 特記) | titles | artists |
|---|---|---|---|---|---|---|
| `jwid-70417750` | `かるた日和` | `704-1775-0` | `T-102.072.605-8` | `山下　康介`/作曲/–/JASRAC/–; `日本テレビ音楽　株式会社`/出版者/曲/JASRAC/– | 正題 `かるた日和`/`カルタ　ビヨリ`/`KARUTA BIYORI`; 副題1 `ちはやふるより（ＮＴＶ系アニメ）`/`チハヤフル　ヨリ`/`CHIHAYAFURU YORI` | none (no artist section) |
| `jwid-70342415` | `ＹＯＵＴＨＦＵＬ` | `703-4241-5` | `T-102.054.195-9` | `堀内　孝太`/作詞; `堀内　孝平`/作詞; `堀内　孝太`/作曲; `堀内　孝平`/作曲; `日本テレビ音楽　株式会社`/出版者/–/JASRAC | 正題 `ＹＯＵＴＨＦＵＬ`/null/`YOUTHFUL`; 副題1 `オープニング／ちはやふる（ＮＴＶ系アニメ）`/`チハヤフル`/`CHIHAYAFURU` | `９９　Ｒａｄｉｏ　Ｓｅｒｖｉｃｅ` |
| `jwid-15233952` | `ＡＬＭＩＧＨＴＹ　　ＴＨＥ` | `152-3395-2` | none | `目黒　将司`/作曲/–/–/`この著作者/出版者は、この利用分野の著作権をJASRACに委託していません。` | 正題 `ＡＬＭＩＧＨＴＹ　　ＴＨＥ`/null/`ALMIGHTY  THE`; 副題1 `＊ペルソナ４より`/`ペルソナ　４　ヨリ`/`PERUSONA 4 YORI` | none |
| `jwid-15233812` | `ＮＥＷ　ＷＯＲＬＤ　ＦＯＯＬ　　Ａ` | `152-3381-2` | none | same as above | 正題 `ＮＥＷ　ＷＯＲＬＤ　ＦＯＯＬ　　Ａ`/null/`NEW WORLD FOOL  A`; 副題1 as above | none |
| `jwid-20356293` | `ＤＡＺＺＬＩＮＧ　ＳＭＩＬＥ` | `203-5629-3` | none | `小林　鉄兵`/作詞; `目黒　将司`/作曲; `ソニー・ミュージックパブリッシング`/出版者/–/JASRAC | 正題 `ＤＡＺＺＬＩＮＧ　ＳＭＩＬＥ`/null/`DAZZLING SMILE`; 副題1 `エンディング／ペルソナ４ザ・ゴールデン（アニメ）`/`ペルソナ　４　ザ　ゴオルデン`/`PERUSONA 4 ZA GOORUDEN`; 副題2 `＊ＤＡＺＺＬＩＮＧ　ＳＭＩＬＥ－ＳＰＥＣＩＡＬ　ＭＩＸ－`/null/`*DAZZLING SMILE-SPECIAL MIX-` (searchName) | `平田　志穂子`, `℃－ＵＴＥ`, `花澤　香菜` |

| fixture | JASRAC area | NexTone area |
|---|---|---|
| `minc-70342415` | 作品名 `ＹＯＵＴＨＦＵＬ`, code `703-4241-5`, ISWC `T- 102.054.195-9`, 副題 `オープニング／ちはやふる（ＮＴＶ系アニメ）`, artist `９９ Ｒａｄｉｏ Ｓｅｒｖｉｃｅ`; credits `堀内 孝太`/`作詞 / 無信託 /`, `堀内 孝平`/作詞, `堀内 孝太`/作曲, `堀内 孝平`/作曲, `日本テレビ音楽 株式会社`/`出版者 / JASRAC /` | text `情報はありません`, no table |
| `minc-25707965-N00913658` | 作品名 `ダーリンダンス`, code `257-0796-5`, ISWC `T- 302.445.339-8`, 副題 empty, artists `神田 沙也加`, `Ｋｏｔｏｎｅ`, `ＭｏｎｓｔｅｒＺ ＭＡＴＥ`; credits `かいりきベア`/`作詞 / 無信託 /`, `かいりきベア`/`作曲 / 無信託 /`, `ドワンゴ 第７事業部`/`出版者 / 部分信託 /` | code `N00913658`; credits `かいりきベア / <br>株式会社 ドワンゴ 第七事業部`/`作詞 / 出版社` and the same with `作曲 / 出版社` |

minc names use an ASCII space (`堀内 孝太`); J-WID names use U+3000 (`堀内　孝太`).

MusicBrainz fixtures (work "Lemon", `d69ecd96-bb2c-461f-9762-29102d2b50a1`): `mb-work-search-iswc.json` has `count` 1 and one hit with `iswcs: ["T-924.390.287-6"]`; `mb-work-search-title.json` has one hit; `mb-work-lookup.json` has `type: "Song"`, `languages: ["jpn"]`, `iswcs: ["T-924.390.287-6"]`, 12 attributes including `{ "type": "JASRAC ID", "value": "720-5540-5" }`, relations composer and lyricist to artist `米津玄師` (sort-name `Yonezu, Kenshi`) and three publishing relations to labels `HORIPRO`, `リイシューレコーズ`, `日音`.

---

### Task 1: Scaffold, types, fixture helpers, build test

**Files:**
- Create: `scripts/jasrac-minc-work-to-musicbrainz/header.txt`
- Create: `scripts/jasrac-minc-work-to-musicbrainz/src/types.ts`
- Create: `scripts/jasrac-minc-work-to-musicbrainz/src/main.ts` (placeholder entry so the build runs; replaced in Task 11)
- Create: `scripts/jasrac-minc-work-to-musicbrainz/test/helpers.ts`
- Create: `scripts/jasrac-minc-work-to-musicbrainz/test/build.test.ts`

**Interfaces:**
- Produces: every type below; `jwidDocument(name)`, `mincDocument(name)`, `mbJson(name)` helpers.

- [ ] **Step 1: Write the header**

`scripts/jasrac-minc-work-to-musicbrainz/header.txt`:

```
// ==UserScript==
// @name         JASRAC / MINC work to MusicBrainz
// @namespace    https://github.com/ibmibmibm/userscripts
// @version      1.0.0
// @description  Create or update a MusicBrainz work from a J-WID (JASRAC) or MINC (音楽権利情報検索ナビ) work detail page, with ISWC, codes, credits, and edit note prefilled
// @author       Shen-Ta Hsieh
// @downloadURL  https://github.com/ibmibmibm/userscripts/raw/main/dist/jasrac-minc-work-to-musicbrainz.user.js
// @updateURL    https://github.com/ibmibmibm/userscripts/raw/main/dist/jasrac-minc-work-to-musicbrainz.user.js
// @match        https://www2.jasrac.or.jp/eJwid/main?trxID=F20101*
// @match        https://www.minc.or.jp/saku/detail/*
// @grant        none
// @run-at       document-end
// ==/UserScript==
```

- [ ] **Step 2: Write the types**

`src/types.ts`:

```ts
export type Source = "JASRAC" | "NexTone";
export type Site = "jwid" | "minc";

export interface TitleLine {
  kind: string; // "正題", "副題1", …; minc gives "副題"
  title: string; // as written on the page
  kana: string | null; // J-WID only
  romaji: string | null; // J-WID only
  searchName: boolean; // title starts with ＊ (marker kept in title)
}

export interface Credit {
  source: Source;
  name: string; // as written on the page
  role: string; // 識別 as written
  trust: string | null; // 信託状況 (minc) or 契約 (J-WID)
  society: string | null; // 所属団体 (J-WID only)
  note: string | null; // 特記 (J-WID only)
}

export interface WorkInfo {
  site: Site;
  sourceUrl: string;
  title: string;
  jasracCode: string | null; // "703-4241-5"
  nextoneCode: string | null; // "N00913658"
  iswc: string | null; // "T-102.054.195-9"
  domestic: boolean | null;
  titles: TitleLine[];
  artists: string[];
  credits: Credit[];
}

export interface WorkHit {
  mbid: string;
  title: string;
  type: string | null;
  iswcs: string[];
  disambiguation: string | null;
  writers: string; // "米津玄師 (composer), 米津玄師 (lyricist)"
}

export interface MbRelation {
  linkTypeId: string;
  targetType: "artist" | "label";
  name: string;
  sortName: string;
  attributes: string[]; // attribute names as the web service gives them
}

export interface MbWork {
  mbid: string;
  title: string;
  type: string | null;
  languages: string[];
  iswcs: string[];
  attributes: { type: string; value: string }[];
  relations: MbRelation[];
}
```

- [ ] **Step 3: Write the placeholder entry**

`src/main.ts`:

```ts
declare const __VERSION__: string;

export const VERSION: string = typeof __VERSION__ === "string" ? __VERSION__ : "dev";
```

- [ ] **Step 4: Write the helpers**

`test/helpers.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

function html(name: string): string {
  return readFileSync(`${FIXTURES}${name}.html`, "utf8");
}

/** A J-WID work detail page. The fixture is the page's <main> element. */
export function jwidDocument(name: string): Document {
  const dom = new JSDOM(`<!doctype html><html><body>${html(name)}</body></html>`, {
    url: `https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=${name.replace("jwid-", "")}&subSessionID=001&subSession=start`,
  });
  return dom.window.document;
}

/** A minc work detail page. The fixture is the page's <body> element. */
export function mincDocument(name: string): Document {
  const m = name.match(/^minc-(\d{8})(?:-(N\d{8}))?$/)!;
  const dom = new JSDOM(`<!doctype html><html>${html(name)}</html>`, {
    url: `https://www.minc.or.jp/saku/detail/?jcd=${m[1]}&ncd=${m[2] ?? ""}&refer=music/list-work`,
  });
  return dom.window.document;
}

/** An empty document for negative tests. */
export function emptyDocument(url = "https://example.invalid/"): Document {
  return new JSDOM("<!doctype html><html><body></body></html>", { url }).window.document;
}

/** Parsed MusicBrainz fixture JSON. */
export function mbJson(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8"));
}
```

- [ ] **Step 5: Write the build test**

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
  it("writes one user.js file with the header and version", () => {
    execFileSync("node", ["build.mjs", "jasrac-minc-work-to-musicbrainz"], { stdio: "pipe" });
    const out = readFileSync("dist/jasrac-minc-work-to-musicbrainz.user.js", "utf8");
    const header = readFileSync("scripts/jasrac-minc-work-to-musicbrainz/header.txt", "utf8");
    const version = versionFromHeader(header);
    expect(out.startsWith(header.trimEnd() + "\n")).toBe(true);
    expect(out).toContain(`// @version      ${version}`);
    expect(out).toContain("@downloadURL  https://github.com/ibmibmibm/userscripts/raw/main/dist/jasrac-minc-work-to-musicbrainz.user.js");
    expect(out).toContain("@match        https://www2.jasrac.or.jp/eJwid/main?trxID=F20101*");
    expect(out).toContain("@match        https://www.minc.or.jp/saku/detail/*");
    expect(out).toContain("@grant        none");
    expect(out).toContain(`"${version}"`);
    expect(out).not.toContain("__VERSION__");
  });
});
```

- [ ] **Step 6: Run the build test and typecheck**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz && npm run typecheck`
Expected: 1 test passes; typecheck clean. `dist/jasrac-minc-work-to-musicbrainz.user.js` exists.

- [ ] **Step 7: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz dist/jasrac-minc-work-to-musicbrainz.user.js
git commit -m "Scaffold the JASRAC / MINC work importer script"
```

---

### Task 2: Normalization

**Files:**
- Create: `src/normalize.ts`
- Test: `test/normalize.test.ts`

**Interfaces:**
- Produces: `fold(s)`, `moveArticle(s)`, `displayTitle(t)`, `isCompany(name)`, `stripCompany(name)`, `isCjkOnly(s)`, `targetName(name)`, `RIGHTS_HOLDER`, `stripRightsHolder(name)`.

- [ ] **Step 1: Write the failing tests**

`test/normalize.test.ts`:

```ts
import {
  displayTitle,
  fold,
  isCjkOnly,
  isCompany,
  moveArticle,
  stripCompany,
  stripRightsHolder,
  targetName,
} from "../src/normalize";

describe("fold", () => {
  it("folds full-width Latin and collapses full-width spaces", () => {
    expect(fold("ＹＯＵＴＨＦＵＬ")).toBe("YOUTHFUL");
    expect(fold("ＡＬＭＩＧＨＴＹ　　ＴＨＥ")).toBe("ALMIGHTY THE");
    expect(fold("  堀内　孝太 ")).toBe("堀内 孝太");
    expect(fold("㈱ドワンゴ")).toBe("(株)ドワンゴ");
  });
});

describe("moveArticle", () => {
  it("moves a trailing THE, A, or AN to the front", () => {
    expect(moveArticle("ALMIGHTY THE")).toBe("THE ALMIGHTY");
    expect(moveArticle("NEW WORLD FOOL A")).toBe("A NEW WORLD FOOL");
    expect(moveArticle("Old Story an")).toBe("an Old Story");
  });
  it("leaves other titles alone", () => {
    expect(moveArticle("DAZZLING SMILE")).toBe("DAZZLING SMILE");
    expect(moveArticle("THE END")).toBe("THE END");
    expect(moveArticle("A")).toBe("A");
    expect(moveArticle("かるた日和 THE")).toBe("かるた日和 THE");
    expect(moveArticle("BREATHE")).toBe("BREATHE");
  });
});

describe("displayTitle", () => {
  it("folds then moves the article", () => {
    expect(displayTitle("ＡＬＭＩＧＨＴＹ　　ＴＨＥ")).toBe("THE ALMIGHTY");
    expect(displayTitle("ＮＥＷ　ＷＯＲＬＤ　ＦＯＯＬ　　Ａ")).toBe("A NEW WORLD FOOL");
    expect(displayTitle("かるた日和")).toBe("かるた日和");
  });
});

describe("company markers", () => {
  it("detects Japanese markers at either end, spaced or not", () => {
    expect(isCompany("日本テレビ音楽　株式会社")).toBe(true);
    expect(isCompany("株式会社 ドワンゴ 第七事業部")).toBe(true);
    expect(isCompany("株式会社ドワンゴ")).toBe(true);
    expect(isCompany("㈱ドワンゴ")).toBe(true);
    expect(isCompany("有限会社ハル")).toBe(true);
    expect(isCompany("ソニー・ミュージックパブリッシング")).toBe(false);
    expect(isCompany("堀内　孝太")).toBe(false);
  });
  it("detects Latin markers only as whole tokens", () => {
    expect(isCompany("Sony Music Publishing Inc.")).toBe(true);
    expect(isCompany("ACME Co., Ltd.")).toBe(true);
    expect(isCompany("Foo LLC")).toBe(true);
    expect(isCompany("Coldplay")).toBe(false);
    expect(isCompany("Include")).toBe(false);
  });
  it("strips the marker and the space next to it", () => {
    expect(stripCompany("日本テレビ音楽　株式会社")).toBe("日本テレビ音楽");
    expect(stripCompany("株式会社 ドワンゴ 第七事業部")).toBe("ドワンゴ 第七事業部");
    expect(stripCompany("株式会社ドワンゴ")).toBe("ドワンゴ");
    expect(stripCompany("Sony Music Publishing Inc.")).toBe("Sony Music Publishing");
    expect(stripCompany("ACME Co., Ltd.")).toBe("ACME");
    expect(stripCompany("ソニー・ミュージックパブリッシング")).toBe("ソニー・ミュージックパブリッシング");
  });
});

describe("isCjkOnly", () => {
  it("accepts kana, kanji, digits, ・, ー, 々 and spaces", () => {
    expect(isCjkOnly("堀内 孝太")).toBe(true);
    expect(isCjkOnly("ソニー・ミュージックパブリッシング")).toBe(true);
    expect(isCjkOnly("ドワンゴ 第7事業部")).toBe(true);
    expect(isCjkOnly("佐々木")).toBe(true);
  });
  it("rejects Latin letters", () => {
    expect(isCjkOnly("MonsterZ MATE")).toBe(false);
    expect(isCjkOnly("神田 沙也加 feat. X")).toBe(false);
  });
});

describe("targetName", () => {
  it("removes spaces in CJK names and keeps them in Latin names", () => {
    expect(targetName("堀内　孝太")).toBe("堀内孝太");
    expect(targetName("日本テレビ音楽　株式会社")).toBe("日本テレビ音楽");
    expect(targetName("株式会社 ドワンゴ 第七事業部")).toBe("ドワンゴ第七事業部");
    expect(targetName("ドワンゴ 第７事業部")).toBe("ドワンゴ第7事業部");
    expect(targetName("ＭｏｎｓｔｅｒＺ ＭＡＴＥ")).toBe("MonsterZ MATE");
    expect(targetName("ソニー・ミュージックパブリッシング")).toBe("ソニー・ミュージックパブリッシング");
  });
});

describe("stripRightsHolder", () => {
  it("removes the 権利者 prefix and following spaces", () => {
    expect(stripRightsHolder("権利者　㈱ソニー")).toBe("㈱ソニー");
    expect(stripRightsHolder("権利者 山田太郎")).toBe("山田太郎");
    expect(stripRightsHolder("山田太郎")).toBe("山田太郎");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/normalize.test.ts`
Expected: FAIL, cannot resolve `../src/normalize`.

- [ ] **Step 3: Write the implementation**

`src/normalize.ts`:

```ts
const CJK_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_ONLY = /^[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff0-9 ]*$/;

/** NFKC, whitespace runs to one ASCII space, trimmed. */
export function fold(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** "ALMIGHTY THE" -> "THE ALMIGHTY". Only for titles without CJK characters. */
export function moveArticle(s: string): string {
  if (CJK_CHAR.test(s)) return s;
  const m = s.match(/^(.+) (THE|A|AN)$/i);
  return m ? `${m[2]} ${m[1]}` : s;
}

export function displayTitle(title: string): string {
  return moveArticle(fold(title));
}

const JP_MARKERS = ["株式会社", "(株)", "有限会社", "合同会社"];
const LATIN_MARKERS = ["Co., Ltd.", "Co.,Ltd.", "Inc.", "Inc", "Ltd.", "Ltd", "LLC", "Co."];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Position of a company marker in a folded name, or null. */
function findMarker(s: string): { start: number; end: number } | null {
  for (const m of JP_MARKERS) {
    if (s.startsWith(m)) return { start: 0, end: m.length };
    if (s.endsWith(m)) return { start: s.length - m.length, end: s.length };
  }
  for (const m of LATIN_MARKERS) {
    const tail = new RegExp(`[ ,]+${escapeRe(m)}$`, "i").exec(s);
    if (tail) return { start: tail.index, end: s.length };
    const head = new RegExp(`^${escapeRe(m)}[ ,]+`, "i").exec(s);
    if (head) return { start: 0, end: head[0].length };
  }
  return null;
}

export function isCompany(name: string): boolean {
  return findMarker(fold(name)) !== null;
}

export function stripCompany(name: string): string {
  const s = fold(name);
  const m = findMarker(s);
  if (!m) return s;
  return fold(`${s.slice(0, m.start)} ${s.slice(m.end)}`);
}

/** True when a folded string holds only CJK characters, digits, and spaces. */
export function isCjkOnly(s: string): boolean {
  return CJK_ONLY.test(s);
}

/** The name seeded as a relationship target. */
export function targetName(name: string): string {
  const s = stripCompany(name);
  return isCjkOnly(s) ? s.replace(/ /g, "") : s;
}

export const RIGHTS_HOLDER = /^権利者[\s\u3000]*/;

export function stripRightsHolder(name: string): string {
  return name.replace(RIGHTS_HOLDER, "");
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz/src/normalize.ts scripts/jasrac-minc-work-to-musicbrainz/test/normalize.test.ts
git commit -m "Add name and title normalization for the work importer"
```

---

### Task 3: J-WID parser

**Files:**
- Create: `src/parser.ts` (J-WID half; Task 4 adds minc to the same file)
- Test: `test/parser.test.ts`

**Interfaces:**
- Consumes: types from Task 1.
- Produces: `parseJwid(doc: Document): WorkInfo | null`; internal helpers `textOf(el)`, `orNull(s)`, `iswcOf(s)`, `jasracCodeOf(s)`, `nextoneCodeOf(s)`, `cellLines(td)` exported for reuse by Task 4 (export them).

- [ ] **Step 1: Write the failing tests**

`test/parser.test.ts`:

```ts
import { JSDOM } from "jsdom";
import { parseJwid } from "../src/parser";
import { emptyDocument, jwidDocument } from "./helpers";

describe("parseJwid", () => {
  it("parses a vocal work with lyricists, composers, a publisher, titles, and an artist", () => {
    const info = parseJwid(jwidDocument("jwid-70342415"))!;
    expect(info.site).toBe("jwid");
    expect(info.sourceUrl).toBe("https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=70342415&subSessionID=001&subSession=start");
    expect(info.title).toBe("ＹＯＵＴＨＦＵＬ");
    expect(info.jasracCode).toBe("703-4241-5");
    expect(info.nextoneCode).toBeNull();
    expect(info.iswc).toBe("T-102.054.195-9");
    expect(info.domestic).toBe(true);
    expect(info.credits).toEqual([
      { source: "JASRAC", name: "堀内　孝太", role: "作詞", trust: null, society: null, note: null },
      { source: "JASRAC", name: "堀内　孝平", role: "作詞", trust: null, society: null, note: null },
      { source: "JASRAC", name: "堀内　孝太", role: "作曲", trust: null, society: null, note: null },
      { source: "JASRAC", name: "堀内　孝平", role: "作曲", trust: null, society: null, note: null },
      { source: "JASRAC", name: "日本テレビ音楽　株式会社", role: "出版者", trust: null, society: "JASRAC", note: null },
    ]);
    expect(info.titles).toEqual([
      { kind: "正題", title: "ＹＯＵＴＨＦＵＬ", kana: null, romaji: "YOUTHFUL", searchName: false },
      { kind: "副題1", title: "オープニング／ちはやふる（ＮＴＶ系アニメ）", kana: "チハヤフル", romaji: "CHIHAYAFURU", searchName: false },
    ]);
    expect(info.artists).toEqual(["９９　Ｒａｄｉｏ　Ｓｅｒｖｉｃｅ"]);
  });

  it("parses an instrumental work with 契約 and 所属団体 and no artist section", () => {
    const info = parseJwid(jwidDocument("jwid-70417750"))!;
    expect(info.title).toBe("かるた日和");
    expect(info.jasracCode).toBe("704-1775-0");
    expect(info.iswc).toBe("T-102.072.605-8");
    expect(info.credits).toEqual([
      { source: "JASRAC", name: "山下　康介", role: "作曲", trust: null, society: "JASRAC", note: null },
      { source: "JASRAC", name: "日本テレビ音楽　株式会社", role: "出版者", trust: "曲", society: "JASRAC", note: null },
    ]);
    expect(info.titles[0]).toEqual({ kind: "正題", title: "かるた日和", kana: "カルタ　ビヨリ", romaji: "KARUTA BIYORI", searchName: false });
    expect(info.titles[1]).toEqual({ kind: "副題1", title: "ちはやふるより（ＮＴＶ系アニメ）", kana: "チハヤフル　ヨリ", romaji: "CHIHAYAFURU YORI", searchName: false });
    expect(info.artists).toEqual([]);
  });

  it("parses a work without ISWC, with a 特記 note and a search-name subtitle", () => {
    const info = parseJwid(jwidDocument("jwid-15233952"))!;
    expect(info.title).toBe("ＡＬＭＩＧＨＴＹ　　ＴＨＥ");
    expect(info.jasracCode).toBe("152-3395-2");
    expect(info.iswc).toBeNull();
    expect(info.credits).toEqual([
      {
        source: "JASRAC",
        name: "目黒　将司",
        role: "作曲",
        trust: null,
        society: null,
        note: "この著作者/出版者は、この利用分野の著作権をJASRACに委託していません。",
      },
    ]);
    expect(info.titles).toEqual([
      { kind: "正題", title: "ＡＬＭＩＧＨＴＹ　　ＴＨＥ", kana: null, romaji: "ALMIGHTY  THE", searchName: false },
      { kind: "副題1", title: "＊ペルソナ４より", kana: "ペルソナ　４　ヨリ", romaji: "PERUSONA 4 YORI", searchName: true },
    ]);
    expect(info.artists).toEqual([]);
  });

  it("parses three artists and two subtitles", () => {
    const info = parseJwid(jwidDocument("jwid-20356293"))!;
    expect(info.title).toBe("ＤＡＺＺＬＩＮＧ　ＳＭＩＬＥ");
    expect(info.credits.map((c) => [c.name, c.role, c.society])).toEqual([
      ["小林　鉄兵", "作詞", null],
      ["目黒　将司", "作曲", null],
      ["ソニー・ミュージックパブリッシング", "出版者", "JASRAC"],
    ]);
    expect(info.titles.map((t) => [t.kind, t.title, t.searchName])).toEqual([
      ["正題", "ＤＡＺＺＬＩＮＧ　ＳＭＩＬＥ", false],
      ["副題1", "エンディング／ペルソナ４ザ・ゴールデン（アニメ）", false],
      ["副題2", "＊ＤＡＺＺＬＩＮＧ　ＳＭＩＬＥ－ＳＰＥＣＩＡＬ　ＭＩＸ－", true],
    ]);
    expect(info.artists).toEqual(["平田　志穂子", "℃－ＵＴＥ", "花澤　香菜"]);
  });

  it("returns null without .baseinfo--name", () => {
    expect(parseJwid(emptyDocument())).toBeNull();
  });

  it("falls back to the first content-block credit table when #tab-def is absent", () => {
    const doc = jwidDocument("jwid-70342415");
    doc.querySelector("#tab-def")!.remove();
    const info = parseJwid(doc)!;
    expect(info.credits.length).toBe(5);
    expect(info.credits[0].name).toBe("堀内　孝太");
  });

  it("gives null codes for malformed values and keeps the page URL as source", () => {
    const doc = new JSDOM(
      `<div class="baseinfo"><div class="baseinfo--code"><strong>bad</strong></div><div class="baseinfo--iswc"><strong>T-1</strong></div><div class="baseinfo--name"> X </div></div>`,
      { url: "https://www2.jasrac.or.jp/eJwid/main?trxID=F20101" },
    ).window.document;
    const info = parseJwid(doc)!;
    expect(info.title).toBe("X");
    expect(info.jasracCode).toBeNull();
    expect(info.iswc).toBeNull();
    expect(info.domestic).toBeNull();
    expect(info.sourceUrl).toBe("https://www2.jasrac.or.jp/eJwid/main?trxID=F20101");
    expect(info.credits).toEqual([]);
    expect(info.titles).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/parser.test.ts`
Expected: FAIL, cannot resolve `../src/parser`.

- [ ] **Step 3: Write the implementation**

`src/parser.ts`:

```ts
import type { Credit, TitleLine, WorkInfo } from "./types";

/** Trimmed text content. Inner whitespace, including U+3000, is kept. */
export function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\u00a0/g, " ").trim();
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
    const t = l.replace(/\u00a0/g, " ").trim();
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/parser.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz/src/parser.ts scripts/jasrac-minc-work-to-musicbrainz/test/parser.test.ts
git commit -m "Parse J-WID work detail pages"
```

---

### Task 4: minc parser

**Files:**
- Modify: `src/parser.ts` (append)
- Test: `test/parser.test.ts` (append)

**Interfaces:**
- Consumes: helpers from Task 3.
- Produces: `parseMinc(doc: Document): WorkInfo | null`.

- [ ] **Step 1: Append the failing tests**

Append to `test/parser.test.ts` (add `parseMinc` and `mincDocument` to the imports):

```ts
describe("parseMinc", () => {
  it("parses the JASRAC area and ignores an empty NexTone area", () => {
    const info = parseMinc(mincDocument("minc-70342415"))!;
    expect(info.site).toBe("minc");
    expect(info.sourceUrl).toBe("https://www.minc.or.jp/saku/detail/?jcd=70342415&ncd=");
    expect(info.title).toBe("ＹＯＵＴＨＦＵＬ");
    expect(info.jasracCode).toBe("703-4241-5");
    expect(info.nextoneCode).toBeNull();
    expect(info.iswc).toBe("T-102.054.195-9");
    expect(info.domestic).toBeNull();
    expect(info.titles).toEqual([
      { kind: "正題", title: "ＹＯＵＴＨＦＵＬ", kana: null, romaji: null, searchName: false },
      { kind: "副題", title: "オープニング／ちはやふる（ＮＴＶ系アニメ）", kana: null, romaji: null, searchName: false },
    ]);
    expect(info.artists).toEqual(["９９ Ｒａｄｉｏ Ｓｅｒｖｉｃｅ"]);
    expect(info.credits).toEqual([
      { source: "JASRAC", name: "堀内 孝太", role: "作詞", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "堀内 孝平", role: "作詞", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "堀内 孝太", role: "作曲", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "堀内 孝平", role: "作曲", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "日本テレビ音楽 株式会社", role: "出版者", trust: "JASRAC", society: null, note: null },
    ]);
  });

  it("parses both areas and pairs NexTone names with roles", () => {
    const info = parseMinc(mincDocument("minc-25707965-N00913658"))!;
    expect(info.sourceUrl).toBe("https://www.minc.or.jp/saku/detail/?jcd=25707965&ncd=N00913658");
    expect(info.title).toBe("ダーリンダンス");
    expect(info.jasracCode).toBe("257-0796-5");
    expect(info.nextoneCode).toBe("N00913658");
    expect(info.iswc).toBe("T-302.445.339-8");
    expect(info.titles).toEqual([{ kind: "正題", title: "ダーリンダンス", kana: null, romaji: null, searchName: false }]);
    expect(info.artists).toEqual(["神田 沙也加", "Ｋｏｔｏｎｅ", "ＭｏｎｓｔｅｒＺ ＭＡＴＥ"]);
    expect(info.credits).toEqual([
      { source: "JASRAC", name: "かいりきベア", role: "作詞", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "かいりきベア", role: "作曲", trust: "無信託", society: null, note: null },
      { source: "JASRAC", name: "ドワンゴ 第７事業部", role: "出版者", trust: "部分信託", society: null, note: null },
      { source: "NexTone", name: "かいりきベア", role: "作詞", trust: null, society: null, note: null },
      { source: "NexTone", name: "株式会社 ドワンゴ 第七事業部", role: "出版社", trust: null, society: null, note: null },
      { source: "NexTone", name: "かいりきベア", role: "作曲", trust: null, society: null, note: null },
      { source: "NexTone", name: "株式会社 ドワンゴ 第七事業部", role: "出版社", trust: null, society: null, note: null },
    ]);
  });

  it("gives extra NexTone names the role 不明 and drops extra roles", () => {
    const doc = mincDocument("minc-25707965-N00913658");
    const tables = doc.querySelectorAll("#nextone-area table");
    tables[1].querySelectorAll("td")[0].innerHTML = "A / B / C";
    tables[1].querySelectorAll("td")[1].textContent = "作詞 / 出版社";
    tables[2].querySelectorAll("td")[0].innerHTML = "D";
    tables[2].querySelectorAll("td")[1].textContent = "作曲 / 出版社 / 編曲";
    const info = parseMinc(doc)!;
    expect(info.credits.filter((c) => c.source === "NexTone").map((c) => [c.name, c.role])).toEqual([
      ["A", "作詞"],
      ["B", "出版社"],
      ["C", "不明"],
      ["D", "作曲"],
    ]);
  });

  it("returns null without the JASRAC header table", () => {
    expect(parseMinc(emptyDocument("https://www.minc.or.jp/saku/detail/?jcd=1"))).toBeNull();
    const doc = mincDocument("minc-70342415");
    doc.querySelector("#jasrac-area table")!.remove();
    expect(parseMinc(doc)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/parser.test.ts`
Expected: FAIL, `parseMinc` is not exported.

- [ ] **Step 3: Append the implementation**

Append to `src/parser.ts`:

```ts
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

function nonBlankLines(td: Element | undefined): string[] {
  if (!td) return [];
  return cellLines(td).filter((l): l is string => l !== null);
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
    out.push({ source: "JASRAC", name: textOf(td[0]), role, trust: orNull(trust), society: null, note: null });
  }
  return out;
}

function mincNextoneCredits(area: Element): Credit[] {
  const out: Credit[] = [];
  for (const table of Array.from(area.querySelectorAll("table")).slice(1)) {
    const td = table.querySelectorAll("td");
    if (td.length < 2) continue;
    const names = splitSlash(textOf(td[0])).filter((n) => n.length > 0);
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
  const title = textOf(fields.get("作品名"));
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/parser.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz/src/parser.ts scripts/jasrac-minc-work-to-musicbrainz/test/parser.test.ts
git commit -m "Parse minc work detail pages including NexTone credits"
```

---

### Task 5: Credit mapping and work kind

**Files:**
- Create: `src/mapping.ts`
- Test: `test/mapping.test.ts`

**Interfaces:**
- Consumes: `Credit` (Task 1); `fold`, `isCompany`, `targetName`, `RIGHTS_HOLDER`, `stripRightsHolder` (Task 2).
- Produces: constants `LINK`, `ATTR`, `WORK_ATTR`, `WORK_TYPE_SONG`, `LANG_NO_LYRICS`; `SeedRel`, `SkipReason`, `SkippedCredit`, `WorkKind`; `mapCredits(credits)`, `workKind(credits)`.

- [ ] **Step 1: Write the failing tests**

`test/mapping.test.ts`:

```ts
import { ATTR, LINK, mapCredits, workKind } from "../src/mapping";
import type { Credit } from "../src/types";

const c = (role: string, name: string, source: "JASRAC" | "NexTone" = "JASRAC"): Credit => ({
  source,
  name,
  role,
  trust: null,
  society: null,
  note: null,
});

describe("mapCredits", () => {
  it("maps every role of the table", () => {
    const { rels, skipped } = mapCredits([
      c("作詞", "堀内　孝太"),
      c("補詞", "山田　花子"),
      c("訳詞", "鈴木　一郎"),
      c("作曲", "堀内　孝平"),
      c("編曲", "佐藤　次郎"),
      c("作曲作詞", "田中　三郎"),
      c("不明", "高橋　四郎"),
      c("出版者", "日本テレビ音楽　株式会社"),
      c("出版社", "株式会社 ドワンゴ 第七事業部"),
      c("サブ出版", "ソニー・ミュージックパブリッシング"),
    ]);
    expect(skipped).toEqual([]);
    expect(rels.map((r) => [r.label, r.linkType, r.targetType, r.target, r.attributes])).toEqual([
      ["lyricist", LINK.lyricist, "artist", "堀内孝太", []],
      ["additional lyricist", LINK.lyricist, "artist", "山田花子", [ATTR.additional]],
      ["translator", LINK.translator, "artist", "鈴木一郎", []],
      ["composer", LINK.composer, "artist", "堀内孝平", []],
      ["arranger", LINK.arranger, "artist", "佐藤次郎", []],
      ["writer", LINK.writer, "artist", "田中三郎", []],
      ["writer", LINK.writer, "artist", "高橋四郎", []],
      ["publisher", LINK.publishing, "label", "日本テレビ音楽", []],
      ["publisher", LINK.publishing, "label", "ドワンゴ第七事業部", []],
      ["sub-publisher", LINK.publishing, "label", "ソニー・ミュージックパブリッシング", [ATTR.sub]],
    ]);
  });

  it("skips unknown roles, rights-holder persons, and UNKNOWN PUBLISHER", () => {
    const credits = [c("演奏", "誰か"), c("作詞", "権利者　山田太郎"), c("出版者", "UNKNOWN PUBLISHER")];
    const { rels, skipped } = mapCredits(credits);
    expect(rels).toEqual([]);
    expect(skipped).toEqual([
      { credit: credits[0], reason: "not mapped" },
      { credit: credits[1], reason: "rights holder" },
      { credit: credits[2], reason: "unknown publisher" },
    ]);
  });

  it("maps a rights-holder company to publisher whatever the role", () => {
    const { rels } = mapCredits([c("作曲", "権利者　㈱ソニー・ミュージックパブリッシング")]);
    expect(rels.map((r) => [r.label, r.targetType, r.target])).toEqual([["publisher", "label", "ソニー・ミュージックパブリッシング"]]);
  });

  it("merges duplicates across JASRAC and NexTone and keeps first-seen order", () => {
    const credits = [
      c("作詞", "かいりきベア"),
      c("作曲", "かいりきベア"),
      c("作詞", "かいりきベア", "NexTone"),
      c("出版者", "ドワンゴ 第７事業部"),
      c("出版社", "株式会社 ドワンゴ 第七事業部", "NexTone"),
    ];
    const { rels } = mapCredits(credits);
    expect(rels.map((r) => [r.label, r.target, r.from.length])).toEqual([
      ["lyricist", "かいりきベア", 2],
      ["composer", "かいりきベア", 1],
      ["publisher", "ドワンゴ第7事業部", 1],
      ["publisher", "ドワンゴ第七事業部", 1],
    ]);
    expect(rels[0].from).toEqual([credits[0], credits[2]]);
  });

  it("does not merge a plain lyricist with an additional lyricist", () => {
    const { rels } = mapCredits([c("作詞", "A"), c("補詞", "A")]);
    expect(rels.length).toBe(2);
  });
});

describe("workKind", () => {
  it("is song when any role contains 詞", () => {
    expect(workKind([c("作曲", "A"), c("作詞", "B")])).toBe("song");
    expect(workKind([c("訳詞", "B")])).toBe("song");
    expect(workKind([c("作曲作詞", "B")])).toBe("song");
  });
  it("is instrumental when only 作曲 or 編曲 and publishers", () => {
    expect(workKind([c("作曲", "A"), c("出版者", "P")])).toBe("instrumental");
    expect(workKind([c("編曲", "A")])).toBe("instrumental");
  });
  it("is unknown for 不明, publishers only, or no credits", () => {
    expect(workKind([c("不明", "A"), c("作曲", "B")])).toBe("unknown");
    expect(workKind([c("出版者", "P")])).toBe("unknown");
    expect(workKind([])).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/mapping.test.ts`
Expected: FAIL, cannot resolve `../src/mapping`.

- [ ] **Step 3: Write the implementation**

`src/mapping.ts`:

```ts
import { fold, isCompany, RIGHTS_HOLDER, stripRightsHolder, targetName } from "./normalize";
import type { Credit } from "./types";

export const LINK = {
  lyricist: "3e48faba-ec01-47fd-8e89-30e81161661c",
  translator: "da6c5d8a-ce13-474d-9375-61feb29039a5",
  composer: "d59d99ea-23d4-4a80-b066-edca32ee158f",
  writer: "a255bca1-b157-4518-9108-7b147dc3fc68",
  arranger: "d3fd781c-5894-47e2-8c12-86cc0e2c8d08",
  publishing: "05ee6f18-4517-342d-afdf-5897f64276e3",
} as const;

export const ATTR = {
  additional: "0a5341f8-3b1d-4f99-a0c6-26b7f4e42c7f",
  sub: "4521ce8e-3d24-4b64-9805-59df6f3a4740",
} as const;

export const WORK_ATTR = { jasrac: 3, nextone: 33 } as const;
export const WORK_TYPE_SONG = 17;
export const LANG_NO_LYRICS = 486;

export type TargetType = "artist" | "label";

export interface SeedRel {
  linkType: string;
  targetType: TargetType;
  target: string;
  attributes: string[];
  label: string;
  from: Credit[];
}

export type SkipReason = "not mapped" | "rights holder" | "unknown publisher";

export interface SkippedCredit {
  credit: Credit;
  reason: SkipReason;
}

interface RoleMap {
  linkType: string;
  targetType: TargetType;
  attributes: string[];
  label: string;
}

const PUBLISHER: RoleMap = { linkType: LINK.publishing, targetType: "label", attributes: [], label: "publisher" };

const ROLES: Record<string, RoleMap> = {
  作詞: { linkType: LINK.lyricist, targetType: "artist", attributes: [], label: "lyricist" },
  補詞: { linkType: LINK.lyricist, targetType: "artist", attributes: [ATTR.additional], label: "additional lyricist" },
  訳詞: { linkType: LINK.translator, targetType: "artist", attributes: [], label: "translator" },
  作曲: { linkType: LINK.composer, targetType: "artist", attributes: [], label: "composer" },
  編曲: { linkType: LINK.arranger, targetType: "artist", attributes: [], label: "arranger" },
  作曲作詞: { linkType: LINK.writer, targetType: "artist", attributes: [], label: "writer" },
  不明: { linkType: LINK.writer, targetType: "artist", attributes: [], label: "writer" },
  出版者: PUBLISHER,
  出版社: PUBLISHER,
  サブ出版: { linkType: LINK.publishing, targetType: "label", attributes: [ATTR.sub], label: "sub-publisher" },
};

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export function mapCredits(credits: Credit[]): { rels: SeedRel[]; skipped: SkippedCredit[] } {
  const rels: SeedRel[] = [];
  const skipped: SkippedCredit[] = [];
  for (const credit of credits) {
    let name = credit.name;
    let map: RoleMap | undefined;
    if (fold(name).toUpperCase() === "UNKNOWN PUBLISHER") {
      skipped.push({ credit, reason: "unknown publisher" });
      continue;
    }
    if (RIGHTS_HOLDER.test(name)) {
      name = stripRightsHolder(name);
      if (!isCompany(name)) {
        skipped.push({ credit, reason: "rights holder" });
        continue;
      }
      map = PUBLISHER;
    } else {
      map = ROLES[fold(credit.role)];
    }
    const target = map ? targetName(name) : "";
    if (!map || target.length === 0) {
      skipped.push({ credit, reason: "not mapped" });
      continue;
    }
    const existing = rels.find(
      (r) => r.linkType === map!.linkType && r.target === target && sameSet(r.attributes, map!.attributes),
    );
    if (existing) {
      existing.from.push(credit);
    } else {
      rels.push({ ...map, attributes: [...map.attributes], target, from: [credit] });
    }
  }
  return { rels, skipped };
}

export type WorkKind = "song" | "instrumental" | "unknown";

export function workKind(credits: Credit[]): WorkKind {
  const roles = credits.map((c) => fold(c.role));
  if (roles.some((r) => r.includes("詞"))) return "song";
  if (roles.some((r) => r === "不明")) return "unknown";
  if (roles.some((r) => r === "作曲" || r === "編曲")) return "instrumental";
  return "unknown";
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/mapping.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz/src/mapping.ts scripts/jasrac-minc-work-to-musicbrainz/test/mapping.test.ts
git commit -m "Map JASRAC and NexTone credits to MusicBrainz relationships"
```

---

### Task 6: MusicBrainz client

**Files:**
- Create: `src/musicbrainz.ts`
- Test: `test/musicbrainz.test.ts`

**Interfaces:**
- Consumes: `WorkHit`, `MbWork`, `MbRelation` (Task 1).
- Produces: `MbNotFound` (Error subclass), `MbOptions { fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void> }`, `toWorkHit(json)`, `toMbWork(json)`, `searchByIswc(iswc, opts?)`, `searchByTitle(title, opts?)`, `lookupWork(mbid, opts?)`, `parseWorkRef(text)`, `iswcQuery(iswc)`, `titleQuery(title)`.

- [ ] **Step 1: Write the failing tests**

`test/musicbrainz.test.ts`:

```ts
import {
  iswcQuery,
  lookupWork,
  MbNotFound,
  parseWorkRef,
  searchByIswc,
  searchByTitle,
  titleQuery,
  toMbWork,
  toWorkHit,
} from "../src/musicbrainz";
import { LINK } from "../src/mapping";
import { mbJson } from "./helpers";

const LEMON = "d69ecd96-bb2c-461f-9762-29102d2b50a1";

function fakeFetch(responses: { status: number; body?: unknown }[]) {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const r = responses.shift() ?? { status: 500 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    } as Response;
  }) as typeof fetch;
  return { fetchFn, calls };
}

const noSleep = async () => {};

describe("queries", () => {
  it("quotes the formatted ISWC", () => {
    expect(iswcQuery("T-924.390.287-6")).toBe('iswc:"T-924.390.287-6"');
  });
  it("quotes and escapes the title", () => {
    expect(titleQuery('Say "Hi"')).toBe('work:"Say \\"Hi\\""');
  });
});

describe("toWorkHit", () => {
  it("reads the search fixture", () => {
    const hit = toWorkHit((mbJson("mb-work-search-iswc") as { works: unknown[] }).works[0]);
    expect(hit.mbid).toBe(LEMON);
    expect(hit.title).toBe("Lemon");
    expect(hit.type).toBe("Song");
    expect(hit.iswcs).toEqual(["T-924.390.287-6"]);
    expect(hit.writers).toContain("米津玄師 (composer)");
    expect(hit.writers).toContain("米津玄師 (lyricist)");
  });
});

describe("toMbWork", () => {
  it("reads the lookup fixture", () => {
    const w = toMbWork(mbJson("mb-work-lookup"));
    expect(w.mbid).toBe(LEMON);
    expect(w.title).toBe("Lemon");
    expect(w.type).toBe("Song");
    expect(w.languages).toEqual(["jpn"]);
    expect(w.iswcs).toEqual(["T-924.390.287-6"]);
    expect(w.attributes).toContainEqual({ type: "JASRAC ID", value: "720-5540-5" });
    expect(w.attributes.length).toBe(12);
    const lyr = w.relations.find((r) => r.linkTypeId === LINK.lyricist)!;
    expect(lyr).toEqual({ linkTypeId: LINK.lyricist, targetType: "artist", name: "米津玄師", sortName: "Yonezu, Kenshi", attributes: [] });
    expect(w.relations.filter((r) => r.linkTypeId === LINK.publishing).map((r) => r.name)).toEqual(["HORIPRO", "リイシューレコーズ", "日音"]);
  });
});

describe("searchByIswc", () => {
  it("requests the quoted ISWC and keeps only hits carrying it", async () => {
    const body = mbJson("mb-work-search-iswc");
    const { fetchFn, calls } = fakeFetch([{ status: 200, body }]);
    const hits = await searchByIswc("T-924.390.287-6", { fetchFn, sleep: noSleep });
    expect(calls[0]).toBe('https://musicbrainz.org/ws/2/work/?fmt=json&limit=25&query=iswc%3A%22T-924.390.287-6%22');
    expect(hits.map((h) => h.mbid)).toEqual([LEMON]);
    const none = await searchByIswc("T-000.000.000-0", { fetchFn: fakeFetch([{ status: 200, body }]).fetchFn, sleep: noSleep });
    expect(none).toEqual([]);
  });

  it("retries twice on 503 with a 2 s wait, then throws", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    const { fetchFn, calls } = fakeFetch([{ status: 503 }, { status: 503 }, { status: 200, body: mbJson("mb-work-search-iswc") }]);
    const hits = await searchByIswc("T-924.390.287-6", { fetchFn, sleep });
    expect(hits.length).toBe(1);
    expect(calls.length).toBe(3);
    expect(waits).toEqual([2000, 2000]);
    const bad = fakeFetch([{ status: 503 }, { status: 503 }, { status: 503 }]);
    await expect(searchByIswc("T-924.390.287-6", { fetchFn: bad.fetchFn, sleep })).rejects.toThrow("MusicBrainz responded with HTTP 503");
    expect(bad.calls.length).toBe(3);
  });
});

describe("searchByTitle", () => {
  it("requests the quoted title", async () => {
    const { fetchFn, calls } = fakeFetch([{ status: 200, body: mbJson("mb-work-search-title") }]);
    const hits = await searchByTitle("Lemon", { fetchFn, sleep: noSleep });
    expect(calls[0]).toBe("https://musicbrainz.org/ws/2/work/?fmt=json&limit=25&query=work%3A%22Lemon%22");
    expect(hits[0].title).toBe("Lemon");
  });
});

describe("lookupWork", () => {
  it("requests artist and label relations", async () => {
    const { fetchFn, calls } = fakeFetch([{ status: 200, body: mbJson("mb-work-lookup") }]);
    const w = await lookupWork(LEMON, { fetchFn, sleep: noSleep });
    expect(calls[0]).toBe(`https://musicbrainz.org/ws/2/work/${LEMON}?fmt=json&inc=artist-rels+label-rels`);
    expect(w.title).toBe("Lemon");
  });
  it("throws MbNotFound on 404 and a message on other errors", async () => {
    await expect(lookupWork(LEMON, { fetchFn: fakeFetch([{ status: 404 }]).fetchFn, sleep: noSleep })).rejects.toBeInstanceOf(MbNotFound);
    await expect(lookupWork(LEMON, { fetchFn: fakeFetch([{ status: 500 }]).fetchFn, sleep: noSleep })).rejects.toThrow("MusicBrainz responded with HTTP 500");
  });
});

describe("parseWorkRef", () => {
  it("accepts a bare MBID or a work URL", () => {
    expect(parseWorkRef(` ${LEMON} `)).toBe(LEMON);
    expect(parseWorkRef(`https://musicbrainz.org/work/${LEMON}`)).toBe(LEMON);
    expect(parseWorkRef(`https://beta.musicbrainz.org/work/${LEMON}/edit`)).toBe(LEMON);
    expect(parseWorkRef(LEMON.toUpperCase())).toBe(LEMON);
  });
  it("rejects other text", () => {
    expect(parseWorkRef("")).toBeNull();
    expect(parseWorkRef("Lemon")).toBeNull();
    expect(parseWorkRef(`https://musicbrainz.org/artist/${LEMON}`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/musicbrainz.test.ts`
Expected: FAIL, cannot resolve `../src/musicbrainz`.

- [ ] **Step 3: Write the implementation**

`src/musicbrainz.ts`:

```ts
import type { MbRelation, MbWork, WorkHit } from "./types";

const WS = "https://musicbrainz.org/ws/2/";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export class MbNotFound extends Error {
  constructor() {
    super("Work not found");
    this.name = "MbNotFound";
  }
}

export interface MbOptions {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Json = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function arr(v: unknown): Json[] {
  return Array.isArray(v) ? (v as Json[]) : [];
}

async function request(path: string, opts: MbOptions): Promise<unknown> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(WS + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (res.status === 503 && attempt < 2) {
      await sleep(2000);
      continue;
    }
    if (res.status === 404) throw new MbNotFound();
    if (!res.ok) throw new Error(`MusicBrainz responded with HTTP ${res.status}`);
    return res.json();
  }
}

function luceneQuote(s: string): string {
  return '"' + s.replace(/(["\\])/g, "\\$1") + '"';
}

export function iswcQuery(iswc: string): string {
  return `iswc:${luceneQuote(iswc)}`;
}

export function titleQuery(title: string): string {
  return `work:${luceneQuote(title)}`;
}

export function toWorkHit(json: unknown): WorkHit {
  const j = (json ?? {}) as Json;
  const writers = arr(j.relations)
    .filter((r) => r.artist)
    .map((r) => `${str((r.artist as Json).name) ?? ""} (${str(r.type) ?? ""})`)
    .join(", ");
  return {
    mbid: str(j.id) ?? "",
    title: str(j.title) ?? "",
    type: str(j.type),
    iswcs: arr(j.iswcs).map(String),
    disambiguation: str(j.disambiguation),
    writers,
  };
}

function toRelation(r: Json): MbRelation | null {
  const target = (r.artist ?? r.label) as Json | undefined;
  if (!target) return null;
  return {
    linkTypeId: str(r["type-id"]) ?? "",
    targetType: r.artist ? "artist" : "label",
    name: str(target.name) ?? "",
    sortName: str(target["sort-name"]) ?? "",
    attributes: arr(r.attributes).map(String),
  };
}

export function toMbWork(json: unknown): MbWork {
  const j = (json ?? {}) as Json;
  return {
    mbid: str(j.id) ?? "",
    title: str(j.title) ?? "",
    type: str(j.type),
    languages: arr(j.languages).map(String),
    iswcs: arr(j.iswcs).map(String),
    attributes: arr(j.attributes).map((a) => ({ type: str(a.type) ?? "", value: str(a.value) ?? "" })),
    relations: arr(j.relations)
      .map(toRelation)
      .filter((r): r is MbRelation => r !== null),
  };
}

async function search(query: string, opts: MbOptions): Promise<WorkHit[]> {
  const body = (await request(`work/?fmt=json&limit=25&query=${encodeURIComponent(query)}`, opts)) as Json;
  return arr(body.works).map(toWorkHit);
}

export async function searchByIswc(iswc: string, opts: MbOptions = {}): Promise<WorkHit[]> {
  const hits = await search(iswcQuery(iswc), opts);
  return hits.filter((h) => h.iswcs.includes(iswc));
}

export async function searchByTitle(title: string, opts: MbOptions = {}): Promise<WorkHit[]> {
  return search(titleQuery(title), opts);
}

export async function lookupWork(mbid: string, opts: MbOptions = {}): Promise<MbWork> {
  return toMbWork(await request(`work/${mbid}?fmt=json&inc=artist-rels+label-rels`, opts));
}

/** MBID from a bare MBID or a musicbrainz.org work URL, lower-cased; null otherwise. */
export function parseWorkRef(text: string): string | null {
  const t = text.trim();
  const bare = new RegExp(`^${UUID}$`, "i").exec(t);
  if (bare) return t.toLowerCase();
  const url = new RegExp(`musicbrainz\\.org/work/(${UUID})`, "i").exec(t);
  return url ? url[1].toLowerCase() : null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/musicbrainz.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz/src/musicbrainz.ts scripts/jasrac-minc-work-to-musicbrainz/test/musicbrainz.test.ts
git commit -m "Add the MusicBrainz work search and lookup client"
```

---

### Task 7: Diff against an existing work

**Files:**
- Create: `src/diff.ts`
- Test: `test/diff.test.ts`

**Interfaces:**
- Consumes: `WorkInfo`, `MbWork` (Task 1); `SeedRel`, `WorkKind`, `WORK_TYPE_SONG`, `LANG_NO_LYRICS` (Task 5); `targetName` (Task 2).
- Produces: `WorkDiff`, `diffWork(info, seeds, kind, mb)`, `isEmpty(diff)`.

- [ ] **Step 1: Write the failing tests**

`test/diff.test.ts`:

```ts
import { diffWork, isEmpty } from "../src/diff";
import { LINK, mapCredits, workKind } from "../src/mapping";
import { toMbWork } from "../src/musicbrainz";
import type { MbWork, WorkInfo } from "../src/types";
import { mbJson } from "./helpers";

const lemon = (): MbWork => toMbWork(mbJson("mb-work-lookup"));

const info = (over: Partial<WorkInfo> = {}): WorkInfo => ({
  site: "jwid",
  sourceUrl: "https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=72055405&subSessionID=001&subSession=start",
  title: "Ｌｅｍｏｎ",
  jasracCode: "720-5540-5",
  nextoneCode: "N12345678",
  iswc: "T-924.390.287-6",
  domestic: true,
  titles: [],
  artists: [],
  credits: [
    { source: "JASRAC", name: "米津　玄師", role: "作詞", trust: null, society: null, note: null },
    { source: "JASRAC", name: "米津　玄師", role: "作曲", trust: null, society: null, note: null },
    { source: "JASRAC", name: "ホリプロ", role: "出版者", trust: null, society: null, note: null },
    { source: "JASRAC", name: "日音　株式会社", role: "サブ出版", trust: null, society: null, note: null },
  ],
  ...over,
});

describe("diffWork", () => {
  it("adds only what the work lacks", () => {
    const i = info();
    const { rels } = mapCredits(i.credits);
    const d = diffWork(i, rels, workKind(i.credits), lemon());
    expect(d.iswc).toBeNull();
    expect(d.jasracCode).toBeNull();
    expect(d.nextoneCode).toBe("N12345678");
    expect(d.typeId).toBeNull();
    expect(d.languageId).toBeNull();
    expect(d.iswcIndex).toBe(1);
    expect(d.attributeIndex).toBe(12);
    expect(d.rels.map((r) => [r.label, r.target])).toEqual([["publisher", "ホリプロ"]]);
    expect(isEmpty(d)).toBe(false);
  });

  it("matches existing relations by name or sort name, case-insensitively", () => {
    const i = info({
      credits: [
        { source: "JASRAC", name: "YONEZU, KENSHI", role: "作詞", trust: null, society: null, note: null },
        { source: "JASRAC", name: "horipro", role: "出版者", trust: null, society: null, note: null },
      ],
    });
    const d = diffWork(i, mapCredits(i.credits).rels, "song", lemon());
    expect(d.rels).toEqual([]);
  });

  it("keeps a relation of another link type to the same name", () => {
    const i = info({ credits: [{ source: "JASRAC", name: "米津　玄師", role: "編曲", trust: null, society: null, note: null }] });
    const d = diffWork(i, mapCredits(i.credits).rels, "instrumental", lemon());
    expect(d.rels.map((r) => r.linkType)).toEqual([LINK.arranger]);
  });

  it("adds ISWC, JASRAC code, type, and language to a bare work", () => {
    const bare: MbWork = { mbid: "x", title: "X", type: null, languages: [], iswcs: [], attributes: [], relations: [] };
    const i = info();
    const song = diffWork(i, [], "song", bare);
    expect(song.iswc).toBe("T-924.390.287-6");
    expect(song.jasracCode).toBe("720-5540-5");
    expect(song.typeId).toBe(17);
    expect(song.languageId).toBeNull();
    expect(song.iswcIndex).toBe(0);
    expect(song.attributeIndex).toBe(0);
    const inst = diffWork(i, [], "instrumental", bare);
    expect(inst.typeId).toBeNull();
    expect(inst.languageId).toBe(486);
    const unknown = diffWork(i, [], "unknown", bare);
    expect(unknown.typeId).toBeNull();
    expect(unknown.languageId).toBeNull();
  });

  it("does not set language when the work has one, nor type when it has one", () => {
    const d = diffWork(info(), [], "instrumental", lemon());
    expect(d.languageId).toBeNull();
    expect(d.typeId).toBeNull();
  });

  it("is empty when nothing is missing", () => {
    const i = info({ nextoneCode: null, credits: [] });
    const d = diffWork(i, [], "song", lemon());
    expect(isEmpty(d)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/diff.test.ts`
Expected: FAIL, cannot resolve `../src/diff`.

- [ ] **Step 3: Write the implementation**

`src/diff.ts`:

```ts
import { LANG_NO_LYRICS, WORK_TYPE_SONG, type SeedRel, type WorkKind } from "./mapping";
import { targetName } from "./normalize";
import type { MbWork, WorkInfo } from "./types";

export interface WorkDiff {
  iswc: string | null;
  jasracCode: string | null;
  nextoneCode: string | null;
  typeId: number | null;
  languageId: number | null;
  rels: SeedRel[];
  iswcIndex: number;
  attributeIndex: number;
}

function hasAttribute(mb: MbWork, type: string, value: string | null): boolean {
  return value !== null && mb.attributes.some((a) => a.type === type && a.value === value);
}

function hasRelation(mb: MbWork, seed: SeedRel): boolean {
  const want = seed.target.toLowerCase();
  return mb.relations.some(
    (r) =>
      r.linkTypeId === seed.linkType &&
      [targetName(r.name), targetName(r.sortName)].some((n) => n.toLowerCase() === want),
  );
}

export function diffWork(info: WorkInfo, seeds: SeedRel[], kind: WorkKind, mb: MbWork): WorkDiff {
  return {
    iswc: info.iswc !== null && !mb.iswcs.includes(info.iswc) ? info.iswc : null,
    jasracCode: info.jasracCode !== null && !hasAttribute(mb, "JASRAC ID", info.jasracCode) ? info.jasracCode : null,
    nextoneCode: info.nextoneCode !== null && !hasAttribute(mb, "NexTone ID", info.nextoneCode) ? info.nextoneCode : null,
    typeId: kind === "song" && mb.type === null ? WORK_TYPE_SONG : null,
    languageId: kind === "instrumental" && mb.languages.length === 0 ? LANG_NO_LYRICS : null,
    rels: seeds.filter((s) => !hasRelation(mb, s)),
    iswcIndex: mb.iswcs.length,
    attributeIndex: mb.attributes.length,
  };
}

export function isEmpty(diff: WorkDiff): boolean {
  return (
    diff.iswc === null &&
    diff.jasracCode === null &&
    diff.nextoneCode === null &&
    diff.typeId === null &&
    diff.languageId === null &&
    diff.rels.length === 0
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/diff.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz/src/diff.ts scripts/jasrac-minc-work-to-musicbrainz/test/diff.test.ts
git commit -m "Compute what an existing MusicBrainz work lacks"
```

---

### Task 8: Edit note

**Files:**
- Create: `src/note.ts`
- Test: `test/note.test.ts`

**Interfaces:**
- Consumes: `WorkInfo` (Task 1); `displayTitle` (Task 2).
- Produces: `NoteBlock = "artists" | "titles" | "credits"`, `SCRIPT_NAME = "JASRAC / MINC work to MusicBrainz"`, `buildEditNote(info, version, dropped?)`.

- [ ] **Step 1: Write the failing tests**

`test/note.test.ts`:

```ts
import { buildEditNote } from "../src/note";
import { parseJwid, parseMinc } from "../src/parser";
import { jwidDocument, mincDocument } from "./helpers";

describe("buildEditNote", () => {
  it("writes the full note for a J-WID work", () => {
    const info = parseJwid(jwidDocument("jwid-70342415"))!;
    expect(buildEditNote(info, "1.0.0")).toBe(
      [
        "YOUTHFUL (JASRAC 703-4241-5 / ISWC T-102.054.195-9)",
        "",
        "CREDITS",
        "作詞：堀内　孝太",
        "作詞：堀内　孝平",
        "作曲：堀内　孝太",
        "作曲：堀内　孝平",
        "出版者：日本テレビ音楽　株式会社（JASRAC）",
        "",
        "TITLES",
        "正題：ＹＯＵＴＨＦＵＬ ／ YOUTHFUL",
        "副題1：オープニング／ちはやふる（ＮＴＶ系アニメ） ／ チハヤフル ／ CHIHAYAFURU",
        "",
        "PERFORMERS",
        "９９　Ｒａｄｉｏ　Ｓｅｒｖｉｃｅ",
        "",
        "https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=70342415&subSessionID=001&subSession=start",
        "JASRAC / MINC work to MusicBrainz v1.0.0",
      ].join("\n"),
    );
  });

  it("prefixes NexTone credits, prefers trust over society, and dedupes lines", () => {
    const info = parseMinc(mincDocument("minc-25707965-N00913658"))!;
    const note = buildEditNote(info, "1.0.0");
    expect(note.startsWith("ダーリンダンス (JASRAC 257-0796-5 / NexTone N00913658 / ISWC T-302.445.339-8)\n")).toBe(true);
    expect(note).toContain("\nCREDITS\n作詞：かいりきベア（無信託）\n作曲：かいりきベア（無信託）\n出版者：ドワンゴ 第７事業部（部分信託）\n[NexTone] 作詞：かいりきベア\n[NexTone] 出版社：株式会社 ドワンゴ 第七事業部\n[NexTone] 作曲：かいりきベア\n\n");
    expect(note).toContain("\nTITLES\n正題：ダーリンダンス\n\n");
    expect(note).toContain("\nPERFORMERS\n神田 沙也加\nＫｏｔｏｎｅ\nＭｏｎｓｔｅｒＺ ＭＡＴＥ\n\n");
    expect(note.endsWith("\nhttps://www.minc.or.jp/saku/detail/?jcd=25707965&ncd=N00913658\nJASRAC / MINC work to MusicBrainz v1.0.0")).toBe(true);
  });

  it("omits empty blocks and caps performers at 10", () => {
    const info = parseJwid(jwidDocument("jwid-15233952"))!;
    const note = buildEditNote(info, "1.0.0");
    expect(note.startsWith("THE ALMIGHTY (JASRAC 152-3395-2)\n")).toBe(true);
    expect(note).not.toContain("PERFORMERS");
    expect(note).toContain("副題1：＊ペルソナ４より ／ ペルソナ　４　ヨリ ／ PERUSONA 4 YORI");
    const many = { ...info, artists: Array.from({ length: 12 }, (_, i) => `A${i + 1}`) };
    const capped = buildEditNote(many, "1.0.0");
    expect(capped).toContain("PERFORMERS\nA1\nA2\nA3\nA4\nA5\nA6\nA7\nA8\nA9\nA10\n… (12)\n");
    expect(capped).not.toContain("A11");
  });

  it("replaces dropped blocks with a pointer", () => {
    const info = parseJwid(jwidDocument("jwid-70342415"))!;
    const note = buildEditNote(info, "1.0.0", new Set(["artists", "titles", "credits"]));
    expect(note).toBe(
      [
        "YOUTHFUL (JASRAC 703-4241-5 / ISWC T-102.054.195-9)",
        "",
        "CREDITS omitted, see source page",
        "",
        "TITLES omitted, see source page",
        "",
        "PERFORMERS omitted, see source page",
        "",
        "https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=70342415&subSessionID=001&subSession=start",
        "JASRAC / MINC work to MusicBrainz v1.0.0",
      ].join("\n"),
    );
  });

  it("writes only the title when no identifier exists", () => {
    const info = { ...parseJwid(jwidDocument("jwid-70342415"))!, jasracCode: null, iswc: null };
    expect(buildEditNote(info, "1.0.0").split("\n")[0]).toBe("YOUTHFUL");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/note.test.ts`
Expected: FAIL, cannot resolve `../src/note`.

- [ ] **Step 3: Write the implementation**

`src/note.ts`:

```ts
import { displayTitle } from "./normalize";
import type { WorkInfo } from "./types";

export type NoteBlock = "artists" | "titles" | "credits";
export const SCRIPT_NAME = "JASRAC / MINC work to MusicBrainz";
const MAX_PERFORMERS = 10;

function block(name: string, lines: string[], omitted: boolean): string[] {
  if (omitted) return [`${name} omitted, see source page`, ""];
  if (lines.length === 0) return [];
  return [name, ...lines, ""];
}

export function buildEditNote(info: WorkInfo, version: string, dropped: Set<NoteBlock> = new Set()): string {
  const ids: string[] = [];
  if (info.jasracCode) ids.push(`JASRAC ${info.jasracCode}`);
  if (info.nextoneCode) ids.push(`NexTone ${info.nextoneCode}`);
  if (info.iswc) ids.push(`ISWC ${info.iswc}`);
  const header = ids.length > 0 ? `${displayTitle(info.title)} (${ids.join(" / ")})` : displayTitle(info.title);

  const creditLines: string[] = [];
  for (const c of info.credits) {
    const prefix = c.source === "NexTone" ? "[NexTone] " : "";
    const paren = c.trust ?? c.society;
    const line = `${prefix}${c.role}：${c.name}${paren ? `（${paren}）` : ""}`;
    if (!creditLines.includes(line)) creditLines.push(line);
  }
  const titleLines = info.titles.map((t) => `${t.kind}：${[t.title, t.kana, t.romaji].filter((s) => s !== null).join(" ／ ")}`);
  const performerLines = info.artists.slice(0, MAX_PERFORMERS);
  if (info.artists.length > MAX_PERFORMERS) performerLines.push(`… (${info.artists.length})`);

  return [
    header,
    "",
    ...block("CREDITS", creditLines, dropped.has("credits")),
    ...block("TITLES", titleLines, dropped.has("titles")),
    ...block("PERFORMERS", performerLines, dropped.has("artists")),
    info.sourceUrl,
    `${SCRIPT_NAME} v${version}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/note.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz/src/note.ts scripts/jasrac-minc-work-to-musicbrainz/test/note.test.ts
git commit -m "Build the MusicBrainz edit note from the work page"
```

---

### Task 9: Seed URLs and the length guard

**Files:**
- Create: `src/seed.ts`
- Test: `test/seed.test.ts`

**Interfaces:**
- Consumes: `WorkInfo` (Task 1); `displayTitle` (Task 2); `SeedRel`, `WorkKind`, `WORK_ATTR`, `WORK_TYPE_SONG`, `LANG_NO_LYRICS` (Task 5); `WorkDiff` (Task 7); `NoteBlock`, `buildEditNote` (Task 8).
- Produces: `MAX_URL = 8000`, `buildCreateUrl(info, seeds, kind, note)`, `buildEditUrl(mbid, diff, note)`, `fitUrl(build, info, version)` returning `{ url, dropped: NoteBlock[] }`.

- [ ] **Step 1: Write the failing tests**

`test/seed.test.ts`:

```ts
import { diffWork } from "../src/diff";
import { ATTR, LINK, mapCredits, workKind } from "../src/mapping";
import { toMbWork } from "../src/musicbrainz";
import { buildCreateUrl, buildEditUrl, fitUrl, MAX_URL } from "../src/seed";
import { parseJwid, parseMinc } from "../src/parser";
import { jwidDocument, mbJson, mincDocument } from "./helpers";

function params(url: string): [string, string][] {
  return Array.from(new URL(url).searchParams.entries());
}

describe("buildCreateUrl", () => {
  it("orders name, ISWC, attributes, type, rels, and note", () => {
    const info = parseMinc(mincDocument("minc-25707965-N00913658"))!;
    const { rels } = mapCredits(info.credits);
    const url = buildCreateUrl(info, rels, workKind(info.credits), "NOTE");
    expect(url.startsWith("https://musicbrainz.org/work/create?")).toBe(true);
    expect(params(url)).toEqual([
      ["edit-work.name", "ダーリンダンス"],
      ["edit-work.iswcs.0", "T-302.445.339-8"],
      ["edit-work.attributes.0.type_id", "3"],
      ["edit-work.attributes.0.value", "257-0796-5"],
      ["edit-work.attributes.1.type_id", "33"],
      ["edit-work.attributes.1.value", "N00913658"],
      ["edit-work.type_id", "17"],
      ["rels.0.type", LINK.lyricist],
      ["rels.0.target", "かいりきベア"],
      ["rels.1.type", LINK.composer],
      ["rels.1.target", "かいりきベア"],
      ["rels.2.type", LINK.publishing],
      ["rels.2.target", "ドワンゴ第7事業部"],
      ["rels.3.type", LINK.publishing],
      ["rels.3.target", "ドワンゴ第七事業部"],
      ["edit-work.edit_note", "NOTE"],
    ]);
  });

  it("seeds language for instrumental works and attributes for 補詞 and サブ出版", () => {
    const info = parseJwid(jwidDocument("jwid-70417750"))!;
    info.credits.push({ source: "JASRAC", name: "補詞者", role: "補詞", trust: null, society: null, note: null });
    info.credits.push({ source: "JASRAC", name: "サブ社", role: "サブ出版", trust: null, society: null, note: null });
    const { rels } = mapCredits(info.credits);
    const url = buildCreateUrl(info, rels, "instrumental", "N");
    const p = params(url);
    expect(p).toContainEqual(["edit-work.languages.0", "486"]);
    expect(p.some(([k]) => k === "edit-work.type_id")).toBe(false);
    expect(p).toContainEqual(["rels.2.attributes.0.type", ATTR.additional]);
    expect(p).toContainEqual(["rels.3.attributes.0.type", ATTR.sub]);
    expect(p.filter(([k]) => k.startsWith("edit-work.attributes")).length).toBe(2);
  });

  it("moves the article in the seeded name and skips absent fields", () => {
    const info = parseJwid(jwidDocument("jwid-15233952"))!;
    const p = params(buildCreateUrl(info, [], "unknown", "N"));
    expect(p).toEqual([
      ["edit-work.name", "THE ALMIGHTY"],
      ["edit-work.attributes.0.type_id", "3"],
      ["edit-work.attributes.0.value", "152-3395-2"],
      ["edit-work.edit_note", "N"],
    ]);
  });
});

describe("buildEditUrl", () => {
  it("continues indexes after existing values and sends no name", () => {
    const info = parseMinc(mincDocument("minc-25707965-N00913658"))!;
    const { rels } = mapCredits(info.credits);
    const diff = diffWork(info, rels, "song", toMbWork(mbJson("mb-work-lookup")));
    const url = buildEditUrl("d69ecd96-bb2c-461f-9762-29102d2b50a1", diff, "NOTE");
    expect(url.startsWith("https://musicbrainz.org/work/d69ecd96-bb2c-461f-9762-29102d2b50a1/edit?")).toBe(true);
    const p = params(url);
    expect(p[0]).toEqual(["edit-work.iswcs.1", "T-302.445.339-8"]);
    expect(p).toContainEqual(["edit-work.attributes.12.type_id", "3"]);
    expect(p).toContainEqual(["edit-work.attributes.12.value", "257-0796-5"]);
    expect(p).toContainEqual(["edit-work.attributes.13.type_id", "33"]);
    expect(p).toContainEqual(["edit-work.attributes.13.value", "N00913658"]);
    expect(p.some(([k]) => k === "edit-work.name" || k === "edit-work.type_id" || k === "edit-work.languages.0")).toBe(false);
    expect(p.filter(([k]) => /^rels\.\d+\.type$/.test(k)).length).toBe(4);
    expect(p[p.length - 1]).toEqual(["edit-work.edit_note", "NOTE"]);
  });
});

describe("fitUrl", () => {
  it("returns the full note when the URL is short", () => {
    const info = parseJwid(jwidDocument("jwid-70342415"))!;
    const r = fitUrl((note) => buildCreateUrl(info, [], "song", note), info, "1.0.0");
    expect(r.dropped).toEqual([]);
    expect(new URL(r.url).searchParams.get("edit-work.edit_note")).toContain("PERFORMERS");
  });

  it("drops artists, then titles, then credits until the URL fits", () => {
    const base = parseJwid(jwidDocument("jwid-70342415"))!;
    const long = (n: number) => Array.from({ length: n }, (_, i) => `名前${i}`);
    const artists = { ...base, artists: long(10).map((s) => s.repeat(300)) };
    const r1 = fitUrl((note) => buildCreateUrl(artists, [], "song", note), artists, "1.0.0");
    expect(r1.dropped).toEqual(["artists"]);
    expect(r1.url.length).toBeLessThanOrEqual(MAX_URL);
    const titles = { ...artists, titles: base.titles.map((t) => ({ ...t, title: t.title.repeat(200) })) };
    const r2 = fitUrl((note) => buildCreateUrl(titles, [], "song", note), titles, "1.0.0");
    expect(r2.dropped).toEqual(["artists", "titles"]);
    const credits = { ...titles, credits: base.credits.map((c) => ({ ...c, name: c.name.repeat(300) })) };
    const r3 = fitUrl((note) => buildCreateUrl(credits, [], "song", note), credits, "1.0.0");
    expect(r3.dropped).toEqual(["artists", "titles", "credits"]);
    expect(r3.url.length).toBeLessThanOrEqual(MAX_URL);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/seed.test.ts`
Expected: FAIL, cannot resolve `../src/seed`.

- [ ] **Step 3: Write the implementation**

`src/seed.ts`:

```ts
import type { WorkDiff } from "./diff";
import { LANG_NO_LYRICS, WORK_ATTR, WORK_TYPE_SONG, type SeedRel, type WorkKind } from "./mapping";
import { displayTitle } from "./normalize";
import { buildEditNote, type NoteBlock } from "./note";
import type { WorkInfo } from "./types";

export const MAX_URL = 8000;
const MB = "https://musicbrainz.org";

function addAttribute(p: URLSearchParams, index: number, typeId: number, value: string): number {
  p.append(`edit-work.attributes.${index}.type_id`, String(typeId));
  p.append(`edit-work.attributes.${index}.value`, value);
  return index + 1;
}

function addRels(p: URLSearchParams, rels: SeedRel[]): void {
  rels.forEach((r, n) => {
    p.append(`rels.${n}.type`, r.linkType);
    p.append(`rels.${n}.target`, r.target);
    r.attributes.forEach((a, k) => p.append(`rels.${n}.attributes.${k}.type`, a));
  });
}

export function buildCreateUrl(info: WorkInfo, seeds: SeedRel[], kind: WorkKind, note: string): string {
  const p = new URLSearchParams();
  p.append("edit-work.name", displayTitle(info.title));
  if (info.iswc) p.append("edit-work.iswcs.0", info.iswc);
  let i = 0;
  if (info.jasracCode) i = addAttribute(p, i, WORK_ATTR.jasrac, info.jasracCode);
  if (info.nextoneCode) i = addAttribute(p, i, WORK_ATTR.nextone, info.nextoneCode);
  if (kind === "song") p.append("edit-work.type_id", String(WORK_TYPE_SONG));
  if (kind === "instrumental") p.append("edit-work.languages.0", String(LANG_NO_LYRICS));
  addRels(p, seeds);
  p.append("edit-work.edit_note", note);
  return `${MB}/work/create?${p.toString()}`;
}

export function buildEditUrl(mbid: string, diff: WorkDiff, note: string): string {
  const p = new URLSearchParams();
  if (diff.iswc) p.append(`edit-work.iswcs.${diff.iswcIndex}`, diff.iswc);
  let i = diff.attributeIndex;
  if (diff.jasracCode) i = addAttribute(p, i, WORK_ATTR.jasrac, diff.jasracCode);
  if (diff.nextoneCode) i = addAttribute(p, i, WORK_ATTR.nextone, diff.nextoneCode);
  if (diff.typeId !== null) p.append("edit-work.type_id", String(diff.typeId));
  if (diff.languageId !== null) p.append("edit-work.languages.0", String(diff.languageId));
  addRels(p, diff.rels);
  p.append("edit-work.edit_note", note);
  return `${MB}/work/${mbid}/edit?${p.toString()}`;
}

const DROP_ORDER: NoteBlock[] = ["artists", "titles", "credits"];

/** Builds the URL with the fullest edit note that keeps it within MAX_URL. */
export function fitUrl(
  build: (note: string) => string,
  info: WorkInfo,
  version: string,
): { url: string; dropped: NoteBlock[] } {
  const dropped: NoteBlock[] = [];
  let url = build(buildEditNote(info, version, new Set(dropped)));
  for (const block of DROP_ORDER) {
    if (url.length <= MAX_URL) break;
    dropped.push(block);
    url = build(buildEditNote(info, version, new Set(dropped)));
  }
  return { url, dropped };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/seed.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz/src/seed.ts scripts/jasrac-minc-work-to-musicbrainz/test/seed.test.ts
git commit -m "Build the seeded MusicBrainz work editor URLs"
```

---

### Task 10: Panel UI

**Files:**
- Create: `src/ui.ts`
- Test: `test/ui.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 9; `MbNotFound`, `parseWorkRef` (Task 6).
- Produces: `MARKER = "jasrac-minc-mb"`, `UiDeps`, `enhancePage(doc, info, deps): HTMLElement`.

Panel element classes: root `jasrac-minc-mb jasrac-minc-mb-panel`; `jasrac-minc-mb-summary`; `jasrac-minc-mb-rels` (table of mapped relationships); `jasrac-minc-mb-skipped`; `jasrac-minc-mb-ref` (input); `jasrac-minc-mb-search` (button); `jasrac-minc-mb-status`; `jasrac-minc-mb-picker`; `jasrac-minc-mb-diff`; `jasrac-minc-mb-create` (button); `jasrac-minc-mb-update` (button); `jasrac-minc-mb-notice` (shortened note / popup link container); `jasrac-minc-mb-retry` (button inside status).

- [ ] **Step 1: Write the failing tests**

`test/ui.test.ts`:

```ts
import { MbNotFound, toMbWork, toWorkHit } from "../src/musicbrainz";
import { parseJwid, parseMinc } from "../src/parser";
import { enhancePage, MARKER, type UiDeps } from "../src/ui";
import type { MbWork, WorkHit } from "../src/types";
import { jwidDocument, mbJson, mincDocument } from "./helpers";

const LEMON = "d69ecd96-bb2c-461f-9762-29102d2b50a1";
const lemonHit = (): WorkHit => toWorkHit((mbJson("mb-work-search-iswc") as { works: unknown[] }).works[0]);
const lemonWork = (): MbWork => toMbWork(mbJson("mb-work-lookup"));
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

function deps(over: Partial<UiDeps> = {}) {
  const opened: string[] = [];
  const d: UiDeps = {
    version: "1.0.0",
    searchByIswc: async () => [],
    searchByTitle: async () => [],
    lookupWork: async () => lemonWork(),
    open: (url) => {
      opened.push(url);
      return {} as Window;
    },
    ...over,
  };
  return { d, opened };
}

const q = <T extends Element>(root: ParentNode, cls: string) => root.querySelector<T>(`.jasrac-minc-mb-${cls}`)!;

describe("enhancePage", () => {
  it("places the panel after .baseinfo on J-WID and before #jasrac-area on minc", () => {
    const jw = jwidDocument("jwid-70342415");
    const panel = enhancePage(jw, parseJwid(jw)!, deps().d);
    expect(panel.classList.contains(MARKER)).toBe(true);
    expect(jw.querySelector(".baseinfo")!.nextElementSibling).toBe(panel);
    const mc = mincDocument("minc-70342415");
    const panel2 = enhancePage(mc, parseMinc(mc)!, deps().d);
    expect(mc.querySelector("#jasrac-area")!.previousElementSibling).toBe(panel2);
  });

  it("shows the summary, mapped relationships, and skipped credits", () => {
    const doc = jwidDocument("jwid-70342415");
    const info = parseJwid(doc)!;
    info.credits.push({ source: "JASRAC", name: "誰か", role: "演奏", trust: null, society: null, note: null });
    const panel = enhancePage(doc, info, deps().d);
    expect(q(panel, "summary").textContent).toContain("YOUTHFUL");
    expect(q(panel, "summary").textContent).toContain("703-4241-5");
    expect(q(panel, "summary").textContent).toContain("T-102.054.195-9");
    expect(q(panel, "summary").textContent).toContain("song");
    const rows = Array.from(q(panel, "rels").querySelectorAll("tbody tr")).map((tr) => tr.textContent);
    expect(rows.length).toBe(5);
    expect(rows[0]).toContain("lyricist");
    expect(rows[0]).toContain("堀内孝太");
    expect(rows[4]).toContain("publisher");
    expect(rows[4]).toContain("日本テレビ音楽");
    expect(q(panel, "skipped").textContent).toContain("誰か");
    expect(q(panel, "skipped").textContent).toContain("not mapped");
  });

  it("searches by ISWC on creation, preselects a single hit, and enables Update after lookup", async () => {
    const doc = jwidDocument("jwid-70342415");
    const calls: string[] = [];
    const { d, opened } = deps({
      searchByIswc: async (iswc) => {
        calls.push(iswc);
        return [lemonHit()];
      },
    });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    expect(q(panel, "status").textContent).toBe("Searching MusicBrainz by ISWC…");
    await settle();
    expect(calls).toEqual(["T-102.054.195-9"]);
    const radio = q<HTMLInputElement>(panel, "picker").querySelector<HTMLInputElement>("input[type=radio]")!;
    expect(radio.checked).toBe(true);
    expect(radio.value).toBe(LEMON);
    expect(q(panel, "diff").textContent).toContain("Will add:");
    expect(q(panel, "diff").textContent).toContain("T-102.054.195-9");
    expect(q(panel, "diff").textContent).toContain("703-4241-5");
    const update = q<HTMLButtonElement>(panel, "update");
    expect(update.disabled).toBe(false);
    expect(update.textContent).toBe('Update "Lemon"');
    update.click();
    expect(opened.length).toBe(1);
    expect(opened[0].startsWith(`https://musicbrainz.org/work/${LEMON}/edit?`)).toBe(true);
    expect(opened[0]).toContain("edit-work.iswcs.1=T-102.054.195-9");
  });

  it("reports no ISWC hit and does not search when the work has no ISWC", async () => {
    const doc = jwidDocument("jwid-70342415");
    const panel = enhancePage(doc, parseJwid(doc)!, deps().d);
    await settle();
    expect(q(panel, "status").textContent).toBe("No work with this ISWC");
    const doc2 = jwidDocument("jwid-15233952");
    let called = false;
    const panel2 = enhancePage(doc2, parseJwid(doc2)!, deps({ searchByIswc: async () => ((called = true), []) }).d);
    await settle();
    expect(called).toBe(false);
    expect(q(panel2, "status").textContent).toBe("");
  });

  it("searches by title on click without preselecting, and ignores a second click while running", async () => {
    const doc = jwidDocument("jwid-15233952");
    let resolve: (h: WorkHit[]) => void = () => {};
    let calls = 0;
    const { d } = deps({
      searchByTitle: (title) => {
        calls++;
        expect(title).toBe("THE ALMIGHTY");
        return new Promise<WorkHit[]>((r) => (resolve = r));
      },
    });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    q<HTMLButtonElement>(panel, "search").click();
    q<HTMLButtonElement>(panel, "search").click();
    expect(calls).toBe(1);
    expect(q(panel, "status").textContent).toBe("Searching MusicBrainz by title…");
    resolve([lemonHit(), { ...lemonHit(), mbid: "22222222-2222-4222-8222-222222222222", title: "Lemon (2)" }]);
    await settle();
    const radios = q(panel, "picker").querySelectorAll<HTMLInputElement>("input[type=radio]");
    expect(radios.length).toBe(2);
    expect(Array.from(radios).some((r) => r.checked)).toBe(false);
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(true);
    expect(q(panel, "picker").textContent).toContain("Lemon (2)");
  });

  it("accepts a pasted work URL, rejects other text, and clears the picker selection", async () => {
    const doc = jwidDocument("jwid-70342415");
    const looked: string[] = [];
    const { d } = deps({
      searchByIswc: async () => [lemonHit()],
      lookupWork: async (mbid) => {
        looked.push(mbid);
        return lemonWork();
      },
    });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    await settle();
    const input = q<HTMLInputElement>(panel, "ref");
    input.value = "not a work";
    input.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event("input"));
    await settle();
    expect(q(panel, "status").textContent).toBe("Not a MusicBrainz work URL or MBID");
    input.value = "https://musicbrainz.org/work/33333333-3333-4333-8333-333333333333";
    input.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event("input"));
    await settle();
    expect(looked).toEqual([LEMON, "33333333-3333-4333-8333-333333333333"]);
    const radio = q(panel, "picker").querySelector<HTMLInputElement>("input[type=radio]")!;
    expect(radio.checked).toBe(false);
  });

  it("shows Nothing to add and disables Update when the diff is empty", async () => {
    const doc = jwidDocument("jwid-70342415");
    const info = parseJwid(doc)!;
    info.iswc = "T-924.390.287-6";
    info.jasracCode = "720-5540-5";
    info.credits = [];
    const { d } = deps({ searchByIswc: async () => [lemonHit()] });
    const panel = enhancePage(doc, info, d);
    await settle();
    expect(q(panel, "diff").textContent).toBe("Nothing to add");
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(true);
  });

  it("shows Work not found on 404 and a Retry button on other errors", async () => {
    const doc = jwidDocument("jwid-70342415");
    let fail: Error = new MbNotFound();
    const { d } = deps({
      searchByIswc: async () => [lemonHit()],
      lookupWork: async () => {
        throw fail;
      },
    });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    await settle();
    expect(q(panel, "status").textContent).toBe("Work not found");
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(true);
    fail = new Error("MusicBrainz responded with HTTP 503");
    const input = q<HTMLInputElement>(panel, "ref");
    input.value = LEMON;
    input.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event("input"));
    await settle();
    expect(q(panel, "status").textContent).toContain("MusicBrainz responded with HTTP 503");
    const retry = q<HTMLButtonElement>(panel, "retry");
    fail = new MbNotFound();
    retry.click();
    await settle();
    expect(q(panel, "status").textContent).toBe("Work not found");
  });

  it("discards a lookup result that arrives after the target changed", async () => {
    const doc = jwidDocument("jwid-70342415");
    const pending: ((w: MbWork) => void)[] = [];
    const { d } = deps({
      searchByIswc: async () => [lemonHit()],
      lookupWork: () => new Promise<MbWork>((r) => pending.push(r)),
    });
    const panel = enhancePage(doc, parseJwid(doc)!, d);
    await settle();
    const input = q<HTMLInputElement>(panel, "ref");
    input.value = "33333333-3333-4333-8333-333333333333";
    input.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event("input"));
    await settle();
    expect(pending.length).toBe(2);
    pending[0]({ ...lemonWork(), title: "STALE" });
    await settle();
    expect(q(panel, "status").textContent).toBe("Loading work…");
    expect(q<HTMLButtonElement>(panel, "update").disabled).toBe(true);
    pending[1]({ ...lemonWork(), title: "FRESH" });
    await settle();
    expect(q<HTMLButtonElement>(panel, "update").textContent).toBe('Update "FRESH"');
  });

  it("creates with a seeded URL and shows a link when the popup is blocked", () => {
    const doc = mincDocument("minc-25707965-N00913658");
    const { d, opened } = deps({ open: () => null });
    const panel = enhancePage(doc, parseMinc(doc)!, d);
    q<HTMLButtonElement>(panel, "create").click();
    expect(opened.length).toBe(0);
    const link = q(panel, "notice").querySelector("a")!;
    expect(link.textContent).toBe("Popup blocked, open this link");
    expect(link.href.startsWith("https://musicbrainz.org/work/create?")).toBe(true);
    expect(link.href).toContain("edit-work.attributes.1.value=N00913658");
    expect(link.target).toBe("_blank");
  });

  it("tells when the edit note was shortened", () => {
    const doc = jwidDocument("jwid-70342415");
    const info = parseJwid(doc)!;
    info.artists = Array.from({ length: 10 }, (_, i) => `名前${i}`.repeat(300));
    const { d, opened } = deps();
    const panel = enhancePage(doc, info, d);
    q<HTMLButtonElement>(panel, "create").click();
    expect(opened[0].length).toBeLessThanOrEqual(8000);
    expect(q(panel, "notice").textContent).toBe("Edit note shortened: artists");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/ui.test.ts`
Expected: FAIL, cannot resolve `../src/ui`.

- [ ] **Step 3: Write the implementation**

`src/ui.ts`:

```ts
import { diffWork, isEmpty, type WorkDiff } from "./diff";
import { mapCredits, workKind, type SeedRel, type SkippedCredit, type WorkKind } from "./mapping";
import { MbNotFound, parseWorkRef } from "./musicbrainz";
import { displayTitle } from "./normalize";
import { buildCreateUrl, buildEditUrl, fitUrl } from "./seed";
import type { MbWork, WorkHit, WorkInfo } from "./types";

export const MARKER = "jasrac-minc-mb";

export interface UiDeps {
  version: string;
  searchByIswc: (iswc: string) => Promise<WorkHit[]>;
  searchByTitle: (title: string) => Promise<WorkHit[]>;
  lookupWork: (mbid: string) => Promise<MbWork>;
  open: (url: string) => Window | null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (className) e.className = `${MARKER}-${className}`;
  if (text) e.textContent = text;
  return e;
}

interface State {
  seeds: SeedRel[];
  skipped: SkippedCredit[];
  kind: WorkKind;
  hits: WorkHit[];
  target: string | null;
  work: MbWork | null;
  diff: WorkDiff | null;
  seq: number;
  searching: boolean;
}

const PANEL_STYLE = "margin:8px 0;padding:8px;border:1px solid #999;background:#f7f7ff;color:#000;font-size:13px;line-height:1.5";

export function enhancePage(doc: Document, info: WorkInfo, deps: UiDeps): HTMLElement {
  const { rels, skipped } = mapCredits(info.credits);
  const state: State = {
    seeds: rels,
    skipped,
    kind: workKind(info.credits),
    hits: [],
    target: null,
    work: null,
    diff: null,
    seq: 0,
    searching: false,
  };

  const panel = el(doc, "div", "panel");
  panel.classList.add(MARKER);
  panel.style.cssText = PANEL_STYLE;

  const heading = el(doc, "div", "heading", `MusicBrainz (${deps.version})`);
  heading.style.fontWeight = "bold";

  const summary = el(doc, "div", "summary");
  const ids = [info.jasracCode && `JASRAC ${info.jasracCode}`, info.nextoneCode && `NexTone ${info.nextoneCode}`, info.iswc && `ISWC ${info.iswc}`]
    .filter((s): s is string => !!s)
    .join(" / ");
  summary.textContent = `${displayTitle(info.title)}${ids ? ` (${ids})` : ""} — ${state.kind}`;

  const relsTable = el(doc, "table", "rels");
  const thead = el(doc, "thead");
  const hr = el(doc, "tr");
  for (const h of ["Relationship", "Target", "From"]) hr.appendChild(el(doc, "th", "", h));
  thead.appendChild(hr);
  const tbody = el(doc, "tbody");
  for (const r of state.seeds) {
    const tr = el(doc, "tr");
    tr.appendChild(el(doc, "td", "", r.label));
    tr.appendChild(el(doc, "td", "", r.target));
    tr.appendChild(el(doc, "td", "", r.from.map((c) => `${c.source} ${c.role} ${c.name}`).join(", ")));
    tbody.appendChild(tr);
  }
  relsTable.append(thead, tbody);

  const skippedLine = el(doc, "div", "skipped");
  if (state.skipped.length > 0) {
    skippedLine.textContent = `Skipped: ${state.skipped.map((s) => `${s.credit.role} ${s.credit.name} (${s.reason})`).join("; ")}`;
  }

  const targetRow = el(doc, "div", "target");
  const ref = el(doc, "input", "ref");
  ref.type = "text";
  ref.placeholder = "MusicBrainz work URL or MBID";
  ref.style.width = "24em";
  const search = el(doc, "button", "search", "Search by title");
  search.type = "button";
  const status = el(doc, "span", "status");
  status.style.marginLeft = "8px";
  targetRow.append(ref, " ", search, status);

  const picker = el(doc, "div", "picker");
  const diffBox = el(doc, "div", "diff");
  const actions = el(doc, "div", "actions");
  const create = el(doc, "button", "create", "Create work in MusicBrainz");
  create.type = "button";
  const update = el(doc, "button", "update", "Update");
  update.type = "button";
  update.disabled = true;
  actions.append(create, " ", update);
  const notice = el(doc, "div", "notice");

  panel.append(heading, summary, relsTable, skippedLine, targetRow, picker, diffBox, actions, notice);

  const setStatus = (msg: string, retry?: () => void) => {
    status.textContent = msg;
    if (retry) {
      const btn = el(doc, "button", "retry", "Retry");
      btn.type = "button";
      btn.style.marginLeft = "4px";
      btn.addEventListener("click", retry);
      status.appendChild(btn);
    }
  };

  const renderDiff = () => {
    diffBox.textContent = "";
    update.disabled = true;
    update.textContent = "Update";
    const d = state.diff;
    if (!d || !state.work) return;
    update.textContent = `Update "${state.work.title}"`;
    if (isEmpty(d)) {
      diffBox.textContent = "Nothing to add";
      return;
    }
    const lines: string[] = [];
    if (d.iswc) lines.push(`ISWC ${d.iswc}`);
    if (d.jasracCode) lines.push(`JASRAC ID ${d.jasracCode}`);
    if (d.nextoneCode) lines.push(`NexTone ID ${d.nextoneCode}`);
    if (d.typeId !== null) lines.push("type Song");
    if (d.languageId !== null) lines.push("language [No lyrics]");
    for (const r of d.rels) lines.push(`${r.label}: ${r.target}`);
    diffBox.appendChild(el(doc, "div", "", "Will add:"));
    const ul = el(doc, "ul");
    for (const l of lines) ul.appendChild(el(doc, "li", "", l));
    diffBox.appendChild(ul);
    update.disabled = false;
  };

  const renderPicker = () => {
    picker.textContent = "";
    for (const h of state.hits) {
      const label = el(doc, "label");
      label.style.display = "block";
      const radio = el(doc, "input");
      radio.type = "radio";
      radio.name = `${MARKER}-hit`;
      radio.value = h.mbid;
      radio.checked = h.mbid === state.target;
      radio.addEventListener("change", () => {
        if (radio.checked) {
          ref.value = "";
          setTarget(h.mbid);
        }
      });
      const link = el(doc, "a");
      link.href = `https://musicbrainz.org/work/${h.mbid}`;
      link.target = "_blank";
      link.textContent = h.mbid.slice(0, 8);
      const desc = [h.title, h.type, h.disambiguation, h.writers, h.iswcs.join(", ")].filter((s) => s).join(" · ");
      label.append(radio, " ", desc, " ", link);
      picker.appendChild(label);
    }
  };

  const runLookup = () => {
    const mbid = state.target;
    if (!mbid) return;
    const seq = ++state.seq;
    state.work = null;
    state.diff = null;
    renderDiff();
    setStatus("Loading work…");
    deps.lookupWork(mbid).then(
      (work) => {
        if (seq !== state.seq) return;
        state.work = work;
        state.diff = diffWork(info, state.seeds, state.kind, work);
        setStatus("");
        renderDiff();
      },
      (err: unknown) => {
        if (seq !== state.seq) return;
        if (err instanceof MbNotFound) setStatus("Work not found");
        else setStatus(err instanceof Error ? err.message : String(err), runLookup);
      },
    );
  };

  const setTarget = (mbid: string | null) => {
    state.target = mbid;
    state.seq++;
    state.work = null;
    state.diff = null;
    renderPicker();
    renderDiff();
    if (mbid) runLookup();
    else setStatus("");
  };

  ref.addEventListener("input", () => {
    const text = ref.value.trim();
    if (text === "") {
      setTarget(null);
      return;
    }
    const mbid = parseWorkRef(text);
    if (!mbid) {
      setTarget(null);
      setStatus("Not a MusicBrainz work URL or MBID");
      return;
    }
    setTarget(mbid);
  });

  const runSearch = (kind: "iswc" | "title") => {
    if (state.searching) return;
    state.searching = true;
    const seq = ++state.seq;
    setStatus(kind === "iswc" ? "Searching MusicBrainz by ISWC…" : "Searching MusicBrainz by title…");
    const p = kind === "iswc" ? deps.searchByIswc(info.iswc!) : deps.searchByTitle(displayTitle(info.title));
    p.then(
      (hits) => {
        state.searching = false;
        if (seq !== state.seq) return;
        state.hits = hits;
        if (hits.length === 0) {
          setStatus(kind === "iswc" ? "No work with this ISWC" : "No work with this title");
          renderPicker();
          return;
        }
        setStatus("");
        if (kind === "iswc" && hits.length === 1 && ref.value.trim() === "") setTarget(hits[0].mbid);
        else renderPicker();
      },
      (err: unknown) => {
        state.searching = false;
        if (seq !== state.seq) return;
        setStatus(err instanceof Error ? err.message : String(err), () => runSearch(kind));
      },
    );
  };

  search.addEventListener("click", () => runSearch("title"));

  const openUrl = (build: (note: string) => string) => {
    notice.textContent = "";
    const { url, dropped } = fitUrl(build, info, deps.version);
    if (dropped.length > 0) notice.textContent = `Edit note shortened: ${dropped.join(", ")}`;
    const win = deps.open(url);
    if (win === null) {
      const a = el(doc, "a", "link", "Popup blocked, open this link");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      notice.appendChild(a);
    }
  };

  create.addEventListener("click", () => openUrl((note) => buildCreateUrl(info, state.seeds, state.kind, note)));
  update.addEventListener("click", () => {
    if (!state.target || !state.diff) return;
    const mbid = state.target;
    const diff = state.diff;
    openUrl((note) => buildEditUrl(mbid, diff, note));
  });

  if (info.site === "jwid") {
    const base = doc.querySelector(".baseinfo");
    if (base?.parentNode) base.parentNode.insertBefore(panel, base.nextSibling);
    else doc.body.prepend(panel);
  } else {
    const area = doc.querySelector("#jasrac-area");
    if (area?.parentNode) area.parentNode.insertBefore(panel, area);
    else doc.body.prepend(panel);
  }

  if (info.iswc) runSearch("iswc");
  return panel;
}
```

Note for the implementer: `renderPicker` runs inside `setTarget` before `runLookup`, so the ISWC preselection test sees the radio checked. The `notice` element is cleared at the start of each open, so the popup link and the shortened notice never stack. In the popup test the shortened notice is empty, so `notice.textContent` equals the link text only when the link is the only child; the test reads the `a` element.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/ui.test.ts`
Expected: PASS (11 tests). If the "tells when the edit note was shortened" test fails on the notice text, make sure `notice.textContent` is set before `deps.open` and that no link is appended when `open` returns a window.

- [ ] **Step 5: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz/src/ui.ts scripts/jasrac-minc-work-to-musicbrainz/test/ui.test.ts
git commit -m "Render the MusicBrainz work panel"
```

---

### Task 11: Entry point, README, build

**Files:**
- Modify: `src/main.ts` (replace the placeholder)
- Create: `test/main.test.ts`
- Create: `scripts/jasrac-minc-work-to-musicbrainz/README.md`
- Modify: `README.md` (root; add a table row)
- Modify: `dist/jasrac-minc-work-to-musicbrainz.user.js` (rebuilt)

**Interfaces:**
- Consumes: `parseJwid`, `parseMinc` (Tasks 3, 4); `searchByIswc`, `searchByTitle`, `lookupWork` (Task 6); `enhancePage`, `MARKER`, `UiDeps` (Task 10); `Site` (Task 1).
- Produces: `enhance(doc, site, deps): "added" | "present" | "none"`, `siteOf(hostname): Site | null`.

- [ ] **Step 1: Write the failing tests**

`test/main.test.ts`:

```ts
import { enhance, siteOf } from "../src/main";
import type { UiDeps } from "../src/ui";
import { emptyDocument, jwidDocument, mincDocument } from "./helpers";

const deps: UiDeps = {
  version: "1.0.0",
  searchByIswc: async () => [],
  searchByTitle: async () => [],
  lookupWork: async () => {
    throw new Error("unused");
  },
  open: () => null,
};

describe("siteOf", () => {
  it("maps hostnames to sites", () => {
    expect(siteOf("www2.jasrac.or.jp")).toBe("jwid");
    expect(siteOf("www.minc.or.jp")).toBe("minc");
    expect(siteOf("musicbrainz.org")).toBeNull();
  });
});

describe("enhance", () => {
  it("adds one panel to a J-WID page and never a second", () => {
    const doc = jwidDocument("jwid-70342415");
    expect(enhance(doc, "jwid", deps)).toBe("added");
    expect(enhance(doc, "jwid", deps)).toBe("present");
    expect(doc.querySelectorAll(".jasrac-minc-mb").length).toBe(1);
  });

  it("adds one panel to a minc page", () => {
    const doc = mincDocument("minc-25707965-N00913658");
    expect(enhance(doc, "minc", deps)).toBe("added");
    expect(enhance(doc, "minc", deps)).toBe("present");
    expect(doc.querySelectorAll(".jasrac-minc-mb").length).toBe(1);
  });

  it("returns none and warns once when the page has no work", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc = emptyDocument("https://www2.jasrac.or.jp/eJwid/main?trxID=F20101");
    expect(enhance(doc, "jwid", deps)).toBe("none");
    expect(enhance(doc, "jwid", deps)).toBe("none");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("jwid");
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz/test/main.test.ts`
Expected: FAIL, `enhance` is not exported.

- [ ] **Step 3: Write the entry point**

Replace `src/main.ts`:

```ts
import { lookupWork, searchByIswc, searchByTitle } from "./musicbrainz";
import { parseJwid, parseMinc } from "./parser";
import type { Site } from "./types";
import { enhancePage, MARKER, type UiDeps } from "./ui";

declare const __VERSION__: string;

export const VERSION: string = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

export function siteOf(hostname: string): Site | null {
  if (hostname === "www2.jasrac.or.jp") return "jwid";
  if (hostname === "www.minc.or.jp") return "minc";
  return null;
}

const warned = new WeakSet<Document>();

export function enhance(doc: Document, site: Site, deps: UiDeps): "added" | "present" | "none" {
  if (doc.querySelector(`.${MARKER}`)) return "present";
  const info = site === "jwid" ? parseJwid(doc) : parseMinc(doc);
  if (!info) {
    if (!warned.has(doc)) {
      warned.add(doc);
      console.warn(`[${MARKER}] no work found on this ${site} page`);
    }
    return "none";
  }
  enhancePage(doc, info, deps);
  return "added";
}

function start(site: Site): void {
  const deps: UiDeps = {
    version: VERSION,
    searchByIswc: (iswc) => searchByIswc(iswc),
    searchByTitle: (title) => searchByTitle(title),
    lookupWork: (mbid) => lookupWork(mbid),
    open: (url) => window.open(url, "_blank", "noopener"),
  };
  setInterval(() => enhance(document, site, deps), 1000);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const site = siteOf(window.location.hostname);
  if (site) start(site);
}
```

- [ ] **Step 4: Run the whole suite and typecheck**

Run: `npx vitest run scripts/jasrac-minc-work-to-musicbrainz && npm run typecheck`
Expected: all tests pass; typecheck clean.

- [ ] **Step 5: Write the script README**

`scripts/jasrac-minc-work-to-musicbrainz/README.md`:

```markdown
# JASRAC / MINC work to MusicBrainz

A userscript for the work detail pages of [J-WID](https://www2.jasrac.or.jp/eJwid/) (JASRAC) and
[音楽権利情報検索ナビ (MINC)](https://www.minc.or.jp/). It adds a MusicBrainz panel that reads the work
(title, JASRAC code, NexTone code, ISWC, credits, titles, artists) and opens the MusicBrainz work editor
in a new tab with the fields prefilled. You review and submit on MusicBrainz.

## Install

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Open https://github.com/ibmibmibm/userscripts/raw/main/dist/jasrac-minc-work-to-musicbrainz.user.js and accept the install.
   The script updates itself from that URL.

## Use

1. Open a work detail page on J-WID (`作品詳細画面`) or on MINC (`/saku/detail/`, needs a MINC login).
2. The panel lists the relationships it will seed: 作詞 → lyricist, 補詞 → additional lyricist, 訳詞 → translator,
   作曲 → composer, 編曲 → arranger, 作曲作詞 and 不明 → writer, 出版者 / 出版社 → publisher, サブ出版 → sub-publisher.
   Names are folded for the MusicBrainz search (`堀内　孝太` → `堀内孝太`, `日本テレビ音楽　株式会社` → `日本テレビ音楽`).
   The edit note keeps the original spelling.
3. When the work has an ISWC the panel searches MusicBrainz for it. One hit is preselected. Use "Search by title"
   or paste a MusicBrainz work URL or MBID to pick another work.
4. Click "Create work in MusicBrainz" to open a prefilled new-work form, or "Update …" to open the edit form of the
   selected work with only the missing ISWC, codes, type or language, and relationships added.
5. Check every seeded relationship on MusicBrainz. JASRAC sometimes lists wrong or duplicate credits, and a seeded
   name still needs to be matched to the right MusicBrainz artist or label. Then submit on MusicBrainz.

Titles that JASRAC stores as `ＡＬＭＩＧＨＴＹ　　ＴＨＥ` are seeded as `THE ALMIGHTY`. Letter case is not changed.

## Develop

Run `npm test` and `node build.mjs jasrac-minc-work-to-musicbrainz` from the repository root. Test fixtures under
`test/fixtures/` are captured from real pages (J-WID needs a session, MINC needs a login) and from the MusicBrainz
web service. Bump `@version` in `header.txt` before a release.

The J-WID parser reads `.baseinfo--name`, `.baseinfo--code strong`, `.baseinfo--iswc strong`, the credit table under
`div#tab-def`, the `作品タイトル` table, and `section[data-role='artist']`. The MINC parser reads the tables in
`#jasrac-area` and `#nextone-area`. An empty panel after a site redesign points there.
```

- [ ] **Step 6: Add the root README row**

In `README.md`, add after the MINC ISRC row:

```markdown
| JASRAC / MINC work to MusicBrainz | [dist/jasrac-minc-work-to-musicbrainz.user.js](https://github.com/ibmibmibm/userscripts/raw/main/dist/jasrac-minc-work-to-musicbrainz.user.js) | [scripts/jasrac-minc-work-to-musicbrainz](scripts/jasrac-minc-work-to-musicbrainz/README.md) |
```

- [ ] **Step 7: Build and run everything**

Run: `npm run build && npm test && npm run typecheck`
Expected: both scripts build; every test passes (the existing minc-isrc suite too); typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add scripts/jasrac-minc-work-to-musicbrainz README.md dist/jasrac-minc-work-to-musicbrainz.user.js
git commit -m "Add the JASRAC / MINC work importer entry point, README, and build"
```

---

## Self-review notes

- Spec coverage: pages and triggers (Tasks 3, 4, 11), data model (1), parsers (3, 4), normalization (2), mapping and work kind (5), MusicBrainz client with retry and `parseWorkRef` (6), diff (7), URL builder and length guard (9), edit note (8), panel contents and behavior (10), error handling (10, 11), fixtures and tests (all), delivery and header (1, 11).
- Type consistency: `SeedRel.label` is used by the panel and the diff list; `WorkDiff.iswcIndex`/`attributeIndex` feed `buildEditUrl`; `NoteBlock` is shared by `note.ts`, `seed.ts`, and the panel notice; `UiDeps.open` returns `Window | null`.
- Manual check after Task 11 (outside the automated tests): install `dist/jasrac-minc-work-to-musicbrainz.user.js`, open J-WID work 703-4241-5 and minc `?jcd=25707965&ncd=N00913658`, click Create, and confirm on musicbrainz.org that the name, ISWC, attributes, type, relationships, and edit note are prefilled.
