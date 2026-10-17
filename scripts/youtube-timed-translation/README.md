# YouTube timed translation

A userscript for YouTube watch pages. YouTube's auto-translated subtitles cut and merge the original captions in a
different way, so the translated lines show at the wrong moments. This script reads the word timing of the caption
track that the player loads, joins the words into sentences, translates each sentence, and shows the translation from
the first word of the sentence to its last word.

## Install

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Open https://github.com/ibmibmibm/userscripts/raw/main/dist/youtube-timed-translation.user.js and accept the install.
   Allow the cross-origin requests to `translate.googleapis.com` when the manager asks.

## Use

1. Open a video. If the player does not load captions within 3 seconds, the script presses the CC button. Choose the
   caption track with the CC menu as usual. The script translates the track that the player loads, so the subtitles
   follow the audio track that you hear. A YouTube translation chosen in the CC menu is ignored, because the script
   loads the original language.
2. The translation shows at the bottom of the player, with the original sentence in smaller text below it. Until the
   translation of a sentence arrives, the original sentence shows alone. YouTube's own caption box is hidden while the
   script shows its box.
3. To change the configuration, click the translate button in the player's control bar, next to the settings
   button. The userscript manager menu item "Timed translation configuration" opens the same panel. Each change
   applies at once and stays for the next visit.
   - Translation: turns the script on or off. The button is dimmed while the script is off.
   - Original line: shows or hides the original sentence.
   - Language: the target language. The default is `zh-TW`. Choose "Other…" to type any Google Translate language
     code, for example `uk` or `pt-BR`.
   - Font: the font of the subtitles. Choose "Other…" to type the name of any font installed on your computer.
   - Text size: from 50% to 200% of the normal size. "Reset font" sets the default font and 100%.

   Press Escape or click outside the panel to close it.

## How it works

The script runs on every `www.youtube.com` page, because YouTube moves between pages without a page load, and acts on
`/watch` pages only. It follows `yt-navigate-finish` and resets its state for each video ID.

YouTube answers a plain request for a caption track with an empty body, because the request needs a proof token
(`pot`). The player's own request carries the token, so the script watches the timedtext requests with a
`PerformanceObserver` and fetches the player's URL again with `fmt=json3` and without `tlang`. A request whose `v`
parameter is not the current video, for example the captions of an ad, is ignored.

A word starts at `tStartMs + tOffsetMs` and ends at the start of the next word, or 1.2 s after its own start at the
latest. A sentence ends at end punctuation, at a silence longer than 0.8 s, or at 20 words. A manual track has no word
timing, so each caption event counts as one word.

The sentences go to the free Google Translate endpoint in batches of up to 100 lines, one sentence for each line. If
an answer has a different number of lines, each sentence of that batch is translated alone. A failed request is tried
again once, then the original text stays. The translations stay in memory for each video, track, and target language
until the page reloads. The translation step sits behind the `Translator` interface in `src/translate.ts`, so another
translator (Gemini, for example) can replace it.

The page enforces Trusted Types, so the script builds its box with `createElement` and `textContent`.

## Develop

Run `npm test` and `node build.mjs youtube-timed-translation` from the repository root. The fixture
`test/fixtures/asr-en.json` holds the first events of the English track of video `omuJpoV-Ko4`, captured on
2026-10-17. Bump `@version` in `header.txt` before a release.
