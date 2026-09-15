/**
 * Percent-encode a string as Shift_JIS bytes, for sites (kashinavi) that decode
 * their query string as Shift_JIS rather than UTF-8. Browsers cannot encode to
 * Shift_JIS directly (TextEncoder is UTF-8 only), so this builds a decode table
 * once, lazily, using TextDecoder("shift_jis") (available in both Node and
 * browsers) and inverts it.
 */

let table: Map<string, number[]> | null = null;

function buildTable(): Map<string, number[]> {
  const decoder = new TextDecoder("shift_jis");
  const map = new Map<string, number[]>();

  const setIfNew = (ch: string, bytes: number[]): void => {
    if (ch && ch !== "�" && !map.has(ch)) map.set(ch, bytes);
  };

  // ASCII, single byte.
  for (let b = 0x00; b <= 0x7f; b++) setIfNew(decoder.decode(new Uint8Array([b])), [b]);

  // Half-width kana, single byte.
  for (let b = 0xa1; b <= 0xdf; b++) setIfNew(decoder.decode(new Uint8Array([b])), [b]);

  // Two-byte pairs: lead 0x81-0x9F, 0xE0-0xFC; trail 0x40-0x7E, 0x80-0xFC.
  for (let lead = 0x81; lead <= 0xfc; lead++) {
    if (!((lead >= 0x81 && lead <= 0x9f) || (lead >= 0xe0 && lead <= 0xfc))) continue;
    for (let trail = 0x40; trail <= 0xfc; trail++) {
      if (!((trail >= 0x40 && trail <= 0x7e) || (trail >= 0x80 && trail <= 0xfc))) continue;
      const decoded = decoder.decode(new Uint8Array([lead, trail]));
      if (decoded.length !== 1 && decoded.length !== 2) continue;
      setIfNew(decoded, [lead, trail]);
    }
  }

  return map;
}

function toPercentByte(b: number): string {
  return `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
}

/** Percent-encode `value` as Shift_JIS bytes; unmappable characters become "?". */
export function shiftJisEncode(value: string): string {
  if (!table) table = buildTable();
  let out = "";
  for (const ch of value) {
    const bytes = table.get(ch) ?? [0x3f];
    for (const b of bytes) out += toPercentByte(b);
  }
  return out;
}
