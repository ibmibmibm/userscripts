import { MAX_WORD_MS, parseWords } from "../src/json3";
import { track } from "./helpers";

describe("parseWords", () => {
  it("reads the word timing of an auto-generated track", () => {
    const words = parseWords(track("asr-en"));
    expect(words.map((w) => w.text)).toEqual(["Today", " I'm", " speaking", " with", " a", " French", " mathematician", " Hugo", " Duminil-Copin,", " the"]);
    expect(words[0]).toEqual({ text: "Today", startMs: 3120, endMs: 3400 });
    // The last word of an event ends where the next event starts, not with its rolling event.
    expect(words[5]).toEqual({ text: " French", startMs: 4080, endMs: 4400 });
    expect(words[6].startMs).toBe(4400);
    // The last word of the track stays on for MAX_WORD_MS at most.
    expect(words[9]).toEqual({ text: " the", startMs: 7440, endMs: 7440 + MAX_WORD_MS });
  });

  it("treats each event of a manual track as one word and keeps its end", () => {
    const words = parseWords({
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "Hello\nthere" }] },
        { tStartMs: 5000, dDurationMs: 1500, segs: [{ utf8: "friend." }] },
      ],
    });
    expect(words).toEqual([
      { text: "Hello there", startMs: 1000, endMs: 3000 },
      { text: " friend.", startMs: 5000, endMs: 6500 },
    ]);
  });

  it("puts no space between events of a language written without spaces", () => {
    const words = parseWords({
      events: [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "今日は" }] },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "数学の話です。" }] },
      ],
    });
    expect(words.map((w) => w.text).join("")).toBe("今日は数学の話です。");
  });

  it("returns no words for a track with no events", () => {
    expect(parseWords({})).toEqual([]);
  });
});
