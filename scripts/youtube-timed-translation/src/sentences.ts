import type { Word } from "./json3";

/** One sentence of the original track and, once it arrives, its translation. */
export interface Sentence {
  text: string;
  startMs: number;
  endMs: number;
  translation?: string;
}

/** A silence longer than this between two words ends a sentence. */
export const PAUSE_MS = 800;
/** A sentence ends after this many words even with no punctuation or pause. */
export const MAX_WORDS = 20;

/** End punctuation, then any closing quotes or brackets. */
const END = /[.!?。！？…‼⁇⁈⁉]["'”’»›)\]）」』】]*$/;

/**
 * Join words into sentences. A sentence ends at end punctuation, at a pause longer than PAUSE_MS,
 * or at MAX_WORDS words. It starts with its first word and ends with its last word.
 */
export function toSentences(words: Word[]): Sentence[] {
  const out: Sentence[] = [];
  let group: Word[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const text = group.map((w) => w.text).join("").replace(/\s+/g, " ").trim();
    if (text) out.push({ text, startMs: group[0].startMs, endMs: group[group.length - 1].endMs });
    group = [];
  };
  words.forEach((w, i) => {
    group.push(w);
    const next = words[i + 1];
    if (!next || END.test(w.text.trim()) || next.startMs - w.endMs > PAUSE_MS || group.length >= MAX_WORDS) flush();
  });
  return out;
}

/** The main line and the smaller original line for a sentence. Before its translation arrives, the original is the main line. */
export function linesFor(sentence: Sentence | undefined, showOriginal: boolean): { main: string | null; original: string } {
  if (!sentence) return { main: null, original: "" };
  if (sentence.translation === undefined) return { main: sentence.text, original: "" };
  return { main: sentence.translation, original: showOriginal ? sentence.text : "" };
}

/** The index of the sentence on screen at timeMs, or -1 between sentences. Sentences are in time order. */
export function activeIndex(sentences: Sentence[], timeMs: number): number {
  let lo = 0;
  let hi = sentences.length - 1;
  let found = -1;
  // The last sentence that starts at or before timeMs.
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sentences[mid].startMs <= timeMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 && timeMs < sentences[found].endMs ? found : -1;
}
