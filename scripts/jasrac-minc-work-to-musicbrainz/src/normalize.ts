const CJK_CHAR = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;
const CJK_ONLY = /^[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿0-9 ]*$/;

/** NFKC, whitespace runs to one ASCII space, trimmed. */
export function fold(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * "ALMIGHTY  THE" -> "THE ALMIGHTY". J-WID marks a moved article with two
 * or more spaces (two U+3000 on the page). A single space is a real title
 * ("PLAN A"). Only for titles without CJK characters. The result is folded.
 */
export function moveArticle(s: string): string {
  const n = s.normalize("NFKC");
  if (CJK_CHAR.test(n)) return fold(n);
  const m = n.match(/^(.+?)\s{2,}(THE|A|AN)\s*$/i);
  return m ? fold(`${m[2]} ${m[1]}`) : fold(n);
}

export function displayTitle(title: string): string {
  return moveArticle(title);
}

const JP_MARKERS = ["株式会社", "(株)", "有限会社", "合同会社"];
const LATIN_MARKERS = ["Co., Ltd.", "Co.,Ltd.", "Inc.", "Inc", "Ltd.", "Ltd", "LLC", "Co."];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Position of a company marker in a folded name, or null. */
function findMarker(s: string): { start: number; end: number } | null {
  for (const m of JP_MARKERS) {
    if (s.startsWith(m)) return { start: 0, end: m.length };
    if (s.endsWith(m)) return { start: s.length - m.length, end: s.length };
  }
  for (const m of LATIN_MARKERS) {
    const tail = new RegExp(`[ ,]+${escapeRe(m)}$`, "i").exec(s);
    if (tail) return { start: tail.index, end: s.length };
    const head = new RegExp(`^${escapeRe(m)}[ ,]+`, "i").exec(s);
    if (head) return { start: 0, end: head[0].length };
  }
  return null;
}

export function isCompany(name: string): boolean {
  return findMarker(fold(name)) !== null;
}

export function stripCompany(name: string): string {
  const s = fold(name);
  const m = findMarker(s);
  if (!m) return s;
  return fold(`${s.slice(0, m.start)} ${s.slice(m.end)}`);
}

/** True when a folded string holds only CJK characters, digits, and spaces. */
export function isCjkOnly(s: string): boolean {
  return CJK_ONLY.test(s);
}

/** The name seeded as a relationship target. */
export function targetName(name: string): string {
  const s = stripCompany(name);
  return isCjkOnly(s) ? s.replace(/ /g, "") : s;
}

export const RIGHTS_HOLDER = /^権利者[\s　]*/;

export function stripRightsHolder(name: string): string {
  return name.replace(RIGHTS_HOLDER, "");
}
