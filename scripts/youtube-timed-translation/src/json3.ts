/** One spoken word (or one whole caption event on a manual track) with its time on the video timeline. */
export interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

interface Json3Seg {
  utf8?: string;
  tOffsetMs?: number;
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  aAppend?: number;
  segs?: Json3Seg[];
}

export interface Json3 {
  events?: Json3Event[];
}

/** The longest time a word of a word-timed track stays on, so that a silence after it shows as a pause. */
export const MAX_WORD_MS = 1200;

/** Scripts that write words with no space between them. */
const NO_SPACE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}　-〿＀-￯]/u;

/** True when two caption events need a space between them to keep their words apart. */
function needsSpace(before: string, after: string): boolean {
  if (!before || !after) return false;
  if (/\s$/.test(before) || /^\s/.test(after)) return false;
  return !NO_SPACE.test(before.slice(-1)) && !NO_SPACE.test(after[0]);
}

/**
 * The words of a json3 caption track in time order.
 * A word starts at tStartMs + tOffsetMs and ends where the next word starts, because the
 * auto-generated captions roll and their event durations overlap. It also ends with its event,
 * and a word of an event with word timing (several segs) ends MAX_WORD_MS after its start at the latest.
 * The window event (no segs) and the line breaks (aAppend "\n") carry no words. A manual track has
 * one seg for each event, so each event is one word.
 */
export function parseWords(track: Json3): Word[] {
  const raw: Word[] = [];
  let previous = "";
  for (const ev of track.events ?? []) {
    if (!ev.segs || ev.aAppend) continue;
    const start = ev.tStartMs ?? 0;
    const eventEnd = start + (ev.dDurationMs ?? 0);
    const timed = ev.segs.length > 1;
    let first = true;
    for (const seg of ev.segs) {
      let text = (seg.utf8 ?? "").replace(/\s+/g, " ");
      if (!text.trim()) continue;
      if (first && needsSpace(previous, text)) text = " " + text;
      first = false;
      previous = text;
      const wordStart = start + (seg.tOffsetMs ?? 0);
      raw.push({ text, startMs: wordStart, endMs: timed ? Math.min(eventEnd, wordStart + MAX_WORD_MS) : eventEnd });
    }
  }
  raw.sort((a, b) => a.startMs - b.startMs);
  return raw.map((w, i) => {
    const next = raw[i + 1];
    const endMs = next ? Math.min(next.startMs, w.endMs) : w.endMs;
    return { text: w.text, startMs: w.startMs, endMs: Math.max(endMs, w.startMs) };
  });
}
