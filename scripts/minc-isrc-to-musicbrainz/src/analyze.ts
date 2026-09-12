import type { MincRelease } from "./types";

export interface Analysis {
  duplicateIsrcs: { isrc: string; where: string[] }[];
  tracksWithoutIsrc: { disc: number; track: number; title: string }[];
  submittableDiscs: number[];
}

export function analyze(release: MincRelease): Analysis {
  const seen = new Map<string, string[]>();
  const tracksWithoutIsrc: Analysis["tracksWithoutIsrc"] = [];
  const submittableDiscs: number[] = [];

  for (const disc of release.discs) {
    let count = 0;
    for (const track of disc.tracks) {
      if (track.isrc === null) {
        tracksWithoutIsrc.push({ disc: disc.position, track: track.position, title: track.title });
        continue;
      }
      count += 1;
      const where = seen.get(track.isrc) ?? [];
      where.push(`Disc ${disc.position} track ${track.position}`);
      seen.set(track.isrc, where);
    }
    if (count > 0) submittableDiscs.push(disc.position);
  }

  const duplicateIsrcs = Array.from(seen.entries())
    .filter(([, where]) => where.length > 1)
    .map(([isrc, where]) => ({ isrc, where }));

  return { duplicateIsrcs, tracksWithoutIsrc, submittableDiscs };
}
