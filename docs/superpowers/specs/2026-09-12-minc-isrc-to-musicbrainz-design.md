# minc-isrc-to-musicbrainz userscript design

Date: 2026-09-12

## Goal

A userscript that adds a button to the CD product detail modal on
minc.or.jp (音楽権利情報検索ナビ). The button reads all ISRCs in the
modal, finds the matching MusicBrainz release, and opens MagicISRC with
every ISRC prefilled so the user can submit them to MusicBrainz.

## Non-goals

- No direct calls to the MusicBrainz submission API. MagicISRC handles
  login, preview, and submit.
- No support for minc pages other than the two list pages below.
- No automatic submit. The user always reviews in MagicISRC.

## Delivery

- Source in TypeScript under `src/`.
- esbuild bundles `src/main.ts` into one file,
  `dist/minc-isrc-to-musicbrainz.user.js`, and prepends the userscript
  header from `src/header.txt`.
- The shipped artifact is that single `.user.js` file.
- Tests run with vitest and jsdom. `package.json` exists only for the
  build and the tests.

## Userscript header

```
// @name         MINC ISRC to MusicBrainz
// @namespace    https://github.com/ibmibmibm/minc-userscript
// @version      1.0.0
// @description  Submit ISRCs from MINC (音楽権利情報検索ナビ) CD product details to MusicBrainz through MagicISRC
// @match        https://www.minc.or.jp/product/list*
// @match        https://www.minc.or.jp/music/list*
// @grant        none
// @run-at       document-end
```

`@grant none` is enough. The MusicBrainz web service sends CORS headers,
so plain `fetch` works from the minc page.

## Pages and trigger

Both `/product/list/` and `/music/list/` open the same Bootstrap modal
when the user clicks a CD title link (`a.collapseDetail`). The modal
body is loaded by AJAX after the click.

The script polls every 1000 ms with `setInterval`. On each tick it looks
for `.modal.in .modal-body` elements that contain `.detail_data` and at
least one `table.cd-detail2-track-list` and do not carry the marker
class `minc-isrc-mb`. For each such body it adds the marker class and
inserts the UI block (see below) at the end of `.detail_data`.

If the body has no `.detail_data` or no track table, the script does
nothing for that modal and writes one `console.debug` line.

## Modal structure (observed 2026-09-12)

```
.modal.in
  .modal-dialog.large
    .modal-content
      .modal-header  h4.modal-title        "YOUTHFUL"
      .modal-body
        .detail_data
          div "品番：VPCC-82301"
          div "発売日：2011/11/30"
          div "POS：4988021823012"        (can be empty: "POS：")
          div "セット数：1"
          div "収録曲数：3"
        .table_wrapper                    (one per disc)
          .disk_data                      (absent for single-disc modals)
            "[Disc1] 形態：ＣＤ１２cm カタログ番号：TFCC 86851 収録曲数：14 ..."
          a[data-toggle=collapse]
          .collapse                       (may be collapsed; DOM is complete)
            table.cd-detail2-track-list
              tr.header  th...
              tr  td[data-th="曲順"] td[data-th="曲名"] td[data-th="ISRC"] ...
      .modal-footer
```

Observed format strings in `.disk_data` (full-width): `ＣＤ１２cm`,
`ＤＶＤ１２cm`, `Ｂｌｕ－ｒａｙＤｉｓｃ Ｖｉｄｅｏ`.

ISRC cells hold a valid code, `-`, or blank. DVD and Blu-ray discs can
carry video ISRCs (for example `JPU981201583`) or `-`.

## Data model

```ts
interface MincTrack {
  position: number;      // from 曲順
  title: string;         // from 曲名
  isrc: string | null;   // null when "-", blank, or not a valid ISRC
}

interface MincDisc {
  position: number;      // 1-based, in .table_wrapper order
  format: string;        // NFKC-normalized 形態 text, "CD" when unknown
  kind: "audio" | "video";
  catalogNumber: string | null;  // from カタログ番号
  tracks: MincTrack[];
}

interface MincRelease {
  title: string;
  catalogNumber: string;         // 品番
  barcode: string | null;        // POS, null when empty
  discCount: number | null;      // セット数
  trackCount: number | null;     // 収録曲数
  discs: MincDisc[];
}

interface MbMedium { position: number; format: string | null; trackCount: number; }

interface MbReleaseHit {
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

## Parser

`parseProductModal(modalBody: Element): MincRelease | null`

- Title: text of the closest `.modal-title`, trimmed.
- Header fields: read the text of `.detail_data`, collapse whitespace,
  then match `品番：\s*([^\s]+)`, `POS：\s*(\d*)`, `セット数：\s*(\d+)`,
  `収録曲数：\s*(\d+)`.
- Discs: each `.table_wrapper` in document order is one disc. Format
  comes from the NFKC normalized `.disk_data` text, the part after
  `形態：` and before `カタログ番号` or `収録曲数`, trimmed. The catalog
  number is the part after `カタログ番号：` and before `収録曲数`,
  trimmed. When `.disk_data` is absent the format is `CD` and the
  catalog number is null.
- Kind: `video` when the normalized format contains `DVD` or `Blu-ray`
  (case-insensitive), else `audio`.
- Tracks: each `tr` with a `td[data-th="曲順"]`. Position is that cell
  parsed as an integer. Title is `td[data-th="曲名"]` text trimmed. ISRC
  is `td[data-th="ISRC"]` text trimmed and upper-cased; it is kept only
  when it matches `/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/`, else `null`.
- Return `null` when `.detail_data` or the track table is missing.

## Analysis

`analyze(release: MincRelease): Analysis`

```ts
interface Analysis {
  duplicateIsrcs: { isrc: string; where: string[] }[]; // "Disc 2 track 5"
  tracksWithoutIsrc: { disc: number; track: number; title: string }[];
  submittableDiscs: number[];   // disc positions with >= 1 ISRC
}
```

Duplicates are a warning. Tracks without ISRC are information only.
A release with no submittable disc disables the button with the text
"No ISRC in this product".

## MusicBrainz lookup

`searchReleases(release: MincRelease): Promise<MbReleaseHit[]>`

- Endpoint: `https://musicbrainz.org/ws/2/release/?fmt=json&limit=25&query=<q>`.
- Query order:
  1. `barcode:<POS>` when `barcode` is not null.
  2. `catno:"<品番>"` when step 1 is skipped or returns zero hits.
- Header `Accept: application/json`. The browser sets the User-Agent;
  the script cannot override it with `@grant none`.
- Each hit maps to `MbReleaseHit`. `artist` joins `artist-credit` names.
  `catalogNumbers` come from `label-info[].catalog-number`. `media` comes
  from `media[]` with `position` (1-based index when absent), `format`,
  and `track-count`.
- Any non-2xx response or network error rejects with a message.

Release choice:

- Exactly one hit: use it.
- Several hits: show a picker list under the button. Each row shows
  title, artist, date, country, catalog numbers, media summary
  (for example `CD 13 + DVD-Video 11`), and a "Use this" button. A last
  row "No MBID, paste it in MagicISRC" continues without an MBID.
- Zero hits: show the "paste it in MagicISRC" row and a link to
  `https://musicbrainz.org/search?type=release&method=advanced&query=catno:"<品番>"`.

## Medium mapping

After a release is chosen (or the no-MBID path is taken) the UI shows
a mapping table with one row per minc disc:

| Include | minc disc | MusicBrainz medium |
|---|---|---|
| checkbox | `Disc 1 CD, 14 tracks` | select of MB media, prefilled |

- Include is checked by default for `audio` discs and unchecked for
  `video` discs. Discs with no ISRC show "skipped" and no checkbox.
- The select is prefilled with the MB medium at the same position. When
  the MB release has fewer media, the select is prefilled with the last
  medium and marked.
- A red mark and a tooltip appear when the MB medium track count differs
  from the minc disc track count, or when the kinds differ (MB format
  containing `DVD`, `Blu-ray`, `VHS`, or `Video` counts as video).
- Without an MBID there is no select; the minc disc position is used
  as the medium index.

Warnings from `analyze` and the mapping marks are shown below the
table. None of them block the "Open MagicISRC" button.

## MagicISRC URL

`buildMagicIsrcUrl(input): string`

```ts
interface MagicIsrcInput {
  mbid: string | null;
  editNote: string;
  entries: { medium: number; track: number; isrc: string }[];
}
```

- Base: `https://magicisrc.kepstin.ca/`.
- Parameters in this order: `musicbrainzid` (omitted when `mbid` is
  null), then `isrc<medium>-<track>` for each entry, then `edit-note`.
- `URLSearchParams` does the encoding.
- Entries come from included discs only, using the selected MB medium
  position and the minc track position.

Edit note text:

```
ISRCs from MINC (音楽権利情報検索ナビ) for 品番 <品番>, POS <POS or "none">
https://www.minc.or.jp/product/list/?dn=<encoded 品番>&type=search-form-diskno
via MINC ISRC to MusicBrainz v<version>
```

The link uses the catalog number search on the product list page so
the same note works from both minc pages.

The URL opens with `window.open(url, "_blank")`.

Verified 2026-09-12: a 123-ISRC URL of 3,063 characters loaded in
MagicISRC with every field prefilled. Length is not a concern.

## UI block

Inserted at the end of `.detail_data`, wrapped in
`div.minc-isrc-mb-ui`:

1. Button `Submit ISRCs to MusicBrainz` (Bootstrap `btn btn-primary btn-sm`).
2. Status line (`span`) for progress and errors.
3. Picker list (hidden until needed).
4. Mapping table plus warnings (hidden until a release is chosen).
5. Button `Open MagicISRC`.

Flow on click of button 1: parse, analyze, set status "Searching
MusicBrainz...", search, then either pick automatically or show the
picker, then show the mapping and warnings. Button 5 builds the URL and
opens it.

## Error handling

All errors go to the status line. No `alert`.

- MusicBrainz HTTP error or network failure: "MusicBrainz lookup failed
  (<status or message>). Try again." plus the "paste it in MagicISRC"
  row so the user can still continue.
- No submittable disc: button 1 disabled with reason.
- Parse failure: no UI, one `console.debug` line.

## Testing

Fixtures under `test/fixtures/` are saved modal bodies:

- `single-cd.html` (VPCC-82301: 1 CD, 3 tracks)
- `two-cd-dvd-duplicate.html` (TFCC-86851/3: 2 CD + DVD, duplicate ISRC on disc 1 tracks 4 and 5, DVD has `-`)
- `cd-bluray-video-isrc.html` (SECL-2001/2: CD + Blu-ray with video ISRCs)
- `thirteen-discs.html` (KIZC-101/13: 12 CD + DVD)
- `music-list-empty-pos.html` (/music/list modal, POS empty, all ISRC `-`)

Canned MusicBrainz search JSON under `test/fixtures/mb/` for one hit,
several hits, and zero hits.

Unit tests (vitest + jsdom) cover:

- `parseProductModal` on every fixture: counts, formats, kinds, null
  ISRCs, catalog numbers, barcode null.
- `analyze`: duplicates, tracks without ISRC, submittable discs.
- `toReleaseHit`: mapping of MusicBrainz JSON, missing fields.
- `buildQuery`: barcode first, catalog number fallback.
- `defaultMapping` and `mappingMarks`: position prefill, count and kind
  mismatch marks, fewer MB media.
- `buildMagicIsrcUrl`: parameter names, order, encoding, omitted MBID,
  included discs only.

The page glue (poll, insertion, click flow) is checked by hand in
Chrome on the five example products.

## File layout

```
dist/minc-isrc-to-musicbrainz.user.js   built output (committed)
src/header.txt                          userscript header
src/main.ts                             page glue
src/parser.ts
src/analyze.ts
src/musicbrainz.ts
src/mapping.ts
src/magicisrc.ts
src/ui.ts
test/*.test.ts
test/fixtures/*.html, test/fixtures/mb/*.json
build.mjs                               esbuild script
package.json, tsconfig.json
README.md
```
