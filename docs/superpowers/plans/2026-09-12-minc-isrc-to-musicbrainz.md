# MINC ISRC to MusicBrainz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A userscript that adds a button to the CD detail modal on minc.or.jp, reads all ISRCs, finds the MusicBrainz release by barcode, and opens MagicISRC with every ISRC prefilled.

**Architecture:** TypeScript modules under `scripts/minc-isrc-to-musicbrainz/src/` with pure functions for parsing, analysis, MusicBrainz lookup, medium mapping, and URL building, plus one DOM glue module. A shared root `build.mjs` bundles every `scripts/*/src/main.ts` into `dist/<name>.user.js` with that script's header prepended, so more userscripts can join the `userscripts` repository later. vitest with jsdom tests the pure modules against saved fixtures.

**Tech Stack:** TypeScript 5, esbuild, vitest, jsdom, Node 20 or newer. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-12-minc-isrc-to-musicbrainz-design.md`

## Global Constraints

- The shipped artifact is one file: `dist/minc-isrc-to-musicbrainz.user.js`, committed to git.
- Userscript header: `@grant none`, `@run-at document-end`, `@match https://www.minc.or.jp/product/list*` and `@match https://www.minc.or.jp/music/list*`.
- `@namespace https://github.com/ibmibmibm/userscripts`, `@version 1.0.0`, `@downloadURL` and `@updateURL` both `https://github.com/ibmibmibm/userscripts/raw/main/dist/minc-isrc-to-musicbrainz.user.js`.
- Repository layout: shared toolchain at the root, one folder per script under `scripts/<name>/` with `header.txt`, `src/`, `test/`. This script is `scripts/minc-isrc-to-musicbrainz/`. All `npm` commands run at the repository root.
- No `alert`, `confirm`, or `prompt`. All messages go to the status line.
- ISRC pattern: `/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/` after trim and upper-case.
- MusicBrainz endpoint: `https://musicbrainz.org/ws/2/release/?fmt=json&limit=25&query=<q>`.
- MagicISRC base: `https://magicisrc.kepstin.ca/`, parameter order `musicbrainzid`, `isrc<M>-<T>`..., `edit-note`.
- Marker class on enhanced modal bodies: `minc-isrc-mb`. UI wrapper class: `minc-isrc-mb-ui`.
- Fixture data already exists in `scripts/minc-isrc-to-musicbrainz/test/fixtures/raw/*.txt`, `.../test/fixtures/single-cd.html`, and `.../test/fixtures/mb/*.json`. Do not re-download; minc needs a login.
- Commit after every task. Commit messages end with the two attribution lines given in the session reminder.

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` | Shared tooling at the repository root |
| `build.mjs` | Builds every `scripts/*/src/main.ts` into `dist/<name>.user.js` with its header |
| `.github/workflows/build.yml` | CI: typecheck, test, build; commits `dist/` on `main` |
| `README.md` | Repository overview with a link per script |
| `scripts/minc-isrc-to-musicbrainz/header.txt` | Userscript header block |
| `scripts/minc-isrc-to-musicbrainz/README.md` | Install and use |
| `scripts/minc-isrc-to-musicbrainz/src/types.ts` | Shared interfaces |
| `scripts/minc-isrc-to-musicbrainz/src/parser.ts` | `parseProductModal`: modal DOM to `MincRelease` |
| `scripts/minc-isrc-to-musicbrainz/src/analyze.ts` | `analyze`: duplicates, missing ISRCs, submittable discs |
| `scripts/minc-isrc-to-musicbrainz/src/musicbrainz.ts` | `buildQueries`, `toReleaseHit`, `searchReleases` |
| `scripts/minc-isrc-to-musicbrainz/src/mapping.ts` | `isVideoFormat`, `defaultMapping`, `mappingMarks` |
| `scripts/minc-isrc-to-musicbrainz/src/magicisrc.ts` | `buildEditNote`, `buildMagicIsrcUrl` |
| `scripts/minc-isrc-to-musicbrainz/src/ui.ts` | Builds the UI block and drives the click flow |
| `scripts/minc-isrc-to-musicbrainz/src/main.ts` | Poll loop, calls `enhanceOpenModals` |
| `scripts/minc-isrc-to-musicbrainz/test/helpers.ts` | Fixture loading helpers |
| `scripts/minc-isrc-to-musicbrainz/test/fixtures/generate.mjs` | Turns `raw/*.txt` into `*.html` fixtures |
| `scripts/minc-isrc-to-musicbrainz/test/fixtures/**` | Fixtures |
| `scripts/minc-isrc-to-musicbrainz/test/*.test.ts` | Unit tests |

In the task text below, `S/` is short for `scripts/minc-isrc-to-musicbrainz/`. Relative imports inside tests stay `../src/<module>` because `src/` and `test/` are siblings inside the script folder.

---

### Task 1: Project scaffold and build

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `build.mjs`, `S/header.txt`, `S/src/main.ts`, `S/test/build.test.ts`

**Interfaces:**
- Produces: `npm run build` writes `dist/<name>.user.js` for every script folder; `npm test` runs vitest; `__VERSION__` inside a bundle is that script's `@version`.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "minc-isrc-to-musicbrainz",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/jsdom": "^21.1.7",
    "esbuild": "^0.24.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["scripts/*/src", "scripts/*/test"]
}
```

- [ ] **Step 3: Write vitest.config.ts and .gitignore**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["scripts/*/test/**/*.test.ts"],
  },
});
```

`.gitignore`:

```
node_modules/
```

- [ ] **Step 4: Write S/header.txt**

```
// ==UserScript==
// @name         MINC ISRC to MusicBrainz
// @namespace    https://github.com/ibmibmibm/userscripts
// @version      1.0.0
// @description  Submit ISRCs from MINC (音楽権利情報検索ナビ) CD product details to MusicBrainz through MagicISRC
// @author       Shen-Ta Hsieh
// @downloadURL  https://github.com/ibmibmibm/userscripts/raw/main/dist/minc-isrc-to-musicbrainz.user.js
// @updateURL    https://github.com/ibmibmibm/userscripts/raw/main/dist/minc-isrc-to-musicbrainz.user.js
// @match        https://www.minc.or.jp/product/list*
// @match        https://www.minc.or.jp/music/list*
// @grant        none
// @run-at       document-end
// ==/UserScript==
```

- [ ] **Step 5: Write build.mjs**

```js
import { build } from "esbuild";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPTS = "scripts";
const only = process.argv[2]; // optional: build one script folder by name

function versionFromHeader(header, name) {
  const m = header.match(/^\/\/ @version\s+(\S+)/m);
  if (!m) throw new Error(`${name}: header.txt has no @version line`);
  return m[1];
}

mkdirSync("dist", { recursive: true });
const names = readdirSync(SCRIPTS).filter((n) => !only || n === only);
let built = 0;
for (const name of names) {
  const dir = join(SCRIPTS, name);
  const entry = join(dir, "src", "main.ts");
  const headerPath = join(dir, "header.txt");
  if (!existsSync(entry) || !existsSync(headerPath)) continue;
  const header = readFileSync(headerPath, "utf8");
  const version = versionFromHeader(header, name);
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    target: "es2020",
    write: false,
    charset: "utf8",
    define: { __VERSION__: JSON.stringify(version) },
  });
  const out = join("dist", `${name}.user.js`);
  writeFileSync(out, header.trimEnd() + "\n" + result.outputFiles[0].text);
  console.log(`built ${out} (v${version})`);
  built += 1;
}
if (built === 0) throw new Error("no script folder with header.txt and src/main.ts found");
```

- [ ] **Step 6: Write a placeholder S/src/main.ts**

```ts
declare const __VERSION__: string;

console.debug("MINC ISRC to MusicBrainz", __VERSION__);
```

- [ ] **Step 7: Write the failing build test**

`S/test/build.test.ts` (vitest runs with the repository root as the working directory):

```ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

describe("build", () => {
  it("writes one user.js file with the header and version", () => {
    execFileSync("node", ["build.mjs", "minc-isrc-to-musicbrainz"], { stdio: "pipe" });
    const out = readFileSync("dist/minc-isrc-to-musicbrainz.user.js", "utf8");
    const header = readFileSync("scripts/minc-isrc-to-musicbrainz/header.txt", "utf8");
    expect(out.startsWith(header.trimEnd() + "\n")).toBe(true);
    expect(out).toContain("// @version      1.0.0");
    expect(out).toContain("@namespace    https://github.com/ibmibmibm/userscripts");
    expect(out).toContain("@downloadURL  https://github.com/ibmibmibm/userscripts/raw/main/dist/minc-isrc-to-musicbrainz.user.js");
    expect(out).toContain("@match        https://www.minc.or.jp/product/list*");
    expect(out).toContain("@match        https://www.minc.or.jp/music/list*");
    expect(out).toContain("@grant        none");
    expect(out).toContain('"1.0.0"');
    expect(out).not.toContain("__VERSION__");
  });
});
```

- [ ] **Step 8: Install and run the test to verify it fails**

Run: `npm install` then `npx vitest run scripts/minc-isrc-to-musicbrainz/test/build.test.ts`
Expected: FAIL because `dist/` does not exist yet or `build.mjs` errors. If it passes on the first run, that is fine; the build is trivial.

- [ ] **Step 9: Run build and tests**

Run: `npm run build && npm test && npm run typecheck`
Expected: build prints `built dist/minc-isrc-to-musicbrainz.user.js (v1.0.0)`, 1 test passes, typecheck has no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore build.mjs scripts/minc-isrc-to-musicbrainz dist/minc-isrc-to-musicbrainz.user.js
git commit -m "Scaffold TypeScript userscript build and test setup"
```

---

### Task 2: Fixture generator

**Files:**
- Create: `S/test/helpers.ts`, `S/test/fixtures/generate.mjs`, `S/test/fixtures.test.ts`
- Generate: `S/test/fixtures/two-cd-dvd.html`, `two-cd-duplicate.html`, `cd-bluray.html`, `thirteen-discs.html`, `music-list-empty-pos.html`
- Existing input: `S/test/fixtures/raw/*.txt`, `S/test/fixtures/single-cd.html` (verbatim capture, not generated)

**Interfaces:**
- Produces: HTML fixtures whose structure matches the real minc modal (see spec "Modal structure").

The raw format, one record per line, fields separated by `|`:

- `T|<modal title>`
- `H|<class>|<text>`: one `.detail_data` cell, in order. The first eight are `col-sm-3` and go into two `.clearfix` rows of four. The ninth is `col-sm-9`, the tenth is the `col-sm-3` button cell.
- `D|<disc index>|<cells>`: starts a `.table_wrapper`. `<cells>` is empty for a single-disc modal (no `.disk_data`), otherwise `class=innerHTML` items separated by `|`, with `{br}` standing for `<br>`.
- `C|in` or `C|`: whether the `.collapse` div has class `in`.
- `R|曲順|メドレー|曲名|IV|収録時間|アーティスト|ISRC|JASRAC|NexTone|link text`: one full track row.
- `S|曲順|曲名|ISRC`: one short track row; other cells get defaults (`0`, `V`, `0`, `陰陽座`, `-`, `-`, `管理情報`).

- [ ] **Step 1: Write the generator**

`S/test/fixtures/generate.mjs`:

```js
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = join(here, "raw");

const HEADER_ROW =
  '<tr class="header"><th class="cd-detail2-kyokujyun">曲順</th><th class="cd-detail2-kyokumed">メドレー</th>' +
  '<th class="cd-detail2-kyokunm">曲名</th><th class="cd-detail2-iv">IV</th><th class="cd-detail2-time">収録時間</th>' +
  '<th class="cd-detail2-artist">アーティスト</th><th class="cd-detail2-isrc">ISRC</th>' +
  '<th class="cd-detail2-jassakucd">JASRAC<br>作品コード</th><th class="cd-detail2-ntsakucd">NexTone<br>作品コード</th>' +
  '<th class="cd-detail2-link">著作権<br>管理情報</th></tr>';

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function trackRow(cells) {
  const [order, medley, title, iv, time, artist, isrc, jasrac, nextone, link] = cells;
  return (
    `<tr><td data-th="曲順">${esc(order)}</td><td data-th="メドレー">${esc(medley)}</td>` +
    `<td data-th="曲名">${esc(title)}</td><td data-th="IV">${esc(iv)}</td>` +
    `<td data-th="収録時間">${esc(time)}</td><td data-th="アーティスト">${esc(artist)}</td>` +
    `<td data-th="ISRC"> ${esc(isrc)} </td><td data-th="JASRAC作品コード"> ${esc(jasrac)} </td>` +
    `<td data-th="NexTone作品コード"> ${esc(nextone)} </td>` +
    `<td data-th="著作権管理情報">${link ? `<a>${esc(link)}</a>` : " "}</td></tr>`
  );
}

export function generate(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  let title = "";
  const headerCells = [];
  const wrappers = [];
  let current = null;

  for (const line of lines) {
    const [kind, ...rest] = line.split("|");
    if (kind === "T") title = rest.join("|");
    else if (kind === "H") headerCells.push({ cls: rest[0], text: rest.slice(1).join("|") });
    else if (kind === "D") {
      current = { diskCells: rest.slice(1).filter((c) => c.length > 0), collapseIn: false, rows: [] };
      wrappers.push(current);
    } else if (kind === "C") current.collapseIn = rest[0] === "in";
    else if (kind === "R") current.rows.push(trackRow(rest));
    else if (kind === "S") current.rows.push(trackRow([rest[0], "0", rest[1], "V", "0", "陰陽座", rest[2], "-", "-", "管理情報"]));
    else throw new Error(`unknown line kind: ${line}`);
  }

  const cell = (c) => `<div class="${c.cls}">${esc(c.text)}</div>`;
  const row1 = headerCells.slice(0, 4).map(cell).join("");
  const row2 = headerCells.slice(4, 8).map(cell).join("");
  const company = headerCells[8];
  const companyHtml =
    `<div class="col-sm-9"> ${esc(company.text.replace(/ ※集中管理.*$/, ""))} <br><span>※集中管理</span>： ` +
    `<span class="icon delegation active">委任者</span><span class="icon delegation">非委任者</span></div>` +
    `<div class="col-sm-3"><button class="btn btn-success description-of-cd-detail"><i class="fas fa-question-circle"></i> 用語の説明</button></div>`;

  const wrapperHtml = wrappers
    .map((w) => {
      const disk =
        w.diskCells.length === 0
          ? ""
          : `<div class="disk_data"><div class="row">` +
            w.diskCells
              .map((c) => {
                const eq = c.indexOf("=");
                const cls = c.slice(0, eq);
                const inner = c.slice(eq + 1).split("{br}").map(esc).join("<br>");
                return `<div class="${cls}">${inner || " "}</div>`;
              })
              .join("") +
            `</div></div>`;
      return (
        `<div class="table_wrapper">${disk}<a></a><div class="collapse${w.collapseIn ? " in" : ""}">` +
        `<table class="responsive_table cd-detail2-track-list table table-condensed"><tbody>${HEADER_ROW}${w.rows.join("")}</tbody></table></div></div>`
      );
    })
    .join("");

  return (
    `<div class="modal-content"><div class="modal-header"> <button class="close" data-dismiss="modal" area-hidden="true"> × </button>` +
    `<h4 class="modal-title"> ${esc(title)} </h4> </div><div class="modal-body"> <div class="detail_data">` +
    `<div class="clearfix">${row1}</div><div class="clearfix">${row2}</div><div class="clearfix">${companyHtml}</div></div>` +
    `<span class="modal-alubum-list" style="display:none"></span>${wrapperHtml} </div></div>\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const name of readdirSync(rawDir)) {
    if (!name.endsWith(".txt")) continue;
    const raw = readFileSync(join(rawDir, name), "utf8");
    const out = join(here, name.replace(/\.txt$/, ".html"));
    writeFileSync(out, generate(raw));
    console.log("wrote", out);
  }
}
```

- [ ] **Step 2: Write the fixture helper and the failing fixture test**

`S/test/helpers.ts` (paths resolve from this file, so the working directory does not matter):

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import type { MbReleaseHit } from "../src/types";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

export function fixtureHtml(name: string): string {
  return readFileSync(`${FIXTURES}${name}.html`, "utf8");
}

/** Loads a saved modal fixture and returns its `.modal-body`, wrapped in `.modal.in` like the real page. */
export function loadFixture(name: string): Element {
  const dom = new JSDOM(`<div class="modal in"><div class="modal-dialog large">${fixtureHtml(name)}</div></div>`);
  return dom.window.document.querySelector(".modal-body")!;
}

/** Parsed MusicBrainz search JSON from test/fixtures/mb/<name>.json. */
export function mbJson(name: string): { releases?: unknown[]; count?: number } {
  return JSON.parse(readFileSync(`${FIXTURES}mb/${name}.json`, "utf8"));
}

/** Applies toReleaseHit to every release in a MusicBrainz fixture. */
export function mbHits(name: string, toHit: (json: unknown) => MbReleaseHit): MbReleaseHit[] {
  return (mbJson(name).releases ?? []).map(toHit);
}
```

Note: `src/types.ts` does not exist until Task 3. Until then, write `helpers.ts` without the `mbJson` and `mbHits` functions and the `MbReleaseHit` import; add them at the start of Task 5.

`S/test/fixtures.test.ts`:

```ts
import { loadFixture } from "./helpers";

const expectations: Record<string, { wrappers: number; rows: number; diskData: number; title: string }> = {
  "single-cd": { wrappers: 1, rows: 3, diskData: 0, title: "YOUTHFUL" },
  "two-cd-dvd": { wrappers: 3, rows: 28, diskData: 3, title: "Mr.Children 2011-2015" },
  "two-cd-duplicate": { wrappers: 2, rows: 27, diskData: 2, title: "Mr.Children 2011-2015" },
  "cd-bluray": { wrappers: 2, rows: 23, diskData: 2, title: "BEST -E-" },
  "thirteen-discs": { wrappers: 13, rows: 134, diskData: 13, title: "陰陽大全" },
  "music-list-empty-pos": { wrappers: 1, rows: 11, diskData: 0, title: "TODAY" },
};

describe("fixtures", () => {
  for (const [name, exp] of Object.entries(expectations)) {
    it(`${name} has the real modal structure`, () => {
      const body = loadFixture(name);
      expect(body.querySelector(".detail_data")).not.toBeNull();
      expect(body.querySelectorAll(".table_wrapper").length).toBe(exp.wrappers);
      expect(body.querySelectorAll(".table_wrapper .disk_data").length).toBe(exp.diskData);
      expect(body.querySelectorAll("table.cd-detail2-track-list tr td[data-th='曲順']").length).toBe(exp.rows);
      expect(body.querySelectorAll("table.cd-detail2-track-list tr.header").length).toBe(exp.wrappers);
      const title = body.parentElement!.querySelector(".modal-title")!.textContent!.trim();
      expect(title).toBe(exp.title);
    });
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/fixtures.test.ts`
Expected: FAIL, five fixtures missing (`ENOENT`).

- [ ] **Step 4: Generate the fixtures**

Run: `node scripts/minc-isrc-to-musicbrainz/test/fixtures/generate.mjs`
Expected: five `wrote ...html` lines.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/fixtures.test.ts`
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/minc-isrc-to-musicbrainz/test
git commit -m "Add modal fixtures and generator"
```

---

### Task 3: Types and parser

**Files:**
- Create: `S/src/types.ts`, `S/src/parser.ts`, `S/test/parser.test.ts`

**Interfaces:**
- Produces: `parseProductModal(modalBody: Element): MincRelease | null`, `isValidIsrc(s: string): boolean`, and the interfaces in `S/src/types.ts` used by every later task.

- [ ] **Step 1: Write S/src/types.ts**

```ts
export interface MincTrack {
  position: number;
  title: string;
  isrc: string | null;
}

export type DiscKind = "audio" | "video";

export interface MincDisc {
  position: number;
  format: string;
  kind: DiscKind;
  catalogNumber: string | null;
  tracks: MincTrack[];
}

export interface MincRelease {
  title: string;
  catalogNumber: string;
  barcode: string | null;
  discCount: number | null;
  trackCount: number | null;
  discs: MincDisc[];
}

export interface MbMedium {
  position: number;
  format: string | null;
  trackCount: number;
}

export interface MbReleaseHit {
  mbid: string;
  title: string;
  artist: string;
  date: string | null;
  country: string | null;
  catalogNumbers: string[];
  barcode: string | null;
  media: MbMedium[];
}
```

- [ ] **Step 2: Write the failing parser tests**

`S/test/parser.test.ts`:

```ts
import { loadFixture } from "./helpers";
import { parseProductModal, isValidIsrc } from "../src/parser";

describe("isValidIsrc", () => {
  it("accepts a normal ISRC", () => expect(isValidIsrc("JPVP01106901")).toBe(true));
  it("rejects dash, blank, and short codes", () => {
    expect(isValidIsrc("-")).toBe(false);
    expect(isValidIsrc("")).toBe(false);
    expect(isValidIsrc("JPVP0110690")).toBe(false);
  });
});

describe("parseProductModal", () => {
  it("parses a single CD", () => {
    const r = parseProductModal(loadFixture("single-cd"))!;
    expect(r.title).toBe("YOUTHFUL");
    expect(r.catalogNumber).toBe("VPCC-82301");
    expect(r.barcode).toBe("4988021823012");
    expect(r.discCount).toBe(1);
    expect(r.trackCount).toBe(3);
    expect(r.discs).toHaveLength(1);
    expect(r.discs[0]).toMatchObject({ position: 1, format: "CD", kind: "audio", catalogNumber: null });
    expect(r.discs[0].tracks).toEqual([
      { position: 1, title: "YOUTHFUL", isrc: "JPVP01106901" },
      { position: 2, title: "YOUTHFUL ～from Studio Yamato～", isrc: "JPVP01106902" },
      { position: 3, title: "Same love, Different heart", isrc: "JPVP01106903" },
    ]);
  });

  it("parses 2CD+DVD with formats, catalog numbers, and a null ISRC on the DVD", () => {
    const r = parseProductModal(loadFixture("two-cd-dvd"))!;
    expect(r.catalogNumber).toBe("TFCC-86851/3");
    expect(r.barcode).toBe("4988061868516");
    expect(r.discCount).toBe(3);
    expect(r.trackCount).toBe(27);
    expect(r.discs.map((d) => [d.position, d.format, d.kind, d.catalogNumber, d.tracks.length])).toEqual([
      [1, "CD12cm", "audio", "TFCC 86851", 14],
      [2, "CD12cm", "audio", "TFCC 86852", 13],
      [3, "DVD12cm", "video", "TFCC 86853", 1],
    ]);
    expect(r.discs[2].tracks[0].isrc).toBeNull();
    expect(r.discs[2].tracks[0].title).toBe("『Mr.Children -THEN-』 TALK ＆ DOCUMENTARY");
  });

  it("parses a Blu-ray disc with video ISRCs", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    expect(r.discs[1].format).toBe("Blu-rayDisc Video");
    expect(r.discs[1].kind).toBe("video");
    expect(r.discs[1].tracks[0].isrc).toBe("JPU981201583");
    expect(r.discs[1].tracks).toHaveLength(10);
  });

  it("parses thirteen discs including collapsed tables", () => {
    const r = parseProductModal(loadFixture("thirteen-discs"))!;
    expect(r.discs).toHaveLength(13);
    expect(r.discs.reduce((n, d) => n + d.tracks.length, 0)).toBe(134);
    expect(r.discs[12].kind).toBe("video");
    expect(r.discs[12].tracks.every((t) => t.isrc === null)).toBe(true);
    expect(r.discs[3].tracks.map((t) => t.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("handles an empty POS and all-dash ISRCs on the music list modal", () => {
    const r = parseProductModal(loadFixture("music-list-empty-pos"))!;
    expect(r.title).toBe("TODAY");
    expect(r.catalogNumber).toBe("RRCX 21017");
    expect(r.barcode).toBeNull();
    expect(r.discs[0].tracks).toHaveLength(11);
    expect(r.discs[0].tracks.every((t) => t.isrc === null)).toBe(true);
  });

  it("returns null when the track table is missing", () => {
    const body = loadFixture("single-cd");
    body.querySelector(".table_wrapper")!.remove();
    expect(parseProductModal(body)).toBeNull();
  });

  it("returns null when detail_data is missing", () => {
    const body = loadFixture("single-cd");
    body.querySelector(".detail_data")!.remove();
    expect(parseProductModal(body)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/parser.test.ts`
Expected: FAIL, cannot resolve `../src/parser`.

- [ ] **Step 4: Write S/src/parser.ts**

```ts
import type { DiscKind, MincDisc, MincRelease, MincTrack } from "./types";

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export function isValidIsrc(s: string): boolean {
  return ISRC_RE.test(s);
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function matchGroup(src: string, re: RegExp): string | null {
  const m = src.match(re);
  return m && m[1] !== undefined ? m[1] : null;
}

function toInt(s: string | null): number | null {
  if (s === null || s === "") return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

export function discKind(format: string): DiscKind {
  return /dvd|blu-?ray/i.test(format) ? "video" : "audio";
}

function parseDisc(wrapper: Element, position: number): MincDisc | null {
  const table = wrapper.querySelector("table.cd-detail2-track-list");
  if (!table) return null;

  let format = "CD";
  let catalogNumber: string | null = null;
  const diskData = wrapper.querySelector(".disk_data");
  if (diskData) {
    const t = text(diskData).normalize("NFKC");
    const f = matchGroup(t, /形態:\s*(.+?)\s*(?:カタログ番号|収録曲数|$)/);
    if (f && f.length > 0) format = f;
    catalogNumber = matchGroup(t, /カタログ番号:\s*(.+?)\s*(?:収録曲数|収録時間|Discタイトル|$)/);
    if (catalogNumber === "") catalogNumber = null;
  }

  const tracks: MincTrack[] = [];
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const orderCell = tr.querySelector('td[data-th="曲順"]');
    if (!orderCell) continue;
    const pos = toInt(text(orderCell));
    if (pos === null) continue;
    const rawIsrc = text(tr.querySelector('td[data-th="ISRC"]')).toUpperCase();
    tracks.push({
      position: pos,
      title: text(tr.querySelector('td[data-th="曲名"]')),
      isrc: isValidIsrc(rawIsrc) ? rawIsrc : null,
    });
  }

  return { position, format, kind: discKind(format), catalogNumber, tracks };
}

export function parseProductModal(modalBody: Element): MincRelease | null {
  const detail = modalBody.querySelector(".detail_data");
  if (!detail) return null;
  const wrappers = Array.from(modalBody.querySelectorAll(".table_wrapper"));
  const discs: MincDisc[] = [];
  for (const w of wrappers) {
    const d = parseDisc(w, discs.length + 1);
    if (d) discs.push(d);
  }
  if (discs.length === 0) return null;

  const modal = modalBody.closest(".modal") ?? modalBody.parentElement;
  const title = text(modal?.querySelector(".modal-title") ?? null);
  const header = text(detail);

  const catalogNumber = matchGroup(header, /品番：\s*(.+?)\s*(?:発売日|税抜価格|ジャンル|POS|$)/) ?? "";
  const barcodeRaw = matchGroup(header, /POS：\s*(\d*)/);
  const barcode = barcodeRaw && barcodeRaw.length > 0 ? barcodeRaw : null;

  return {
    title,
    catalogNumber,
    barcode,
    discCount: toInt(matchGroup(header, /セット数：\s*(\d+)/)),
    trackCount: toInt(matchGroup(header, /収録曲数：\s*(\d+)/)),
    discs,
  };
}
```

Note: after NFKC normalization the full-width colon `：` becomes `:` in the disk data, so the disk regexes use `:`; the `.detail_data` text is not normalized, so those regexes keep `：`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/parser.test.ts`
Expected: 9 tests pass. If the `format` expectations differ (for example `"CD12cm"` versus `"CD 12cm"`), fix the parser, not the test: NFKC turns `ＣＤ１２cm` into `CD12cm` with no space, and `Ｂｌｕ－ｒａｙＤｉｓｃ Ｖｉｄｅｏ` into `Blu-rayDisc Video`.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add scripts/minc-isrc-to-musicbrainz/src/types.ts scripts/minc-isrc-to-musicbrainz/src/parser.ts scripts/minc-isrc-to-musicbrainz/test/parser.test.ts
git commit -m "Parse the minc CD detail modal into a release model"
```

---

### Task 4: Analysis

**Files:**
- Create: `S/src/analyze.ts`, `S/test/analyze.test.ts`

**Interfaces:**
- Consumes: `MincRelease` from `S/src/types.ts`.
- Produces: `analyze(release: MincRelease): Analysis` with

```ts
export interface Analysis {
  duplicateIsrcs: { isrc: string; where: string[] }[];
  tracksWithoutIsrc: { disc: number; track: number; title: string }[];
  submittableDiscs: number[];
}
```

- [ ] **Step 1: Write the failing tests**

`S/test/analyze.test.ts`:

```ts
import { loadFixture } from "./helpers";
import { parseProductModal } from "../src/parser";
import { analyze } from "../src/analyze";

describe("analyze", () => {
  it("finds the duplicate ISRC in the 2CD edition", () => {
    const a = analyze(parseProductModal(loadFixture("two-cd-duplicate"))!);
    expect(a.duplicateIsrcs).toEqual([{ isrc: "JPTF02202404", where: ["Disc 1 track 4", "Disc 1 track 5"] }]);
    expect(a.tracksWithoutIsrc).toEqual([]);
    expect(a.submittableDiscs).toEqual([1, 2]);
  });

  it("lists tracks without ISRC and skips discs with none", () => {
    const a = analyze(parseProductModal(loadFixture("two-cd-dvd"))!);
    expect(a.duplicateIsrcs).toEqual([]);
    expect(a.tracksWithoutIsrc).toEqual([{ disc: 3, track: 1, title: "『Mr.Children -THEN-』 TALK ＆ DOCUMENTARY" }]);
    expect(a.submittableDiscs).toEqual([1, 2]);
  });

  it("keeps video discs that have ISRCs", () => {
    const a = analyze(parseProductModal(loadFixture("cd-bluray"))!);
    expect(a.submittableDiscs).toEqual([1, 2]);
  });

  it("returns no submittable disc when every ISRC is missing", () => {
    const a = analyze(parseProductModal(loadFixture("music-list-empty-pos"))!);
    expect(a.submittableDiscs).toEqual([]);
    expect(a.tracksWithoutIsrc).toHaveLength(11);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/analyze.test.ts`
Expected: FAIL, cannot resolve `../src/analyze`.

- [ ] **Step 3: Write S/src/analyze.ts**

```ts
import type { MincRelease } from "./types";

export interface Analysis {
  duplicateIsrcs: { isrc: string; where: string[] }[];
  tracksWithoutIsrc: { disc: number; track: number; title: string }[];
  submittableDiscs: number[];
}

export function analyze(release: MincRelease): Analysis {
  const seen = new Map<string, string[]>();
  const tracksWithoutIsrc: Analysis["tracksWithoutIsrc"] = [];
  const submittableDiscs: number[] = [];

  for (const disc of release.discs) {
    let count = 0;
    for (const track of disc.tracks) {
      if (track.isrc === null) {
        tracksWithoutIsrc.push({ disc: disc.position, track: track.position, title: track.title });
        continue;
      }
      count += 1;
      const where = seen.get(track.isrc) ?? [];
      where.push(`Disc ${disc.position} track ${track.position}`);
      seen.set(track.isrc, where);
    }
    if (count > 0) submittableDiscs.push(disc.position);
  }

  const duplicateIsrcs = Array.from(seen.entries())
    .filter(([, where]) => where.length > 1)
    .map(([isrc, where]) => ({ isrc, where }));

  return { duplicateIsrcs, tracksWithoutIsrc, submittableDiscs };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/analyze.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/minc-isrc-to-musicbrainz/src/analyze.ts scripts/minc-isrc-to-musicbrainz/test/analyze.test.ts
git commit -m "Analyze parsed releases for duplicate and missing ISRCs"
```

---

### Task 5: MusicBrainz lookup

**Files:**
- Create: `S/src/musicbrainz.ts`, `S/test/musicbrainz.test.ts`
- Modify: `S/test/helpers.ts` (add `mbJson` and `mbHits` from the Task 2 listing now that `src/types.ts` exists)
- Existing: `S/test/fixtures/mb/*.json`

**Interfaces:**
- Consumes: `MincRelease`, `MbReleaseHit`, `MbMedium` from `S/src/types.ts`.
- Produces:
  - `buildQueries(release: MincRelease): string[]` (Lucene query strings in the order to try)
  - `catnoForQuery(catalogNumber: string): string`
  - `toReleaseHit(json: unknown): MbReleaseHit`
  - `searchReleases(release: MincRelease, fetchFn?: typeof fetch): Promise<MbReleaseHit[]>`
  - `mbSearchUrl(catalogNumber: string): string` (link for the zero-hit case)

Fixture facts: `barcode-none.json` holds five hits whose `barcode` is a run of zeros, which shows a barcode search must be filtered by exact barcode. `catno-multi.json` holds two hits. `catno-rrcx-21017.json` holds zero hits. The search JSON `media[]` has no `position`; the position is the index plus one.

- [ ] **Step 1: Write the failing tests**

`S/test/musicbrainz.test.ts`:

```ts
import { loadFixture, mbJson as mb } from "./helpers";
import { parseProductModal } from "../src/parser";
import { buildQueries, catnoForQuery, toReleaseHit, searchReleases, mbSearchUrl } from "../src/musicbrainz";

function fakeFetch(responses: Record<string, unknown>, status = 200): typeof fetch {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const q = new URL(url).searchParams.get("query") ?? "";
    const body = responses[q];
    if (body === undefined) throw new Error(`unexpected query: ${q}`);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  (fn as unknown as { calls: string[] }).calls = calls;
  return fn;
}

describe("catnoForQuery", () => {
  it("keeps the part before the slash", () => {
    expect(catnoForQuery("TFCC-86851/3")).toBe("TFCC-86851");
    expect(catnoForQuery("RRCX 21017")).toBe("RRCX 21017");
  });
});

describe("buildQueries", () => {
  it("uses barcode first, then catalog number", () => {
    const r = parseProductModal(loadFixture("two-cd-dvd"))!;
    expect(buildQueries(r)).toEqual(['barcode:4988061868516', 'catno:"TFCC-86851"']);
  });
  it("uses only catalog number when POS is empty", () => {
    const r = parseProductModal(loadFixture("music-list-empty-pos"))!;
    expect(buildQueries(r)).toEqual(['catno:"RRCX 21017"']);
  });
});

describe("toReleaseHit", () => {
  it("maps a full search result", () => {
    const hit = toReleaseHit(mb("barcode-two-cd-dvd").releases![0]);
    expect(hit).toEqual({
      mbid: hit.mbid,
      title: "Mr.Children 2011–2015",
      artist: "Mr.Children",
      date: "2022-05-10",
      country: "JP",
      catalogNumbers: ["TFCC-86853", "TFCC-86852", "TFCC-86851"],
      barcode: "4988061868516",
      media: [
        { position: 1, format: "CD", trackCount: 14 },
        { position: 2, format: "CD", trackCount: 13 },
        { position: 3, format: "DVD-Video", trackCount: 1 },
      ],
    });
    expect(hit.mbid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("tolerates missing fields", () => {
    const hit = toReleaseHit({ id: "x", title: "T" });
    expect(hit).toEqual({ mbid: "x", title: "T", artist: "", date: null, country: null, catalogNumbers: [], barcode: null, media: [] });
  });
});

describe("searchReleases", () => {
  it("returns the barcode hit and stops", async () => {
    const r = parseProductModal(loadFixture("single-cd"))!;
    const f = fakeFetch({ "barcode:4988021823012": mb("barcode-single-cd") });
    const hits = await searchReleases(r, f);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("YOUTHFUL");
    expect((f as unknown as { calls: string[] }).calls).toHaveLength(1);
  });

  it("drops barcode hits whose barcode differs", async () => {
    const r = parseProductModal(loadFixture("single-cd"))!;
    const f = fakeFetch({ "barcode:4988021823012": mb("barcode-none"), 'catno:"VPCC-82301"': mb("catno-rrcx-21017") });
    const hits = await searchReleases(r, f);
    expect(hits).toEqual([]);
    expect((f as unknown as { calls: string[] }).calls).toHaveLength(2);
  });

  it("falls back to catalog number and returns several hits", async () => {
    const r = parseProductModal(loadFixture("two-cd-dvd"))!;
    const f = fakeFetch({ "barcode:4988061868516": { releases: [] }, 'catno:"TFCC-86851"': mb("catno-multi") });
    const hits = await searchReleases(r, f);
    expect(hits).toHaveLength(2);
  });

  it("rejects on HTTP error", async () => {
    const r = parseProductModal(loadFixture("single-cd"))!;
    const f = fakeFetch({ "barcode:4988021823012": { error: "busy" } }, 503);
    await expect(searchReleases(r, f)).rejects.toThrow(/503/);
  });

  it("sends fmt=json, limit=25, and an Accept header", async () => {
    const r = parseProductModal(loadFixture("single-cd"))!;
    let seenInit: RequestInit | undefined;
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seenInit = init;
      const u = new URL(String(input));
      expect(u.origin + u.pathname).toBe("https://musicbrainz.org/ws/2/release/");
      expect(u.searchParams.get("fmt")).toBe("json");
      expect(u.searchParams.get("limit")).toBe("25");
      return new Response(JSON.stringify(mb("barcode-single-cd")), { status: 200 });
    }) as unknown as typeof fetch;
    await searchReleases(r, f);
    expect((seenInit?.headers as Record<string, string>)["Accept"]).toBe("application/json");
  });
});

describe("mbSearchUrl", () => {
  it("links to the advanced release search by catalog number", () => {
    expect(mbSearchUrl("TFCC-86851/3")).toBe(
      'https://musicbrainz.org/search?type=release&method=advanced&query=catno%3A%22TFCC-86851%22',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/musicbrainz.test.ts`
Expected: FAIL, cannot resolve `../src/musicbrainz`.

- [ ] **Step 3: Write S/src/musicbrainz.ts**

```ts
import type { MbMedium, MbReleaseHit, MincRelease } from "./types";

const WS = "https://musicbrainz.org/ws/2/release/";

export function catnoForQuery(catalogNumber: string): string {
  return catalogNumber.split("/")[0].trim();
}

function luceneQuote(s: string): string {
  return '"' + s.replace(/(["\\])/g, "\\$1") + '"';
}

export function buildQueries(release: MincRelease): string[] {
  const queries: string[] = [];
  if (release.barcode) queries.push(`barcode:${release.barcode}`);
  const catno = catnoForQuery(release.catalogNumber);
  if (catno.length > 0) queries.push(`catno:${luceneQuote(catno)}`);
  return queries;
}

type Json = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function toReleaseHit(json: unknown): MbReleaseHit {
  const j = (json ?? {}) as Json;
  const credits = Array.isArray(j["artist-credit"]) ? (j["artist-credit"] as Json[]) : [];
  const artist = credits.map((c) => `${str(c.name) ?? ""}${str(c.joinphrase) ?? ""}`).join("");
  const labelInfo = Array.isArray(j["label-info"]) ? (j["label-info"] as Json[]) : [];
  const catalogNumbers = labelInfo.map((li) => str(li["catalog-number"])).filter((c): c is string => c !== null);
  const mediaJson = Array.isArray(j.media) ? (j.media as Json[]) : [];
  const media: MbMedium[] = mediaJson.map((m, i) => ({
    position: typeof m.position === "number" ? m.position : i + 1,
    format: str(m.format),
    trackCount: typeof m["track-count"] === "number" ? (m["track-count"] as number) : 0,
  }));
  return {
    mbid: str(j.id) ?? "",
    title: str(j.title) ?? "",
    artist,
    date: str(j.date),
    country: str(j.country),
    catalogNumbers,
    barcode: str(j.barcode),
    media,
  };
}

async function runQuery(query: string, fetchFn: typeof fetch): Promise<MbReleaseHit[]> {
  const url = `${WS}?fmt=json&limit=25&query=${encodeURIComponent(query)}`;
  const res = await fetchFn(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`MusicBrainz responded with HTTP ${res.status}`);
  const body = (await res.json()) as Json;
  const releases = Array.isArray(body.releases) ? (body.releases as unknown[]) : [];
  return releases.map(toReleaseHit);
}

export async function searchReleases(release: MincRelease, fetchFn: typeof fetch = fetch): Promise<MbReleaseHit[]> {
  for (const query of buildQueries(release)) {
    let hits = await runQuery(query, fetchFn);
    if (query.startsWith("barcode:") && release.barcode) {
      hits = hits.filter((h) => h.barcode === release.barcode);
    }
    if (hits.length > 0) return hits;
  }
  return [];
}

export function mbSearchUrl(catalogNumber: string): string {
  const q = `catno:${luceneQuote(catnoForQuery(catalogNumber))}`;
  return `https://musicbrainz.org/search?type=release&method=advanced&query=${encodeURIComponent(q)}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/musicbrainz.test.ts`
Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/minc-isrc-to-musicbrainz/src/musicbrainz.ts scripts/minc-isrc-to-musicbrainz/test/musicbrainz.test.ts
git commit -m "Look up MusicBrainz releases by barcode with catalog number fallback"
```

---

### Task 6: Medium mapping

**Files:**
- Create: `S/src/mapping.ts`, `S/test/mapping.test.ts`

**Interfaces:**
- Consumes: `MincRelease`, `MbReleaseHit`, `MbMedium`, `DiscKind` from `S/src/types.ts`; `Analysis` from `S/src/analyze.ts`.
- Produces:

```ts
export interface DiscMapping {
  disc: number;            // minc disc position
  included: boolean;
  medium: number;          // MB medium position, or the minc disc position when there is no MB release
}
export function isVideoFormat(format: string | null): boolean;
export function defaultMapping(release: MincRelease, analysis: Analysis, hit: MbReleaseHit | null): DiscMapping[];
export function mappingMarks(release: MincRelease, mapping: DiscMapping[], hit: MbReleaseHit | null): string[];
```

`defaultMapping` returns one entry per submittable disc. `included` is true for audio discs and false for video discs. `medium` is the disc position when `hit` is null; with a hit it is the MB medium at the same position, or the last MB medium when there are fewer media. `mappingMarks` returns one message per included disc whose MB medium has a different track count or a different kind, and one message when the MB release has fewer media than needed.

- [ ] **Step 1: Write the failing tests**

`S/test/mapping.test.ts`:

```ts
import { loadFixture, mbHits } from "./helpers";
import { parseProductModal } from "../src/parser";
import { analyze } from "../src/analyze";
import { toReleaseHit } from "../src/musicbrainz";
import { defaultMapping, mappingMarks, isVideoFormat } from "../src/mapping";

const hit = (name: string) => mbHits(name, toReleaseHit)[0];

describe("isVideoFormat", () => {
  it("detects video formats", () => {
    expect(isVideoFormat("DVD-Video")).toBe(true);
    expect(isVideoFormat("Blu-ray")).toBe(true);
    expect(isVideoFormat("CD")).toBe(false);
    expect(isVideoFormat(null)).toBe(false);
  });
});

describe("defaultMapping", () => {
  it("includes audio discs, excludes video discs, and maps by position", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    const m = defaultMapping(r, analyze(r), hit("barcode-cd-bluray"));
    expect(m).toEqual([
      { disc: 1, included: true, medium: 1 },
      { disc: 2, included: false, medium: 2 },
    ]);
  });

  it("omits discs with no ISRC", () => {
    const r = parseProductModal(loadFixture("two-cd-dvd"))!;
    const m = defaultMapping(r, analyze(r), hit("barcode-two-cd-dvd"));
    expect(m.map((x) => x.disc)).toEqual([1, 2]);
  });

  it("uses the disc position without a MusicBrainz release", () => {
    const r = parseProductModal(loadFixture("thirteen-discs"))!;
    const m = defaultMapping(r, analyze(r), null);
    expect(m).toHaveLength(12);
    expect(m[11]).toEqual({ disc: 12, included: true, medium: 12 });
  });

  it("clamps to the last medium when MusicBrainz has fewer media", () => {
    const r = parseProductModal(loadFixture("two-cd-duplicate"))!;
    const single = hit("barcode-single-cd");
    const m = defaultMapping(r, analyze(r), single);
    expect(m.map((x) => x.medium)).toEqual([1, 1]);
  });
});

describe("mappingMarks", () => {
  it("is empty when everything lines up", () => {
    const r = parseProductModal(loadFixture("thirteen-discs"))!;
    const h = hit("barcode-thirteen-discs");
    expect(mappingMarks(r, defaultMapping(r, analyze(r), h), h)).toEqual([]);
  });

  it("flags a track count difference and a kind difference", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    const h = hit("barcode-cd-bluray");
    const m = [
      { disc: 1, included: true, medium: 2 },
      { disc: 2, included: true, medium: 1 },
    ];
    const marks = mappingMarks(r, m, h);
    expect(marks).toEqual([
      "Disc 1 (CD12cm, 13 tracks) is mapped to medium 2 (Blu-ray, 10 tracks): track count differs, kind differs",
      "Disc 2 (Blu-rayDisc Video, 10 tracks) is mapped to medium 1 (CD, 13 tracks): track count differs, kind differs",
    ]);
  });

  it("flags fewer media on MusicBrainz", () => {
    const r = parseProductModal(loadFixture("two-cd-duplicate"))!;
    const h = hit("barcode-single-cd");
    const marks = mappingMarks(r, defaultMapping(r, analyze(r), h), h);
    expect(marks[0]).toBe("MusicBrainz release has 1 medium but minc has 2 discs with ISRCs");
  });

  it("returns nothing without a MusicBrainz release", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    expect(mappingMarks(r, defaultMapping(r, analyze(r), null), null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/mapping.test.ts`
Expected: FAIL, cannot resolve `../src/mapping`.

- [ ] **Step 3: Write S/src/mapping.ts**

```ts
import type { Analysis } from "./analyze";
import type { DiscKind, MbReleaseHit, MincRelease } from "./types";

export interface DiscMapping {
  disc: number;
  included: boolean;
  medium: number;
}

export function isVideoFormat(format: string | null): boolean {
  return format !== null && /dvd|blu-?ray|vhs|video/i.test(format);
}

function mbKind(format: string | null): DiscKind {
  return isVideoFormat(format) ? "video" : "audio";
}

export function defaultMapping(release: MincRelease, analysis: Analysis, hit: MbReleaseHit | null): DiscMapping[] {
  const mediaCount = hit ? hit.media.length : 0;
  return analysis.submittableDiscs.map((discPos) => {
    const disc = release.discs.find((d) => d.position === discPos)!;
    let medium = discPos;
    if (hit) medium = mediaCount === 0 ? discPos : Math.min(discPos, mediaCount);
    return { disc: discPos, included: disc.kind === "audio", medium };
  });
}

export function mappingMarks(release: MincRelease, mapping: DiscMapping[], hit: MbReleaseHit | null): string[] {
  if (!hit) return [];
  const marks: string[] = [];
  const needed = mapping.length;
  if (hit.media.length < needed) {
    const plural = hit.media.length === 1 ? "medium" : "media";
    marks.push(`MusicBrainz release has ${hit.media.length} ${plural} but minc has ${needed} discs with ISRCs`);
  }
  for (const m of mapping) {
    if (!m.included) continue;
    const disc = release.discs.find((d) => d.position === m.disc)!;
    const medium = hit.media.find((x) => x.position === m.medium);
    if (!medium) continue;
    const problems: string[] = [];
    if (medium.trackCount !== disc.tracks.length) problems.push("track count differs");
    if (mbKind(medium.format) !== disc.kind) problems.push("kind differs");
    if (problems.length > 0) {
      marks.push(
        `Disc ${disc.position} (${disc.format}, ${disc.tracks.length} tracks) is mapped to medium ${medium.position} ` +
          `(${medium.format ?? "unknown format"}, ${medium.trackCount} tracks): ${problems.join(", ")}`,
      );
    }
  }
  return marks;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/mapping.test.ts`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/minc-isrc-to-musicbrainz/src/mapping.ts scripts/minc-isrc-to-musicbrainz/test/mapping.test.ts
git commit -m "Map minc discs to MusicBrainz media with mismatch marks"
```

---

### Task 7: MagicISRC URL and edit note

**Files:**
- Create: `S/src/magicisrc.ts`, `S/test/magicisrc.test.ts`

**Interfaces:**
- Consumes: `MincRelease` from `S/src/types.ts`; `DiscMapping` from `S/src/mapping.ts`.
- Produces:

```ts
export interface MagicIsrcEntry { medium: number; track: number; isrc: string; }
export function collectEntries(release: MincRelease, mapping: DiscMapping[]): MagicIsrcEntry[];
export function buildEditNote(release: MincRelease, version: string): string;
export function buildMagicIsrcUrl(input: { mbid: string | null; editNote: string; entries: MagicIsrcEntry[] }): string;
export function mincProductUrl(catalogNumber: string): string;
```

- [ ] **Step 1: Write the failing tests**

`S/test/magicisrc.test.ts`:

```ts
import { loadFixture } from "./helpers";
import { parseProductModal } from "../src/parser";
import { analyze } from "../src/analyze";
import { defaultMapping } from "../src/mapping";
import { collectEntries, buildEditNote, buildMagicIsrcUrl, mincProductUrl } from "../src/magicisrc";

describe("mincProductUrl", () => {
  it("encodes the catalog number", () => {
    expect(mincProductUrl("SECL-2001/2")).toBe("https://www.minc.or.jp/product/list/?dn=SECL-2001%2F2&type=search-form-diskno");
  });
});

describe("collectEntries", () => {
  it("uses only included discs and skips null ISRCs", () => {
    const r = parseProductModal(loadFixture("two-cd-dvd"))!;
    const mapping = defaultMapping(r, analyze(r), null);
    const entries = collectEntries(r, mapping);
    expect(entries).toHaveLength(27);
    expect(entries[0]).toEqual({ medium: 1, track: 1, isrc: "JPTF02202401" });
    expect(entries[26]).toEqual({ medium: 2, track: 13, isrc: "JPTF02202513" });
  });

  it("follows the chosen medium and the include flag", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    const entries = collectEntries(r, [
      { disc: 1, included: false, medium: 1 },
      { disc: 2, included: true, medium: 5 },
    ]);
    expect(entries).toHaveLength(10);
    expect(entries[0]).toEqual({ medium: 5, track: 1, isrc: "JPU981201583" });
  });
});

describe("buildEditNote", () => {
  it("names the catalog number, POS, source link, and version", () => {
    const r = parseProductModal(loadFixture("cd-bluray"))!;
    expect(buildEditNote(r, "1.0.0")).toBe(
      "ISRCs from MINC (音楽権利情報検索ナビ) for 品番 SECL-2001/2, POS 4547557046427\n" +
        "https://www.minc.or.jp/product/list/?dn=SECL-2001%2F2&type=search-form-diskno\n" +
        "via MINC ISRC to MusicBrainz v1.0.0",
    );
  });
  it("writes none when POS is empty", () => {
    const r = parseProductModal(loadFixture("music-list-empty-pos"))!;
    expect(buildEditNote(r, "1.0.0")).toContain("POS none\n");
  });
});

describe("buildMagicIsrcUrl", () => {
  it("orders parameters as musicbrainzid, isrcM-T, edit-note", () => {
    const url = buildMagicIsrcUrl({
      mbid: "caf79703-2512-439d-b515-81c9c0f6542f",
      editNote: "note & more",
      entries: [
        { medium: 1, track: 1, isrc: "JPKI00311412" },
        { medium: 2, track: 10, isrc: "JPKI00311439" },
      ],
    });
    expect(url).toBe(
      "https://magicisrc.kepstin.ca/?musicbrainzid=caf79703-2512-439d-b515-81c9c0f6542f" +
        "&isrc1-1=JPKI00311412&isrc2-10=JPKI00311439&edit-note=note+%26+more",
    );
  });

  it("omits musicbrainzid when there is no MBID", () => {
    const url = buildMagicIsrcUrl({ mbid: null, editNote: "n", entries: [{ medium: 1, track: 1, isrc: "JPVP01106901" }] });
    expect(url).toBe("https://magicisrc.kepstin.ca/?isrc1-1=JPVP01106901&edit-note=n");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/magicisrc.test.ts`
Expected: FAIL, cannot resolve `../src/magicisrc`.

- [ ] **Step 3: Write S/src/magicisrc.ts**

```ts
import type { DiscMapping } from "./mapping";
import type { MincRelease } from "./types";

export interface MagicIsrcEntry {
  medium: number;
  track: number;
  isrc: string;
}

export function mincProductUrl(catalogNumber: string): string {
  return `https://www.minc.or.jp/product/list/?dn=${encodeURIComponent(catalogNumber)}&type=search-form-diskno`;
}

export function collectEntries(release: MincRelease, mapping: DiscMapping[]): MagicIsrcEntry[] {
  const entries: MagicIsrcEntry[] = [];
  for (const m of mapping) {
    if (!m.included) continue;
    const disc = release.discs.find((d) => d.position === m.disc);
    if (!disc) continue;
    for (const t of disc.tracks) {
      if (t.isrc !== null) entries.push({ medium: m.medium, track: t.position, isrc: t.isrc });
    }
  }
  return entries;
}

export function buildEditNote(release: MincRelease, version: string): string {
  return (
    `ISRCs from MINC (音楽権利情報検索ナビ) for 品番 ${release.catalogNumber}, POS ${release.barcode ?? "none"}\n` +
    `${mincProductUrl(release.catalogNumber)}\n` +
    `via MINC ISRC to MusicBrainz v${version}`
  );
}

export function buildMagicIsrcUrl(input: { mbid: string | null; editNote: string; entries: MagicIsrcEntry[] }): string {
  const params = new URLSearchParams();
  if (input.mbid) params.set("musicbrainzid", input.mbid);
  for (const e of input.entries) params.set(`isrc${e.medium}-${e.track}`, e.isrc);
  params.set("edit-note", input.editNote);
  return `https://magicisrc.kepstin.ca/?${params.toString()}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/magicisrc.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/minc-isrc-to-musicbrainz/src/magicisrc.ts scripts/minc-isrc-to-musicbrainz/test/magicisrc.test.ts
git commit -m "Build the MagicISRC URL and edit note"
```

---

### Task 8: UI block and click flow

**Files:**
- Create: `S/src/ui.ts`, `S/test/ui.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3 to 7.
- Produces:

```ts
export interface UiDeps {
  version: string;
  search: (release: MincRelease) => Promise<MbReleaseHit[]>;
  open: (url: string) => void;
}
export function enhanceModalBody(body: Element, deps: UiDeps): boolean;  // false when nothing was added
```

Behavior:

1. `enhanceModalBody` returns false when `body` already has class `minc-isrc-mb`. Otherwise it adds that class first.
2. It parses the body. On `null` it writes `console.debug("[minc-isrc-mb] no track table in modal")` and returns false.
3. It appends `div.minc-isrc-mb-ui` to `.detail_data` holding: `button.btn.btn-primary.btn-sm` "Submit ISRCs to MusicBrainz", `span.minc-isrc-mb-status`, `div.minc-isrc-mb-picker` (hidden), `div.minc-isrc-mb-mapping` (hidden), `button.btn.btn-success.btn-sm.minc-isrc-mb-open` "Open MagicISRC" (hidden).
4. When `analysis.submittableDiscs` is empty, the submit button is disabled and the status says "No ISRC in this product".
5. On submit click: status "Searching MusicBrainz...", call `deps.search`. On rejection: status "MusicBrainz lookup failed (<message>). Try again." and show the picker with only the no-MBID row. On zero hits: status "No MusicBrainz release found", picker with the no-MBID row and a link to `mbSearchUrl`. On one hit: choose it. On several: picker with one row per hit plus the no-MBID row.
6. Choosing a hit (or no MBID) renders the mapping table with a checkbox per row, a `select` of MB media per row when there is a hit, marks, analysis notes, and shows the open button. Status shows "Release: <title> (<date>)" or "No MusicBrainz release chosen".
7. Open click: rebuild the mapping from the checkboxes and selects, `collectEntries`, `buildMagicIsrcUrl`, `deps.open(url)`.

- [ ] **Step 1: Write the failing tests**

`S/test/ui.test.ts`:

```ts
import { loadFixture, mbHits } from "./helpers";
import { toReleaseHit } from "../src/musicbrainz";
import { enhanceModalBody, type UiDeps } from "../src/ui";
import type { MbReleaseHit } from "../src/types";

const hit = (name: string): MbReleaseHit => mbHits(name, toReleaseHit)[0];

const tick = () => new Promise((r) => setTimeout(r, 0));

function deps(overrides: Partial<UiDeps> = {}) {
  const opened: string[] = [];
  const d: UiDeps = {
    version: "1.0.0",
    search: async () => [],
    open: (url) => opened.push(url),
    ...overrides,
  };
  return { d, opened };
}

describe("enhanceModalBody", () => {
  it("adds the UI once and marks the body", () => {
    const body = loadFixture("single-cd");
    const { d } = deps();
    expect(enhanceModalBody(body, d)).toBe(true);
    expect(body.classList.contains("minc-isrc-mb")).toBe(true);
    expect(body.querySelectorAll(".minc-isrc-mb-ui").length).toBe(1);
    expect(enhanceModalBody(body, d)).toBe(false);
    expect(body.querySelectorAll(".minc-isrc-mb-ui").length).toBe(1);
  });

  it("disables the button when there is no ISRC", () => {
    const body = loadFixture("music-list-empty-pos");
    enhanceModalBody(body, deps().d);
    const btn = body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!;
    expect(btn.disabled).toBe(true);
    expect(body.querySelector(".minc-isrc-mb-status")!.textContent).toBe("No ISRC in this product");
  });

  it("returns false and adds nothing when the table is missing", () => {
    const body = loadFixture("single-cd");
    body.querySelector(".table_wrapper")!.remove();
    expect(enhanceModalBody(body, deps().d)).toBe(false);
    expect(body.querySelector(".minc-isrc-mb-ui")).toBeNull();
  });

  it("opens MagicISRC with the single hit", async () => {
    const body = loadFixture("single-cd");
    const { d, opened } = deps({ search: async () => [hit("barcode-single-cd")] });
    enhanceModalBody(body, d);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    expect(body.querySelector(".minc-isrc-mb-status")!.textContent).toContain("YOUTHFUL");
    const rows = body.querySelectorAll(".minc-isrc-mb-mapping tbody tr");
    expect(rows.length).toBe(1);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(opened).toHaveLength(1);
    const u = new URL(opened[0]);
    expect(u.searchParams.get("musicbrainzid")).toBe(hit("barcode-single-cd").mbid);
    expect(u.searchParams.get("isrc1-1")).toBe("JPVP01106901");
    expect(u.searchParams.get("isrc1-3")).toBe("JPVP01106903");
    expect(u.searchParams.get("edit-note")).toContain("VPCC-82301");
  });

  it("shows a picker for several hits and honors the choice", async () => {
    const body = loadFixture("two-cd-duplicate");
    const hits = mbHits("catno-multi", toReleaseHit);
    const { d, opened } = deps({ search: async () => hits });
    enhanceModalBody(body, d);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    const useButtons = body.querySelectorAll<HTMLButtonElement>(".minc-isrc-mb-picker .minc-isrc-mb-use");
    expect(useButtons.length).toBe(2);
    useButtons[1].click();
    expect(body.querySelector(".minc-isrc-mb-warnings")!.textContent).toContain("JPTF02202404");
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(new URL(opened[0]).searchParams.get("musicbrainzid")).toBe(hits[1].mbid);
  });

  it("excludes the video disc by default and includes it when checked", async () => {
    const body = loadFixture("cd-bluray");
    const { d, opened } = deps({ search: async () => [hit("barcode-cd-bluray")] });
    enhanceModalBody(body, d);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    const boxes = body.querySelectorAll<HTMLInputElement>(".minc-isrc-mb-mapping input[type=checkbox]");
    expect(Array.from(boxes).map((b) => b.checked)).toEqual([true, false]);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(new URL(opened[0]).searchParams.has("isrc2-1")).toBe(false);
    boxes[1].checked = true;
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(new URL(opened[1]).searchParams.get("isrc2-1")).toBe("JPU981201583");
  });

  it("lets the user change the medium", async () => {
    const body = loadFixture("cd-bluray");
    const { d, opened } = deps({ search: async () => [hit("barcode-cd-bluray")] });
    enhanceModalBody(body, d);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    const selects = body.querySelectorAll<HTMLSelectElement>(".minc-isrc-mb-mapping select");
    expect(selects.length).toBe(2);
    selects[0].value = "2";
    selects[0].dispatchEvent(new (body.ownerDocument.defaultView as Window & typeof globalThis).Event("change"));
    expect(body.querySelector(".minc-isrc-mb-warnings")!.textContent).toContain("track count differs");
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(new URL(opened[0]).searchParams.get("isrc2-1")).toBe("JPU901601692");
  });

  it("offers the no-MBID path on zero hits and on failure", async () => {
    const body = loadFixture("single-cd");
    const { d, opened } = deps({ search: async () => [] });
    enhanceModalBody(body, d);
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    expect(body.querySelector(".minc-isrc-mb-status")!.textContent).toBe("No MusicBrainz release found");
    expect(body.querySelector<HTMLAnchorElement>(".minc-isrc-mb-picker a")!.href).toContain("musicbrainz.org/search");
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-nombid")!.click();
    body.querySelector<HTMLButtonElement>(".minc-isrc-mb-open")!.click();
    expect(new URL(opened[0]).searchParams.has("musicbrainzid")).toBe(false);
    expect(new URL(opened[0]).searchParams.get("isrc1-2")).toBe("JPVP01106902");

    const body2 = loadFixture("single-cd");
    const d2 = deps({ search: async () => { throw new Error("HTTP 503"); } });
    enhanceModalBody(body2, d2.d);
    body2.querySelector<HTMLButtonElement>(".minc-isrc-mb-submit")!.click();
    await tick();
    expect(body2.querySelector(".minc-isrc-mb-status")!.textContent).toBe("MusicBrainz lookup failed (HTTP 503). Try again.");
    expect(body2.querySelector(".minc-isrc-mb-nombid")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/ui.test.ts`
Expected: FAIL, cannot resolve `../src/ui`.

- [ ] **Step 3: Write S/src/ui.ts**

```ts
import { analyze, type Analysis } from "./analyze";
import { buildEditNote, buildMagicIsrcUrl, collectEntries } from "./magicisrc";
import { defaultMapping, mappingMarks, type DiscMapping } from "./mapping";
import { mbSearchUrl } from "./musicbrainz";
import { parseProductModal } from "./parser";
import type { MbReleaseHit, MincRelease } from "./types";

export interface UiDeps {
  version: string;
  search: (release: MincRelease) => Promise<MbReleaseHit[]>;
  open: (url: string) => void;
}

export const MARKER = "minc-isrc-mb";

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function mediaSummary(hit: MbReleaseHit): string {
  return hit.media.map((m) => `${m.format ?? "?"} ${m.trackCount}`).join(" + ");
}

interface State {
  release: MincRelease;
  analysis: Analysis;
  hit: MbReleaseHit | null;
  mapping: DiscMapping[];
}

export function enhanceModalBody(body: Element, deps: UiDeps): boolean {
  if (body.classList.contains(MARKER)) return false;
  body.classList.add(MARKER);

  const release = parseProductModal(body);
  const detail = body.querySelector(".detail_data");
  if (!release || !detail) {
    console.debug("[minc-isrc-mb] no track table in modal");
    return false;
  }
  const doc = body.ownerDocument;
  const analysis = analyze(release);
  const state: State = { release, analysis, hit: null, mapping: [] };

  const ui = el(doc, "div", "minc-isrc-mb-ui");
  ui.style.cssText = "clear:both;padding-top:8px";
  const submit = el(doc, "button", "btn btn-primary btn-sm minc-isrc-mb-submit", "Submit ISRCs to MusicBrainz");
  submit.type = "button";
  const status = el(doc, "span", "minc-isrc-mb-status");
  status.style.marginLeft = "8px";
  const picker = el(doc, "div", "minc-isrc-mb-picker");
  picker.hidden = true;
  const mappingBox = el(doc, "div", "minc-isrc-mb-mapping");
  mappingBox.hidden = true;
  const warnings = el(doc, "div", "minc-isrc-mb-warnings");
  const open = el(doc, "button", "btn btn-success btn-sm minc-isrc-mb-open", "Open MagicISRC");
  open.type = "button";
  open.hidden = true;
  ui.append(submit, status, picker, mappingBox, warnings, open);
  detail.appendChild(ui);

  if (analysis.submittableDiscs.length === 0) {
    submit.disabled = true;
    status.textContent = "No ISRC in this product";
    return true;
  }

  const setStatus = (msg: string) => {
    status.textContent = msg;
  };

  const readMapping = (): DiscMapping[] =>
    Array.from(mappingBox.querySelectorAll<HTMLTableRowElement>("tbody tr")).map((tr) => {
      const disc = Number(tr.dataset.disc);
      const box = tr.querySelector<HTMLInputElement>("input[type=checkbox]")!;
      const sel = tr.querySelector<HTMLSelectElement>("select");
      return { disc, included: box.checked, medium: sel ? Number(sel.value) : disc };
    });

  const renderWarnings = () => {
    warnings.textContent = "";
    const lines: string[] = [];
    for (const d of analysis.duplicateIsrcs) lines.push(`Warning: ISRC ${d.isrc} appears on ${d.where.join(" and ")}`);
    for (const m of mappingMarks(release, state.mapping, state.hit)) lines.push(`Warning: ${m}`);
    if (analysis.tracksWithoutIsrc.length > 0) {
      const list = analysis.tracksWithoutIsrc.map((t) => `Disc ${t.disc} track ${t.track}`).join(", ");
      lines.push(`Note: ${analysis.tracksWithoutIsrc.length} track(s) without ISRC will be skipped: ${list}`);
    }
    for (const line of lines) {
      const p = el(doc, "div", line.startsWith("Warning") ? "text-danger" : "text-muted", line);
      warnings.appendChild(p);
    }
  };

  const renderMapping = () => {
    mappingBox.textContent = "";
    const table = el(doc, "table", "table table-condensed");
    table.style.marginTop = "8px";
    const thead = el(doc, "thead");
    const hr = el(doc, "tr");
    for (const h of ["Include", "minc disc", "MusicBrainz medium"]) hr.appendChild(el(doc, "th", "", h));
    thead.appendChild(hr);
    const tbody = el(doc, "tbody");
    for (const m of state.mapping) {
      const disc = release.discs.find((d) => d.position === m.disc)!;
      const tr = el(doc, "tr");
      tr.dataset.disc = String(m.disc);
      const tdInc = el(doc, "td");
      const box = el(doc, "input");
      box.type = "checkbox";
      box.checked = m.included;
      box.addEventListener("change", () => {
        state.mapping = readMapping();
        renderWarnings();
      });
      tdInc.appendChild(box);
      const isrcCount = disc.tracks.filter((t) => t.isrc !== null).length;
      const tdDisc = el(doc, "td", "", `Disc ${disc.position} ${disc.format}, ${disc.tracks.length} tracks, ${isrcCount} ISRCs`);
      const tdMed = el(doc, "td");
      if (state.hit && state.hit.media.length > 0) {
        const sel = el(doc, "select");
        for (const med of state.hit.media) {
          const opt = el(doc, "option", "", `Medium ${med.position}: ${med.format ?? "?"}, ${med.trackCount} tracks`);
          opt.value = String(med.position);
          sel.appendChild(opt);
        }
        sel.value = String(m.medium);
        sel.addEventListener("change", () => {
          state.mapping = readMapping();
          renderWarnings();
        });
        tdMed.appendChild(sel);
      } else {
        tdMed.textContent = `Medium ${m.medium} (by position)`;
      }
      tr.append(tdInc, tdDisc, tdMed);
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    mappingBox.appendChild(table);
    mappingBox.hidden = false;
    renderWarnings();
    open.hidden = false;
  };

  const choose = (hit: MbReleaseHit | null) => {
    state.hit = hit;
    state.mapping = defaultMapping(release, analysis, hit);
    picker.hidden = true;
    setStatus(hit ? `Release: ${hit.title} (${hit.date ?? "no date"})` : "No MusicBrainz release chosen");
    renderMapping();
  };

  const noMbidButton = () => {
    const b = el(doc, "button", "btn btn-default btn-xs minc-isrc-mb-nombid", "No MBID, paste it in MagicISRC");
    b.type = "button";
    b.addEventListener("click", () => choose(null));
    return b;
  };

  const renderPicker = (hits: MbReleaseHit[], showSearchLink: boolean) => {
    picker.textContent = "";
    const list = el(doc, "ul", "list-unstyled");
    for (const h of hits) {
      const li = el(doc, "li");
      const use = el(doc, "button", "btn btn-default btn-xs minc-isrc-mb-use", "Use this");
      use.type = "button";
      use.addEventListener("click", () => choose(h));
      const desc = ` ${h.title} — ${h.artist} — ${h.date ?? "no date"} ${h.country ?? ""} — ${h.catalogNumbers.join(", ")} — ${mediaSummary(h)}`;
      li.append(use, doc.createTextNode(desc));
      list.appendChild(li);
    }
    const last = el(doc, "li");
    last.appendChild(noMbidButton());
    if (showSearchLink) {
      const a = el(doc, "a", "", " Search MusicBrainz by catalog number");
      a.href = mbSearchUrl(release.catalogNumber);
      a.target = "_blank";
      a.rel = "noopener";
      last.append(doc.createTextNode(" "), a);
    }
    list.appendChild(last);
    picker.appendChild(list);
    picker.hidden = false;
  };

  submit.addEventListener("click", async () => {
    submit.disabled = true;
    open.hidden = true;
    mappingBox.hidden = true;
    warnings.textContent = "";
    setStatus("Searching MusicBrainz...");
    try {
      const hits = await deps.search(release);
      if (hits.length === 1) choose(hits[0]);
      else if (hits.length === 0) {
        setStatus("No MusicBrainz release found");
        renderPicker([], true);
      } else {
        setStatus(`${hits.length} MusicBrainz releases found, pick one`);
        renderPicker(hits, false);
      }
    } catch (e) {
      setStatus(`MusicBrainz lookup failed (${e instanceof Error ? e.message : String(e)}). Try again.`);
      renderPicker([], false);
    } finally {
      submit.disabled = false;
    }
  });

  open.addEventListener("click", () => {
    state.mapping = readMapping();
    const entries = collectEntries(release, state.mapping);
    const url = buildMagicIsrcUrl({ mbid: state.hit?.mbid ?? null, editNote: buildEditNote(release, deps.version), entries });
    deps.open(url);
  });

  return true;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/ui.test.ts`
Expected: 8 tests pass. If the failure test's error message check fails, make sure `searchReleases` in Task 5 throws `Error("MusicBrainz responded with HTTP 503")` and the test's fake throws `Error("HTTP 503")`; the UI must print the error's `message` verbatim inside the parentheses.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck && npm test`

```bash
git add scripts/minc-isrc-to-musicbrainz/src/ui.ts scripts/minc-isrc-to-musicbrainz/test/ui.test.ts
git commit -m "Add the modal UI block with picker, mapping table, and MagicISRC hand-off"
```

---

### Task 9: Page glue, build, README, and manual check

**Files:**
- Modify: `S/src/main.ts`
- Create: `README.md` (repository root), `S/README.md`, `S/test/main.test.ts`
- Rebuild: `dist/minc-isrc-to-musicbrainz.user.js`

**Interfaces:**
- Consumes: `enhanceModalBody`, `UiDeps` from `S/src/ui.ts`; `searchReleases` from `S/src/musicbrainz.ts`.
- Produces: `enhanceOpenModals(doc: Document, deps: UiDeps): number` (count of bodies enhanced on this tick) and the running poll in `main.ts`.

- [ ] **Step 1: Write the failing test**

`S/test/main.test.ts`:

```ts
import { JSDOM } from "jsdom";
import { fixtureHtml } from "./helpers";
import { enhanceOpenModals } from "../src/main";

function page(...fixtures: { name: string; open: boolean }[]): Document {
  const html = fixtures
    .map((f) => `<div class="modal${f.open ? " in" : ""}"><div class="modal-dialog large">${fixtureHtml(f.name)}</div></div>`)
    .join("");
  return new JSDOM(`<body>${html}</body>`).window.document;
}

const deps = { version: "1.0.0", search: async () => [], open: () => {} };

describe("enhanceOpenModals", () => {
  it("enhances only open modals, once", () => {
    const doc = page({ name: "single-cd", open: true }, { name: "cd-bluray", open: false });
    expect(enhanceOpenModals(doc, deps)).toBe(1);
    expect(doc.querySelectorAll(".minc-isrc-mb-ui").length).toBe(1);
    expect(enhanceOpenModals(doc, deps)).toBe(0);
    doc.querySelectorAll(".modal")[1].classList.add("in");
    expect(enhanceOpenModals(doc, deps)).toBe(1);
  });

  it("ignores open modals without a track table", () => {
    const doc = page({ name: "single-cd", open: true });
    doc.querySelector(".table_wrapper")!.remove();
    expect(enhanceOpenModals(doc, deps)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/main.test.ts`
Expected: FAIL, `enhanceOpenModals` is not exported.

- [ ] **Step 3: Write S/src/main.ts**

```ts
import { searchReleases } from "./musicbrainz";
import { enhanceModalBody, MARKER, type UiDeps } from "./ui";

declare const __VERSION__: string;

export function enhanceOpenModals(doc: Document, deps: UiDeps): number {
  let count = 0;
  const bodies = doc.querySelectorAll(`.modal.in .modal-body:not(.${MARKER})`);
  for (const body of Array.from(bodies)) {
    if (!body.querySelector(".detail_data") || !body.querySelector("table.cd-detail2-track-list")) continue;
    if (enhanceModalBody(body, deps)) count += 1;
  }
  return count;
}

function start(): void {
  const deps: UiDeps = {
    version: typeof __VERSION__ === "string" ? __VERSION__ : "dev",
    search: (release) => searchReleases(release),
    open: (url) => {
      window.open(url, "_blank", "noopener");
    },
  };
  setInterval(() => enhanceOpenModals(document, deps), 1000);
}

if (typeof window !== "undefined" && typeof document !== "undefined" && /minc\.or\.jp$/.test(window.location.hostname)) {
  start();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/minc-isrc-to-musicbrainz/test/main.test.ts`
Expected: 2 tests pass.

Note on the `.detail_data` check in `enhanceOpenModals`: a body that lacks the table is skipped without being marked, so the poll retries it on the next tick while the AJAX content is still loading. `enhanceModalBody` marks and logs only when it is called with a body that has a table but fails to parse.

- [ ] **Step 5: Write the two README files**

Root `README.md`:

```markdown
# userscripts

Userscripts by Shen-Ta Hsieh. Each script lives in `scripts/<name>/` and is built into `dist/<name>.user.js`.

| Script | Install | About |
|---|---|---|
| MINC ISRC to MusicBrainz | [dist/minc-isrc-to-musicbrainz.user.js](https://github.com/ibmibmibm/userscripts/raw/main/dist/minc-isrc-to-musicbrainz.user.js) | [scripts/minc-isrc-to-musicbrainz](scripts/minc-isrc-to-musicbrainz/README.md) |

## Develop

    npm install
    npm run typecheck
    npm test
    npm run build            # every script
    node build.mjs <name>    # one script

`dist/` is committed. The GitHub Actions workflow rebuilds it on every push to `main` and commits the result.
To add a script, create `scripts/<name>/header.txt` and `scripts/<name>/src/main.ts`; the build picks it up.
```

`S/README.md`:

```markdown
# MINC ISRC to MusicBrainz

A userscript for [音楽権利情報検索ナビ (MINC)](https://www.minc.or.jp/). It adds a button to the CD detail modal
on the product list and music list pages. The button reads every ISRC in the modal, finds the release on
MusicBrainz by barcode, and opens [MagicISRC](https://magicisrc.kepstin.ca/) with all ISRCs prefilled.
MagicISRC handles the MusicBrainz login, the preview, and the submit.

## Install

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Open https://github.com/ibmibmibm/userscripts/raw/main/dist/minc-isrc-to-musicbrainz.user.js and accept the install.
   The script updates itself from that URL.

## Use

1. Log in to MINC and search for a CD product on `/product/list/` or `/music/list/`.
2. Click the CD title to open the detail modal.
3. Click "Submit ISRCs to MusicBrainz".
4. If MusicBrainz returns several releases, pick one. If it returns none, use "No MBID" and paste the MBID in MagicISRC.
5. Check the disc mapping table. Audio discs are included by default, DVD and Blu-ray discs are not. Change the
   MusicBrainz medium for a disc if the counts do not line up.
6. Click "Open MagicISRC", review, and submit there.

## Develop

Run `npm test` and `node build.mjs minc-isrc-to-musicbrainz` from the repository root. Test fixtures under
`test/fixtures/` are captured from real MINC modals (MINC needs a login, so they cannot be re-downloaded).
`test/fixtures/raw/*.txt` holds the captured data and `node scripts/minc-isrc-to-musicbrainz/test/fixtures/generate.mjs`
rebuilds the HTML fixtures from it. Bump `@version` in `header.txt` before a release.
```

- [ ] **Step 6: Build, run everything, commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: all tests pass, build writes the dist file.

```bash
git add scripts/minc-isrc-to-musicbrainz/src/main.ts scripts/minc-isrc-to-musicbrainz/test/main.test.ts README.md scripts/minc-isrc-to-musicbrainz/README.md dist/minc-isrc-to-musicbrainz.user.js
git commit -m "Add the poll loop, READMEs, and built userscript"
```

- [ ] **Step 7: Manual check in Chrome**

Install `dist/minc-isrc-to-musicbrainz.user.js` in the script manager, then open each URL, click the CD title, and check the listed behavior. Do not click submit inside MagicISRC unless the edit is wanted.

| URL | Expected |
|---|---|
| `https://www.minc.or.jp/product/list/?dn=VPCC-82301&type=search-form-diskno` | Button appears; one MB hit; mapping has one row; MagicISRC opens with 3 ISRCs |
| `https://www.minc.or.jp/product/list/?dn=TFCC-86854&type=search-form-diskno` | Warning about ISRC JPTF02202404 on tracks 4 and 5 |
| `https://www.minc.or.jp/product/list/?dn=SECL-2001%2F2&type=search-form-diskno` | Two rows, Blu-ray unchecked; checking it adds `isrc2-1..10` |
| `https://www.minc.or.jp/product/list/?dn=KIZC-101&type=search-form-diskno` | 12 rows, DVD absent; MagicISRC shows 12 CDs prefilled |
| `https://www.minc.or.jp/music/list/?tr=YOUTHFUL&ka=&type=search-form-title&match=1` | First title (TODAY) shows a disabled button "No ISRC in this product" |

Record any difference from the expected behavior as a bug and fix it with a test before the final commit.

---

### Task 10: GitHub Actions build workflow

**Files:**
- Create: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: `npm run typecheck`, `npm test`, `npm run build` from Task 1.
- Produces: CI on every push and pull request; on pushes to `main`, a commit of a changed `dist/` by `github-actions[bot]` with `[skip ci]` in the message so the workflow does not loop.

- [ ] **Step 1: Write the workflow**

`.github/workflows/build.yml`:

```yaml
name: Build

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

      - name: Commit built userscripts
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add dist
          if git diff --cached --quiet; then
            echo "dist is up to date"
            exit 0
          fi
          git commit -m "Build userscripts [skip ci]"
          git push
```

- [ ] **Step 2: Check the file reads back**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/build.yml','utf8'); if(!/npm run build/.test(y)||!/skip ci/.test(y)) process.exit(1)"`
Expected: exit code 0. No YAML parser is installed locally; the real check is the first run on GitHub.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "Add CI workflow that tests, builds, and commits dist on main"
```

- [ ] **Step 4: Repository setup by the owner (manual, outside the code)**

1. Rename the local folder to `userscripts` and create the GitHub repository `ibmibmibm/userscripts`.
2. Rename the local branch from `master` to `main` with `git branch -m master main`, so the workflow trigger and the `@downloadURL` match.
3. In the repository settings under Actions, General, set Workflow permissions to "Read and write permissions" so the bot commit can push.
4. Push `main` and make sure that the Build workflow passes, and that a "Build userscripts [skip ci]" commit appears when `dist/` was stale.

---

## Self-review

Spec coverage: pages and trigger (Task 9), modal structure and parser (Tasks 2, 3), analysis (Task 4), MusicBrainz lookup with barcode filter and catalog number fallback (Task 5), release choice and picker (Task 8), medium mapping with checkboxes, selects, and marks (Tasks 6, 8), MagicISRC URL and edit note (Task 7), UI block and error handling (Task 8), delivery, multi-script layout, and header (Task 1), testing with fixtures (Tasks 2 to 9), READMEs (Task 9), CI workflow that commits `dist/` (Task 10).

Type consistency: `MincRelease`, `MincDisc`, `MincTrack`, `MbReleaseHit`, `MbMedium` live in `S/src/types.ts`; `Analysis` in `S/src/analyze.ts`; `DiscMapping` in `S/src/mapping.ts`; `MagicIsrcEntry` in `S/src/magicisrc.ts`; `UiDeps` and `MARKER` in `S/src/ui.ts`. `loadFixture`, `fixtureHtml`, `mbJson`, and `mbHits` live in `S/test/helpers.ts` and are reused by every test.
