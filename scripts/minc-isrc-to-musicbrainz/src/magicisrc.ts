import type { DiscMapping } from "./mapping";
import type { MincRelease } from "./types";

export interface MagicIsrcEntry {
  medium: number;
  track: number;
  isrc: string;
}

export function mincProductUrl(catalogNumber: string): string {
  return `https://www.minc.or.jp/product/list/?dn=${encodeURIComponent(catalogNumber)}&type=search-form-diskno`;
}

export function collectEntries(release: MincRelease, mapping: DiscMapping[]): MagicIsrcEntry[] {
  const entries: MagicIsrcEntry[] = [];
  for (const m of mapping) {
    if (!m.included) continue;
    const disc = release.discs.find((d) => d.position === m.disc);
    if (!disc) continue;
    for (const t of disc.tracks) {
      if (t.isrc !== null) entries.push({ medium: m.medium, track: t.position, isrc: t.isrc });
    }
  }
  return entries;
}

export function buildEditNote(release: MincRelease, version: string): string {
  return (
    `ISRCs from MINC (音楽権利情報検索ナビ) for 品番 ${release.catalogNumber}, POS ${release.barcode ?? "none"}\n` +
    `${mincProductUrl(release.catalogNumber)}\n` +
    `via MINC ISRC to MusicBrainz v${version}`
  );
}

export function buildMagicIsrcUrl(input: { mbid: string | null; editNote: string; entries: MagicIsrcEntry[] }): string {
  const params = new URLSearchParams();
  if (input.mbid) params.set("musicbrainzid", input.mbid);
  const seen = new Set<string>();
  for (const e of input.entries) {
    const key = `isrc${e.medium}-${e.track}`;
    if (seen.has(key)) throw new Error(`Duplicate ISRC slot ${key}`);
    seen.add(key);
    params.set(key, e.isrc);
  }
  params.set("edit-note", input.editNote);
  return `https://magicisrc.kepstin.ca/?${params.toString()}`;
}
