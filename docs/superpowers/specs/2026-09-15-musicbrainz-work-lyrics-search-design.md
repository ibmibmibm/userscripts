# MusicBrainz work lyrics search: design

Date: 2026-09-15

## Goal

Add a userscript that puts a lyrics search area on MusicBrainz work edit pages. The area searches
six Japanese lyrics sites inline, ranks the results against the work's title, artist, lyricist and
composer, and adds a chosen page to the work's external links as a "lyrics page" relationship.
Musixmatch gets a plain search link because its search needs a login and renders client side.

## Pages

The script runs on:

- `https://musicbrainz.org/work/<mbid>/edit`
- `https://musicbrainz.org/work/create`
- the same paths on `https://beta.musicbrainz.org`

## Panel

The script inserts a `fieldset` with the legend "Lyrics search" right after the "External links"
fieldset. The panel holds:

- four text inputs: title, artist, lyricist, composer
- a "Search lyrics" button
- a link "Search on Musixmatch" that opens
  `https://www.musixmatch.com/search?query=<title> <artist>` in a new tab
- one status line
- one result section per site, each with the site name, a status text, a Retry button when the
  request failed, and a list of result rows

All CSS classes start with `mb-lyrics-`.

## Prefill

On the edit page:

- title: the value of the work name input (`#id-edit-work.name`)
- lyricist and composer: from `GET /ws/2/work/<mbid>?inc=artist-rels&fmt=json`, the names of
  artists related with link type `lyricist` and `composer`
- artist: from `GET /ws/2/recording?work=<mbid>&inc=artist-credits&fmt=json&limit=100`, the
  distinct `artist-credit` names (the joined credit phrase per recording)

Several names in one field are joined with ` / `. The requests run once at startup, one after the
other, with the `User-Agent` and `Accept` headers the other scripts use. If a request fails, the
field stays empty and the status line reports it. On the create page only the title is filled.

Every field stays editable. A search reads the current values.

## Sites

Each site is a module with:

```ts
interface Site {
  id: string;            // "j-lyric"
  name: string;          // "J-Lyric"
  host: string;          // "j-lyric.net"
  buildUrl(q: Query): string;
  parse(doc: Document, baseUrl: string): Row[];
}
interface Query { title: string; artist: string; lyricist: string; composer: string }
interface Row { url: string; title: string; artist: string; lyricist: string; composer: string }
```

Empty query fields are left out of the request. Query strings for a filled field:

| Site | Request | Fields sent | Fields in result rows |
|---|---|---|---|
| j-lyric | `https://j-lyric.net/search.php?kt=<title>&ct=2&ka=<artist>&ca=2` | title, artist | title, artist |
| utaten | `https://utaten.com/search?title=&artist_name=&lyricist=&composer=` | all four | title, artist, lyricist, composer |
| uta-net | `https://www.uta-net.com/search/?target=songtitle&type=in&Keyword=<title>` | title | title, artist, lyricist, composer |
| kashinavi | `https://kashinavi.com/search.php?kyoku=&kashu=&sakushi=&sakkyoku=&start=1` | all four | title, artist |
| petitlyrics | `https://petitlyrics.com/search_lyrics?title=&artist=` | title, artist | title, artist |
| JOYSOUND | `https://www.joysound.com/web/search/song?keyword=<title>&match=1` | title | title, artist |

Selectors captured on 2026-09-15:

- j-lyric: `div.bdy` blocks, title in `p.mid a`, artist in `p.sml a` after `歌：`
- utaten: `table.searchResult tr`, title `.searchResult__title a`, artist
  `.searchResult__artist > p a`, writers in `.searchResult__lyricist p` (`作詞：` and `作曲：` with
  `.songWriters a`)
- uta-net: `table tbody tr`, cells in order: title (`.songlist-title` inside the first link),
  artist, lyricist, composer, arranger, opening line
- kashinavi: the result table whose header cells are `曲名`, `歌手名`, `歌い出し`, `ミニ情報`;
  row cells title link and artist
- petitlyrics: result table rows with title link, artist link and album
- JOYSOUND: `li` items in the song list, song link `/web/search/song/<id>` and artist link
  `/web/search/title/<id>`, verified against a captured fixture

Relative links are resolved against the site origin. A response that parses to zero rows sets the
site status to "No results parsed" when the response body looks like a page (over 1000 bytes) and
"No results" otherwise.

Requests go through `GM_xmlhttpRequest` with `@connect` for the six hosts and a 15 second timeout.
The six sites are fetched in parallel when the user clicks "Search lyrics". A second click while a
search runs is ignored.

## Ranking

Normalization of a value: Unicode NFKC, lower case, remove all whitespace including full-width
spaces, and remove the characters `・･·,，、`. Two names also match when one equals the other with
its two whitespace-separated parts swapped (family-given order versus given-family order).

A row's score is the number of fields among title, artist, lyricist and composer where the query
value and the row value are both non-empty and match after normalization. Multi-name query values
(joined with ` / `) match when any name matches. Rows are sorted by score descending, then by the
site's own order. Matched fields are shown in bold.

## Adding a link

Each row shows the site page as a link that opens in a new tab and an "Add" button. Rows whose URL
already appears in the external links editor (`#external-links-editor input[type=url]` values,
compared after trimming a trailing slash) are marked "added" and have no button.

"Add" writes the URL into the empty url input of the external links editor with the native
`HTMLInputElement` value setter and dispatches an `input` event. MusicBrainz then creates the link
row and picks the "lyrics page" type by itself (verified on 2026-09-15). The script waits up to one
second for a new url input holding the URL; on success the row is marked "added", otherwise the
status line says "Could not add, paste the URL by hand".

## Errors

- ws request failed: status line "MusicBrainz lookup failed: <message>", fields stay editable
- site request failed or timed out: site status "Request failed" with a Retry button
- site returned zero rows: "No results" or "No results parsed"
- the panel is not inserted when the "External links" fieldset is missing

## Code layout

`scripts/musicbrainz-work-lyrics-search/`:

- `header.txt`: `@match` lines above, `@grant GM_xmlhttpRequest`, six `@connect` lines,
  `@version 1.0.0`
- `src/main.ts`: page detection, mbid from the URL, dependency wiring
- `src/types.ts`: `Site`, `Query`, `Row`, `WorkInfo`, `ScoredRow`
- `src/normalize.ts`: `fold(value)`, `namesMatch(a, b)`, `splitNames(value)`
- `src/rank.ts`: `scoreRow(query, row)`, `rankRows(query, rows)`
- `src/musicbrainz.ts`: `mbidFromUrl(href)`, `lookupWorkPeople(mbid, fetchJson)`
- `src/sites/<id>.ts` and `src/sites/index.ts` (the six modules and the list)
- `src/fetch.ts`: `gmFetchDocument(url)` wrapper around `GM_xmlhttpRequest`
- `src/links.ts`: `existingLinks(doc)`, `addLink(doc, url): Promise<boolean>`
- `src/ui.ts`: `enhancePage(doc, info, deps)` with
  `UiDeps { version, sites, fetchDocument, lookupPeople, addLink, open }`
- `README.md`

The root README gets a row for the new script.

## Tests

vitest with jsdom:

- one fixture per site under `test/fixtures/` captured from a real search, with a parser test that
  checks the first rows and the field values
- `normalize.test.ts`: NFKC, spaces, name order swap
- `rank.test.ts`: scores and sort order
- `musicbrainz.test.ts`: mbid parsing and people extraction from saved ws JSON
- `links.test.ts`: existing link detection and `addLink` with a fake editor that reacts to
  `input`
- `ui.test.ts`: prefill, search with fake deps, ranking display, Retry, Add, "added" marking,
  create page without lookups
