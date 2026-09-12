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
