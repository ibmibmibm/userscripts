import type { Analysis } from "./analyze";
import type { DiscKind, MbReleaseHit, MincRelease } from "./types";

export interface DiscMapping {
  disc: number;
  included: boolean;
  medium: number;
}

export function isVideoFormat(format: string | null): boolean {
  return format !== null && /dvd|blu-?ray|vhs|video/i.test(format);
}

function mbKind(format: string | null): DiscKind {
  return isVideoFormat(format) ? "video" : "audio";
}

export function defaultMapping(release: MincRelease, analysis: Analysis, hit: MbReleaseHit | null): DiscMapping[] {
  const mediaCount = hit ? hit.media.length : 0;
  return analysis.submittableDiscs.map((discPos) => {
    const disc = release.discs.find((d) => d.position === discPos)!;
    let medium = discPos;
    if (hit) medium = mediaCount === 0 ? discPos : Math.min(discPos, mediaCount);
    return { disc: discPos, included: disc.kind === "audio", medium };
  });
}

export function mappingMarks(release: MincRelease, mapping: DiscMapping[], hit: MbReleaseHit | null): string[] {
  if (!hit) return [];
  const marks: string[] = [];
  const needed = mapping.length;
  if (hit.media.length < needed) {
    const plural = hit.media.length === 1 ? "medium" : "media";
    marks.push(`MusicBrainz release has ${hit.media.length} ${plural} but minc has ${needed} discs with ISRCs`);
  }
  for (const m of mapping) {
    if (!m.included) continue;
    const disc = release.discs.find((d) => d.position === m.disc)!;
    const medium = hit.media.find((x) => x.position === m.medium);
    if (!medium) continue;
    const problems: string[] = [];
    if (medium.trackCount !== disc.tracks.length) problems.push("track count differs");
    if (mbKind(medium.format) !== disc.kind) problems.push("kind differs");
    if (problems.length > 0) {
      marks.push(
        `Disc ${disc.position} (${disc.format}, ${disc.tracks.length} tracks) is mapped to medium ${medium.position} ` +
          `(${medium.format ?? "unknown format"}, ${medium.trackCount} tracks): ${problems.join(", ")}`,
      );
    }
  }
  return marks;
}
