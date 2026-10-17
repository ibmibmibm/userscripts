import { BATCH_CHARS, BATCH_LINES, batches, googleTranslator, parseGoogleAnswer, translateAll, translateBatch, type Translator } from "../src/translate";

describe("parseGoogleAnswer", () => {
  it("joins the parts and splits them into lines", () => {
    const answer = JSON.stringify([
      [
        ["那你是如何進入數學領域的呢？\n", "So how did you get into mathematics?\n", null, null, 10],
        ["我一開始是做物理的，然後我意識到我更喜歡證明。", "I was doing physics at first and then I realized I liked the proofs more.", null, null, 10],
      ],
      null,
      "en",
    ]);
    expect(parseGoogleAnswer(answer)).toEqual(["那你是如何進入數學領域的呢？", "我一開始是做物理的，然後我意識到我更喜歡證明。"]);
  });

  it("rejects an answer of another shape", () => {
    expect(() => parseGoogleAnswer("{}")).toThrow("Unexpected answer");
  });
});

describe("googleTranslator", () => {
  it("posts the lines joined with newlines to the target language", async () => {
    const calls: [string, Record<string, string>][] = [];
    const t = googleTranslator(async (url, form) => {
      calls.push([url, form]);
      return JSON.stringify([[["一\n二", "one\ntwo"]]]);
    });
    await expect(t.translate(["one", "two"], "zh-TW")).resolves.toEqual(["一", "二"]);
    expect(calls).toEqual([["https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-TW&dt=t", { q: "one\ntwo" }]]);
  });
});

describe("batches", () => {
  it("cuts at BATCH_LINES lines and at about BATCH_CHARS characters", () => {
    const short = Array.from({ length: BATCH_LINES * 2 + 5 }, (_, i) => `line ${i}`);
    expect(batches(short).map((b) => [b.start, b.lines.length])).toEqual([[0, BATCH_LINES], [BATCH_LINES, BATCH_LINES], [BATCH_LINES * 2, 5]]);
    const long = Array.from({ length: 5 }, () => "x".repeat(BATCH_CHARS / 2));
    expect(batches(long).map((b) => b.lines.length)).toEqual([1, 1, 1, 1, 1]);
    expect(batches([])).toEqual([]);
  });
});

function fake(answer: (lines: string[]) => string[] | Error): Translator & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async translate(lines) {
      calls.push(lines);
      const r = answer(lines);
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

describe("translateBatch", () => {
  it("returns the translated lines", async () => {
    const t = fake((lines) => lines.map((l) => ` <${l}> `));
    await expect(translateBatch(["a", "b"], "ja", t)).resolves.toEqual(["<a>", "<b>"]);
  });

  it("translates each half again when the line count differs", async () => {
    const t = fake((lines) => (lines.length > 1 ? ["merged"] : [`<${lines[0]}>`]));
    await expect(translateBatch(["a", "b"], "ja", t)).resolves.toEqual(["<a>", "<b>"]);
    expect(t.calls).toEqual([["a", "b"], ["a"], ["b"]]);
  });

  it("goes down to single lines only in the half with the bad line", async () => {
    const t = fake((lines) => (lines.includes("c") && lines.length > 1 ? ["merged"] : lines.map((l) => `<${l}>`)));
    await expect(translateBatch(["a", "b", "c", "d"], "ja", t)).resolves.toEqual(["<a>", "<b>", "<c>", "<d>"]);
    expect(t.calls).toEqual([["a", "b", "c", "d"], ["a", "b"], ["c", "d"], ["c"], ["d"]]);
  });

  it("tries a failed batch once more, then keeps the original text", async () => {
    let n = 0;
    const flaky = fake((lines) => (n++ === 0 ? new Error("HTTP 429") : lines.map((l) => l.toUpperCase())));
    await expect(translateBatch(["a"], "ja", flaky)).resolves.toEqual(["A"]);
    const down = fake(() => new Error("Request failed"));
    await expect(translateBatch(["a", "b"], "ja", down)).resolves.toEqual(["a", "b"]);
    expect(down.calls.length).toBe(2);
  });
});

describe("translateAll", () => {
  it("reports each batch with its first index and stops when cancelled", async () => {
    const lines = Array.from({ length: BATCH_LINES + 1 }, (_, i) => `${i}`);
    const seen: [number, number][] = [];
    await translateAll(lines, "ja", fake((l) => l), (start, t) => seen.push([start, t.length]));
    expect(seen).toEqual([[0, BATCH_LINES], [BATCH_LINES, 1]]);
    const none: number[] = [];
    await translateAll(lines, "ja", fake((l) => l), (start) => none.push(start), () => true);
    expect(none).toEqual([]);
  });
});
