const STRIP = /[\s　・･·,，、]/g;

/** NFKC, lower case, no whitespace, no name separators. */
export function fold(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(STRIP, "");
}

/** "畑亜貴 / 伊藤真澄" -> ["畑亜貴", "伊藤真澄"]. */
export function splitNames(s: string): string[] {
  return s
    .split(" / ")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

/** "Aki Hata" -> "Hata Aki"; null unless the name has exactly two parts. */
function swapped(s: string): string | null {
  const parts = s.normalize("NFKC").trim().split(/\s+/);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : null;
}

/** Folded equality, or equality after swapping family and given name. */
export function namesMatch(a: string, b: string): boolean {
  const fa = fold(a);
  const fb = fold(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const sa = swapped(a);
  const sb = swapped(b);
  return (sa !== null && fold(sa) === fb) || (sb !== null && fold(sb) === fa);
}

/** True when any name in a matches any name in b. */
export function namesOverlap(a: string, b: string): boolean {
  const bs = splitNames(b);
  return splitNames(a).some((x) => bs.some((y) => namesMatch(x, y)));
}

export function titlesMatch(a: string, b: string): boolean {
  const fa = fold(a);
  return fa.length > 0 && fa === fold(b);
}
