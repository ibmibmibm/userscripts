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
   work's relationships and the artist from the work's recordings, through the MusicBrainz web service. If that lookup
   fails (the web service answers HTTP 503 when it is busy), click "Retry lookup".
2. Change any field and click "Search lyrics". Every site is searched by title. UtaTen and 歌詞ナビ also receive the
   artist, lyricist, and composer, and J-Lyric and プチリリ also receive the artist. A field that holds several names
   separated by " / " (a work with three artist credits, for example) goes to no site, because the sites join the words
   of a field with AND and find nothing. The field still ranks the results. To search for one of the names, delete
   the others.
3. Rows with more matching fields come first. Matching fields are bold. Click a row to open the page in a new tab.
4. Click "Add" to put the URL into the external links editor. MusicBrainz sets the relationship type to "lyrics page".
   Rows already in the editor show "added".
5. Review the links and submit on MusicBrainz.

## Develop

Run `npm test` and `node build.mjs musicbrainz-work-lyrics-search` from the repository root. Test fixtures under
`test/fixtures/` are fragments of real search result pages captured on 2026-09-15 and MusicBrainz web service responses.
Bump `@version` in `header.txt` before a release.

Each site is one module in `src/sites/`. 歌ネット answers a search with no hits with HTTP 404, which the module declares
as `emptyStatus`. 歌詞ナビ has no class names, so its module finds the result table by its header row, which sits below
a count row. 歌詞ナビ links a song as `/lyrics/<id>/`, but MusicBrainz accepts only the older
`song_view.html?<id>` form, which redirects to the new page, so the module offers that form. Delete the rewrite after
[STYLE-2855](https://tickets.metabrainz.org/browse/STYLE-2855) lands. When a site changes its page structure, its
status shows "No results parsed"; update that module's `parse` and its fixture.
