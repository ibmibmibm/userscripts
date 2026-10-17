import { parseWords, type Word } from "../src/json3";
import { activeIndex, linesFor, MAX_WORDS, toSentences } from "../src/sentences";
import { track } from "./helpers";

function words(...items: [string, number, number][]): Word[] {
  return items.map(([text, startMs, endMs]) => ({ text, startMs, endMs }));
}

describe("toSentences", () => {
  it("keeps the start of the first word and the end of the last word", () => {
    expect(toSentences(parseWords(track("asr-en")))).toEqual([
      { text: "Today I'm speaking with a French mathematician Hugo Duminil-Copin, the", startMs: 3120, endMs: 8640 },
    ]);
  });

  it("ends a sentence at end punctuation and at a pause", () => {
    const out = toSentences(
      words(
        ["So", 0, 200], [" how?", 200, 400],
        [" I", 400, 600], [" was", 600, 800],
        [" doing", 2000, 2300], [" physics.»", 2300, 2600],
        ["「はい。」", 2600, 3000], ["次", 3000, 3200],
      ),
    );
    expect(out.map((s) => s.text)).toEqual(["So how?", "I was", "doing physics.»", "「はい。」", "次"]);
    expect(out[1]).toEqual({ text: "I was", startMs: 400, endMs: 800 });
  });

  it("ends a sentence after MAX_WORDS words", () => {
    const many = Array.from({ length: MAX_WORDS + 3 }, (_, i): Word => ({ text: ` w${i}`, startMs: i * 100, endMs: i * 100 + 100 }));
    const out = toSentences(many);
    expect(out.length).toBe(2);
    expect(out[0].text.split(" ").length).toBe(MAX_WORDS);
    expect(out[1].startMs).toBe(MAX_WORDS * 100);
  });
});

describe("activeIndex", () => {
  const sentences = [
    { text: "a", startMs: 1000, endMs: 2000 },
    { text: "b", startMs: 2000, endMs: 3000 },
    { text: "c", startMs: 5000, endMs: 6000 },
  ];

  it("finds the sentence on screen", () => {
    expect(activeIndex(sentences, 1000)).toBe(0);
    expect(activeIndex(sentences, 1999)).toBe(0);
    expect(activeIndex(sentences, 2000)).toBe(1);
    expect(activeIndex(sentences, 5500)).toBe(2);
  });

  it("returns -1 before, between, and after the sentences", () => {
    expect(activeIndex(sentences, 0)).toBe(-1);
    expect(activeIndex(sentences, 4000)).toBe(-1);
    expect(activeIndex(sentences, 6000)).toBe(-1);
    expect(activeIndex([], 0)).toBe(-1);
  });
});

describe("linesFor", () => {
  const s = { text: "So how?", startMs: 0, endMs: 1 };
  it("shows the original alone until the translation arrives", () => {
    expect(linesFor(undefined, true)).toEqual({ main: null, original: "" });
    expect(linesFor(s, true)).toEqual({ main: "So how?", original: "" });
    expect(linesFor({ ...s, translation: "那怎麼樣？" }, true)).toEqual({ main: "那怎麼樣？", original: "So how?" });
    expect(linesFor({ ...s, translation: "那怎麼樣？" }, false)).toEqual({ main: "那怎麼樣？", original: "" });
  });
});
