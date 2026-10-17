/**
 * Translates one batch of lines into the target language and returns one line for each input line.
 * Google Translate is the only one now. A Gemini translator can implement the same interface later.
 */
export interface Translator {
  translate(lines: string[], target: string): Promise<string[]>;
}

export const GOOGLE_URL = "https://translate.googleapis.com/translate_a/single";

/** The lines of a translate_a/single answer: the text of every answer[0][i][0], split on "\n". */
export function parseGoogleAnswer(json: string): string[] {
  const answer = JSON.parse(json) as unknown;
  if (!Array.isArray(answer) || !Array.isArray(answer[0])) throw new Error("Unexpected answer");
  const text = (answer[0] as unknown[]).map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : "")).join("");
  return text.replace(/\n$/, "").split("\n");
}

/** The free Google Translate endpoint. postForm POSTs a form and resolves the response text. */
export function googleTranslator(postForm: (url: string, form: Record<string, string>) => Promise<string>): Translator {
  return {
    async translate(lines, target) {
      const url = `${GOOGLE_URL}?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t`;
      return parseGoogleAnswer(await postForm(url, { q: lines.join("\n") }));
    },
  };
}

export const BATCH_LINES = 100;
export const BATCH_CHARS = 6000;

/** Split lines into batches of at most BATCH_LINES lines and about BATCH_CHARS characters. */
export function batches(lines: string[]): { start: number; lines: string[] }[] {
  const out: { start: number; lines: string[] }[] = [];
  let current: string[] = [];
  let chars = 0;
  let start = 0;
  lines.forEach((line, i) => {
    if (current.length > 0 && (current.length >= BATCH_LINES || chars + line.length > BATCH_CHARS)) {
      out.push({ start, lines: current });
      current = [];
      chars = 0;
      start = i;
    }
    current.push(line);
    chars += line.length + 1;
  });
  if (current.length > 0) out.push({ start, lines: current });
  return out;
}

/** Run a request, and run it again once when it fails. */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch {
    return await call();
  }
}

/**
 * Translate one batch. If the answer has a different number of lines, translate each half of the
 * batch again, down to single lines, so that one bad line costs few extra requests. Lines whose
 * request fails twice keep their original text.
 */
export async function translateBatch(lines: string[], target: string, translator: Translator): Promise<string[]> {
  let result: string[];
  try {
    result = await withRetry(() => translator.translate(lines, target));
  } catch {
    return lines.slice();
  }
  if (result.length === lines.length) return result.map((t) => t.trim());
  if (lines.length === 1) return [result.join(" ").trim()];
  const half = Math.ceil(lines.length / 2);
  const head = await translateBatch(lines.slice(0, half), target, translator);
  const tail = await translateBatch(lines.slice(half), target, translator);
  return [...head, ...tail];
}

/**
 * Translate every line in batches, in order. onBatch receives the first index and the translated
 * lines of each batch as it arrives. Stops early when cancelled() turns true.
 */
export async function translateAll(
  lines: string[],
  target: string,
  translator: Translator,
  onBatch: (start: number, translated: string[]) => void,
  cancelled: () => boolean = () => false,
): Promise<void> {
  for (const batch of batches(lines)) {
    if (cancelled()) return;
    const translated = await translateBatch(batch.lines, target, translator);
    if (cancelled()) return;
    onBatch(batch.start, translated);
  }
}
