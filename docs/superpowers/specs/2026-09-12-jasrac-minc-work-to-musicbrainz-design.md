# jasrac-minc-work-to-musicbrainz userscript design

Date: 2026-09-12

## Goal

A userscript that adds a panel to the work detail pages of J-WID
(www2.jasrac.or.jp) and minc (www.minc.or.jp, 音楽権利情報検索ナビ). The
panel reads the work data on the page (title, JASRAC code, NexTone code,
ISWC, credits, titles, artists), finds the matching MusicBrainz work, and
opens the MusicBrainz work editor in a new tab with every field it can
prefill: name, ISWC, JASRAC ID and NexTone ID attributes, type or
language, lyricist / composer / arranger / translator / writer / publisher
relationships, and an edit note. The user reviews and submits on
MusicBrainz.

This replaces the J-WID part of jesus2099's
`jasrac-mb-minc_WORK-IMPORT-CROSS-LINKING.user.js`, whose credit parsing
stopped working after the J-WID redesign.

## Non-goals

- No POST to MusicBrainz and no call to MusicBrainz internal endpoints.
  A POST to `/work/create` enters the edit without review, so the script
  only opens GET URLs.
- No alias seeding. The work editor cannot seed aliases; the edit note
  carries the katakana and romaji titles instead.
- No links added on musicbrainz.org pages.
- No support for minc list pages or modals. The minc work detail page
  (`/saku/detail/`) is the only minc page.
- No automatic title search. Title search runs when the user clicks.

## Delivery

- Script folder `scripts/jasrac-minc-work-to-musicbrainz/` with
  `header.txt`, `README.md`, `src/`, and `test/`, built by the shared
  root toolchain (`build.mjs`, vitest, jsdom) into
  `dist/jasrac-minc-work-to-musicbrainz.user.js`.
- The shipped artifact is the single `dist/*.user.js` file, committed by
  the existing GitHub Actions workflow.

## Userscript header

```
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
```

`@grant none` is enough. The MusicBrainz web service sends CORS headers,
so plain `fetch` works from both pages.

## Pages and trigger

### J-WID work detail

URL: `https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=<8 digits>&…`.
The page is server-rendered. Relevant DOM:

- `div.baseinfo`
  - `.baseinfo--code strong` — work code, `703-4241-5`
  - `.baseinfo--iswc strong` — ISWC, `T-102.054.195-9`; the whole
    `.baseinfo--iswc` element is absent when the work has no ISWC
  - `.baseinfo--name` — title as JASRAC spells it, full-width Latin
    (`ＹＯＵＴＨＦＵＬ`), text node only
  - `.baseinfo--status dl` pairs: `dt` `内外` with `dd` `内国作品` or
    `外国作品`; `dt` `出典` with `dd` such as `PO(出版者作品届)`
- `div#tab-def .PC table.detail` — the credit table. Every usage-field
  tab (`div#tab-99-01`, `div#tab-00-01`, …) holds an identical copy;
  `#tab-def` is the one to read. If `#tab-def` is absent, read the first
  `section.content-block .PC table.detail`. Rows: two header rows
  (`th` only), then one `tr` per credit with `td` cells in this order:
  No., 著作者/出版者, 識別, 契約, 所属団体, 特記. Names use a full-width
  space between surname and given name (`堀内　孝太`) and between company
  name and marker (`日本テレビ音楽　株式会社`).
- The title table: the `table.detail.auto` whose header row contains
  `作品タイトル`. Each data row: `td.center` with 区分 (`正題`, `副題1`,
  `副題2`, …) and a `td` whose content is three lines separated by `<br>`:
  title, katakana reading, romaji. A blank line is `&nbsp;`. A title
  starting with `＊` is a JASRAC search name (検索用名称).
- `section[data-role='artist'] table.detail` — artist list, one `tr` per
  artist after the header row, `td` cells: No., アーティスト名. The section
  or its table can be absent.

Trigger: `.baseinfo--name` exists and the panel marker is absent.

### minc work detail

URL: `https://www.minc.or.jp/saku/detail/?jcd=<8 digits>&ncd=<NexTone code or empty>&refer=…`.
The page needs a minc login. Relevant DOM:

- `div#jasrac-area.detail_area.jasrac`
  - first `table`: header rows `th`/`td` pairs 作品名, 作品コード, ISWC,
    副題, アーティスト. ISWC is `T- 102.054.195-9` (space after `T-`).
    The アーティスト `td` holds names separated by `<br>`.
  - every following `table`: one credit, cells `th` 権利者名, `td` name,
    `th` `識別 / 信託状況 / 契約`, `td` `作詞 / 無信託 /` (three values
    separated by ` / `).
- `div#nextone-area.detail_area.nextone`
  - when NexTone has no data the area holds the text `情報はありません`
    and no table.
  - first `table`: 作品名, 作品コード (`N00913658`), 副題, アーティスト.
    There is no ISWC row.
  - every following `table`: `th` 権利者名, `td` names separated by ` / `
    and `<br>` (`かいりきベア / <br>株式会社 ドワンゴ 第七事業部`), `th`
    識別, `td` roles separated by ` / ` (`作詞 / 出版社`). Names and
    roles pair up by position.

Trigger: `#jasrac-area table` exists and the panel marker is absent.

### Poll

`main.ts` runs `setInterval(enhance, 1000)`. `enhance` checks the
trigger for the current host and inserts the panel once. The panel root
carries the marker class `jasrac-minc-mb`.

## Data model

```ts
type Source = "JASRAC" | "NexTone";

interface TitleLine {
  kind: string;          // "正題", "副題1", … ; minc gives "副題"
  title: string;         // as written on the page
  kana: string | null;   // J-WID only
  romaji: string | null; // J-WID only
  searchName: boolean;   // title started with ＊ (marker kept in title)
}

interface Credit {
  source: Source;
  name: string;          // as written on the page
  role: string;          // 識別 as written: 作詞, 作曲, 出版者, 出版社, …
  trust: string | null;  // 信託状況 (minc) or 契約 (J-WID), null if blank
  society: string | null;// 所属団体 (J-WID only)
  note: string | null;   // 特記 (J-WID only)
}

interface WorkInfo {
  site: "jwid" | "minc";
  sourceUrl: string;     // canonical page URL, see below
  title: string;         // 正題 / 作品名 as written
  jasracCode: string | null;  // "703-4241-5"
  nextoneCode: string | null; // "N00913658"
  iswc: string | null;   // "T-102.054.195-9"
  domestic: boolean | null;   // 内国作品 true, 外国作品 false, minc null
  titles: TitleLine[];
  artists: string[];
  credits: Credit[];
}
```

`sourceUrl`:

- J-WID: `https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=<digits>&subSessionID=001&subSession=start`
  where digits are the code without hyphens.
- minc: `https://www.minc.or.jp/saku/detail/?jcd=<digits>&ncd=<NexTone code or empty>`.

## Parsers

`parseJwid(doc): WorkInfo | null` and `parseMinc(doc): WorkInfo | null`.
Both return null when the trigger element is missing. Both keep the
page spelling in `WorkInfo`; normalization happens in `normalize.ts`.

Parsing rules:

- ISWC: strip all whitespace, then accept only
  `/^T-\d{3}\.\d{3}\.\d{3}-\d$/`; anything else becomes null.
- JASRAC code: accept `/^\d{3}-\d{4}-\d$/`, else null. NexTone code:
  accept `/^N\d{8}$/`, else null.
- Trust / society / note: trimmed text, empty becomes null.
- J-WID title table: split the title cell on `<br>`, trim each line,
  treat `&nbsp;`, empty, `－`, and `-` as blank (null). `searchName` is
  true when the title line starts with `＊` or `*`.
- minc: `副題` becomes one `TitleLine` with kind `副題` when non-empty.
  `titles` always starts with a `正題` line built from 作品名.
- minc NexTone credits: split the name cell text on ` / ` (after
  replacing `<br>` with nothing) and the role cell on ` / `, trim, pair
  by index; extra names without a role get role `不明`; extra roles
  without a name are dropped.
- Credits from both minc areas are concatenated, JASRAC first.

## Normalization (`normalize.ts`)

- `fold(s)`: NFKC, then collapse runs of whitespace to one ASCII space,
  trim.
- `moveArticle(s)`: when `s` has no character in the CJK ranges
  (Hiragana, Katakana, CJK Unified Ideographs; Halfwidth and Fullwidth
  Forms are already folded) and matches `/^(.+) (THE|A|AN)$/i`, return
  `<article> <rest>`; else return `s`. Letter case is unchanged.
- `displayTitle(t)`: `moveArticle(fold(t))`.
- `COMPANY_MARKERS`: `株式会社`, `(株)`, `有限会社`, `合同会社`, `Inc`,
  `Inc.`, `Ltd`, `Ltd.`, `LLC`, `Co.`, `Co., Ltd.`. The `㈱` form folds to
  `(株)` under NFKC.
- `isCompany(name)`: fold, then true when any marker appears as a whole
  token at the start or end.
- `stripCompany(name)`: fold, remove a leading or trailing marker and
  the space next to it, trim.
- `isCjkOnly(s)`: every non-space character is in the CJK ranges or is
  `・`, `ー`, `々`, or a full-width punctuation character.
- `targetName(name)`: `stripCompany(name)`, then remove all spaces when
  `isCjkOnly`. Examples: `堀内　孝太` → `堀内孝太`; `日本テレビ音楽　株式会社`
  → `日本テレビ音楽`; `株式会社 ドワンゴ 第七事業部` → `ドワンゴ第七事業部`;
  `ＭｏｎｓｔｅｒＺ ＭＡＴＥ` → `MonsterZ MATE`; `ソニー・ミュージックパブリッシング`
  unchanged.
- `RIGHTS_HOLDER = /^権利者[\s　]*/`. `stripRightsHolder(name)` removes it.

## Credit mapping (`mapping.ts`)

Constants:

```ts
const LINK = {
  lyricist:   "3e48faba-ec01-47fd-8e89-30e81161661c",
  translator: "da6c5d8a-ce13-474d-9375-61feb29039a5",
  composer:   "d59d99ea-23d4-4a80-b066-edca32ee158f",
  writer:     "a255bca1-b157-4518-9108-7b147dc3fc68",
  arranger:   "d3fd781c-5894-47e2-8c12-86cc0e2c8d08",
  publishing: "05ee6f18-4517-342d-afdf-5897f64276e3",
};
const ATTR = {
  additional: "0a5341f8-3b1d-4f99-a0c6-26b7f4e42c7f",
  sub:        "4521ce8e-3d24-4b64-9805-59df6f3a4740",
};
const WORK_ATTR = { jasrac: 3, nextone: 33 };
const WORK_TYPE_SONG = 17;
const LANG_NO_LYRICS = 486;
```

```ts
interface SeedRel {
  linkType: string;        // LINK value
  targetType: "artist" | "label";
  target: string;          // targetName(...)
  attributes: string[];    // ATTR values
  label: string;           // "lyricist", "sub-publisher", … for the panel
  from: Credit[];          // credits merged into this rel
}
```

`mapCredits(credits): { rels: SeedRel[]; skipped: { credit: Credit; reason: string }[] }`:

| role (識別)          | result                                   |
|----------------------|------------------------------------------|
| 作詞                 | lyricist                                 |
| 補詞                 | lyricist + additional                    |
| 訳詞                 | translator                               |
| 作曲                 | composer                                 |
| 編曲                 | arranger                                 |
| 作曲作詞, 不明        | writer                                   |
| 出版者, 出版社        | publishing (label)                       |
| サブ出版             | publishing + sub (label)                 |
| anything else        | skipped, reason `not mapped`             |

Before the table: when the name matches `RIGHTS_HOLDER`, strip the
prefix; if the rest `isCompany`, map it to publishing (label) whatever
the role; otherwise skip the credit with reason `rights holder`. A name
equal to `UNKNOWN PUBLISHER` after folding is skipped with reason
`unknown publisher`.

Dedupe: two credits merge into one `SeedRel` when `linkType`, the
attribute set, and `target` are equal. Order is the page order of the
first credit of each rel.

`workKind(credits): "song" | "instrumental" | "unknown"`:

- `song` when any role contains `詞`;
- `instrumental` when no role contains `詞` and no role is `作曲作詞` or
  `不明` and at least one role is `作曲` or `編曲`;
- `unknown` otherwise (for example only publisher rows).

`song` seeds `edit-work.type_id=17`; `instrumental` seeds
`edit-work.languages.0=486`; `unknown` seeds neither.

## MusicBrainz client (`musicbrainz.ts`)

All requests go to `https://musicbrainz.org/ws/2/` with
`Accept: application/json` and a 15 s timeout. A response with status
503 is retried up to two more times after a 2 s wait; any other non-OK
status throws `MusicBrainz responded with HTTP <status>`.

- `searchByIswc(iswc): WorkHit[]` — `work/?fmt=json&limit=25&query=iswc:<digits>`
  where digits are the ISWC without `T`, `-`, and `.`. Hits are filtered
  to those whose `iswcs` array contains the normalized ISWC.
- `searchByTitle(title): WorkHit[]` — `work/?fmt=json&limit=25&query=work:"<escaped displayTitle>"`.
- `lookupWork(mbid): MbWork` — `work/<mbid>?fmt=json&inc=artist-rels+label-rels`.

```ts
interface WorkHit { mbid: string; title: string; type: string | null; iswcs: string[]; disambiguation: string | null; writers: string; }
interface MbWork {
  mbid: string; title: string; type: string | null;
  languages: string[]; iswcs: string[];
  attributes: { type: string; value: string }[];   // type is the display name, "JASRAC ID"
  relations: { linkTypeId: string; targetType: "artist" | "label"; name: string; sortName: string; attributes: string[] }[];
}
```

`writers` is the `relations` of a search hit joined as `name (type)`
for artist relations, used only for the picker.

`parseWorkRef(text): string | null` accepts a bare MBID or any
`musicbrainz.org/work/<mbid>` URL (with or without trailing path) and
returns the MBID.

## Diff for an existing work (`diff.ts`)

`diffWork(info: WorkInfo, seeds: SeedRel[], kind, mb: MbWork): WorkDiff`

```ts
interface WorkDiff {
  iswc: string | null;                 // add when not in mb.iswcs
  jasracCode: string | null;           // add when no attribute { type: "JASRAC ID", value } equal
  nextoneCode: string | null;          // same with "NexTone ID"
  typeId: number | null;               // 17 when kind is song and mb.type is null
  languageId: number | null;           // 486 when kind is instrumental and mb.languages is empty
  rels: SeedRel[];                     // seeds with no matching existing relation
  iswcIndex: number;                   // mb.iswcs.length
  attributeIndex: number;              // mb.attributes.length
}
```

An existing relation matches a seed when `linkTypeId` equals
`seed.linkType` and `targetName(name)` or `targetName(sortName)` equals
`seed.target` (case-insensitive). Attribute sets are not compared.

`isEmpty(diff)` is true when every field is null and `rels` is empty.

## URL builder (`seed.ts`)

`buildCreateUrl(info, seeds, kind, note): string` returns
`https://musicbrainz.org/work/create?` followed by URL-encoded pairs in
this order:

1. `edit-work.name=<displayTitle(info.title)>`
2. `edit-work.iswcs.0=<iswc>` when present
3. `edit-work.attributes.<i>.type_id=3` and `.value=<jasracCode>` when
   present; then the NexTone pair with `type_id=33`, index continuing
4. `edit-work.type_id=17` or `edit-work.languages.0=486` per `kind`
5. per seed rel, index n from 0: `rels.<n>.type=<linkType>`,
   `rels.<n>.target=<target>`, and `rels.<n>.attributes.<k>.type=<attr>`
   for each attribute
6. `edit-work.edit_note=<note>`

`buildEditUrl(mbid, diff, note): string` returns
`https://musicbrainz.org/work/<mbid>/edit?` with the same pairs built
from the diff: `edit-work.iswcs.<diff.iswcIndex>`, attributes from
`diff.attributeIndex`, type or language only when set in the diff, rels
from index 0, and the edit note. No name parameter is sent on edit.

The server derives the direction for artist-work and label-work seeds,
so no `backward` parameter is sent.

Encoding: `URLSearchParams` (spaces become `+`).

## Edit note (`note.ts`)

`buildEditNote(info, version, dropped: Set<"artists" | "titles" | "credits">): string`

```
<displayTitle> (JASRAC 703-4241-5 / NexTone N00913658 / ISWC T-102.054.195-9)

CREDITS
作詞：堀内　孝太（無信託）
作詞：堀内　孝平（無信託）
作曲：堀内　孝太（無信託）
作曲：堀内　孝平（無信託）
出版者：日本テレビ音楽　株式会社（JASRAC）
[NexTone] 作詞：かいりきベア
[NexTone] 出版社：株式会社 ドワンゴ 第七事業部

TITLES
正題：ＹＯＵＴＨＦＵＬ ／ YOUTHFUL
副題1：オープニング／ちはやふる（ＮＴＶ系アニメ） ／ チハヤフル ／ CHIHAYAFURU

PERFORMERS
９９ Ｒａｄｉｏ Ｓｅｒｖｉｃｅ

<sourceUrl>
JASRAC / MINC work to MusicBrainz v1.0.0
```

Rules:

- The header lists only the identifiers that exist, joined by ` / `.
- A credit line is `<role>：<name>` plus `（<trust>）` when trust exists,
  otherwise `（<society>）` when society exists. NexTone credits get the
  `[NexTone] ` prefix. Duplicate lines are written once.
- A title line joins title, kana, and romaji with ` ／ `, skipping nulls.
  Search names keep their `＊`.
- PERFORMERS lists at most 10 artists; when more exist the block ends
  with `… (<total>)`.
- A block whose key is in `dropped` is replaced by
  `<BLOCK> omitted, see source page`. CREDITS, TITLES, and PERFORMERS
  blocks are omitted when they would be empty.

## Length guard (`seed.ts`)

`fitUrl(build: (note: string) => string, info, version): { url: string; dropped: string[] }`
builds the URL with an empty `dropped` set; while `url.length > 8000`
it drops `artists`, then `titles`, then `credits`, rebuilding each time.
The result reports what was dropped so the panel can say so.

## Panel (`ui.ts`)

`enhancePage(doc, info, deps): HTMLElement` where

```ts
interface UiDeps {
  version: string;
  searchByIswc: (iswc: string) => Promise<WorkHit[]>;
  searchByTitle: (title: string) => Promise<WorkHit[]>;
  lookupWork: (mbid: string) => Promise<MbWork>;
  open: (url: string) => Window | null;
}
```

Placement: J-WID after `div.baseinfo`; minc before `#jasrac-area`.

Contents, top to bottom:

1. Heading `MusicBrainz` with the script version.
2. Summary: display title, codes, ISWC, work kind, and a table of
   mapped relationships (label, target, source roles), then a line
   listing skipped credits with the reason (`not mapped`, `rights
   holder`, `unknown publisher`).
3. Target row: a text input `MusicBrainz work URL or MBID`, a
   `Search by title` button, and the lookup status.
4. Picker: a radio list of `WorkHit`s (title, type, disambiguation,
   writers, ISWCs, link to the work) when a search returns hits. One
   ISWC hit is preselected; title hits are never preselected.
5. Diff block: when a target is selected, the panel shows `Will add:`
   with the ISWC, codes, type or language, and relationships from the
   diff, or `Nothing to add` when the diff is empty.
6. Actions: `Create work in MusicBrainz` (always enabled) and
   `Update "<title>"` (enabled only with a selected target and a
   non-empty diff). Both call `deps.open`. When `open` returns null the
   panel shows the URL as a link with the text `Popup blocked, open
   this link`. When the length guard dropped blocks, the panel shows
   `Edit note shortened: <blocks>`.

Behavior:

- On creation, when `info.iswc` exists, the panel runs `searchByIswc`
  and shows `Searching MusicBrainz by ISWC…`, then the picker or
  `No work with this ISWC`.
- `Search by title` runs `searchByTitle(displayTitle)` and replaces the
  picker; a search started while another is running is ignored.
- Typing a valid reference in the input clears the picker selection and
  selects that MBID; an invalid non-empty value shows `Not a MusicBrainz
  work URL or MBID`.
- Selecting a target runs `lookupWork` and shows `Loading work…`, then
  the diff block. A 404 shows `Work not found`. Other errors show the
  message and a `Retry` button.
- Every asynchronous result is discarded when the target changed while
  it was in flight.

## Error handling

- Parser returns null: no panel, one `console.warn` with the site name.
- No mappable credits: the panel still offers Create with name, codes,
  ISWC, and edit note.
- Network or non-OK responses: message plus `Retry`, as above.
- `window.open` blocked: link fallback, as above.

## Testing

Fixtures under `test/fixtures/`:

- J-WID: `jwid-70417750.html` (かるた日和, instrumental, artist list),
  `jwid-70342415.html` (ＹＯＵＴＨＦＵＬ, two lyricists and composers,
  one publisher), `jwid-15233952.html` (ＡＬＭＩＧＨＴＹ ＴＨＥ, no ISWC,
  not managed, 特記 note, no artist section), `jwid-15233812.html`
  (ＮＥＷ ＷＯＲＬＤ ＦＯＯＬ Ａ), `jwid-20356293.html` (ＤＡＺＺＬＩＮＧ
  ＳＭＩＬＥ, two subtitles, one search name, publisher without marker).
- minc: `minc-70342415.html` (JASRAC area only, empty NexTone area),
  `minc-25707965-N00913658.html` (both areas, paired NexTone rows).
- MusicBrainz: `mb-work-search-iswc.json`, `mb-work-search-title.json`,
  `mb-work-lookup.json` (a work with one lyricist, one composer, one
  ISWC, and a JASRAC ID attribute), captured from the live service.

Fixtures are captured from the live pages with the session-specific
parts (nonces, session ids, script tags) removed. Each fixture test
asserts the exact `WorkInfo` for that page.

Unit tests (vitest, jsdom):

- `parser.test.ts`: every fixture, plus missing ISWC, absent `#tab-def`
  fallback, absent artist section, empty NexTone area, NexTone pairing
  with unequal counts.
- `normalize.test.ts`: fold, moveArticle (`THE`, `A`, `AN`, no move for
  CJK or mid-title article), company markers at both ends, CJK space
  removal, Latin space kept, rights holder prefix.
- `mapping.test.ts`: every row of the role table, rights holder company
  and person, UNKNOWN PUBLISHER, dedupe across JASRAC and NexTone,
  workKind for song, instrumental, and unknown.
- `diff.test.ts`: each field added only when absent; relation matching
  by name and sort name; indexes continue after existing values.
- `seed.test.ts`: parameter order and encoding for create and edit; the
  length guard drops blocks in order and stops at 8000.
- `note.test.ts`: header variants, credit line forms, NexTone prefix,
  performer cap, omitted blocks.
- `musicbrainz.test.ts`: query strings, ISWC filtering, 503 retry, error
  text, `parseWorkRef`.
- `ui.test.ts`: panel placement on both fixtures, ISWC preselection,
  title picker, input override, diff display, disabled Update on empty
  diff, popup fallback, stale result discard.
- `main.test.ts`: poll adds one panel per page and never a second.
- `build.test.ts`: the built `dist` file starts with `header.txt` and
  contains the version.
