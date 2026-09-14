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
