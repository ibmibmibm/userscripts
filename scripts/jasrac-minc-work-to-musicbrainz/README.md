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
