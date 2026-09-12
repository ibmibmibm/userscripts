import { fold, isCompany, RIGHTS_HOLDER, stripRightsHolder, targetName } from "./normalize";
import type { Credit } from "./types";

export const LINK = {
  lyricist: "3e48faba-ec01-47fd-8e89-30e81161661c",
  translator: "da6c5d8a-ce13-474d-9375-61feb29039a5",
  composer: "d59d99ea-23d4-4a80-b066-edca32ee158f",
  writer: "a255bca1-b157-4518-9108-7b147dc3fc68",
  arranger: "d3fd781c-5894-47e2-8c12-86cc0e2c8d08",
  publishing: "05ee6f18-4517-342d-afdf-5897f64276e3",
} as const;

export const ATTR = {
  additional: "0a5341f8-3b1d-4f99-a0c6-26b7f4e42c7f",
  sub: "4521ce8e-3d24-4b64-9805-59df6f3a4740",
} as const;

export const WORK_ATTR = { jasrac: 3, nextone: 33 } as const;
export const WORK_TYPE_SONG = 17;
export const LANG_NO_LYRICS = 486;

export type TargetType = "artist" | "label";

export interface SeedRel {
  linkType: string;
  targetType: TargetType;
  target: string;
  attributes: string[];
  label: string;
  from: Credit[];
}

export type SkipReason = "not mapped" | "rights holder" | "unknown publisher";

export interface SkippedCredit {
  credit: Credit;
  reason: SkipReason;
}

interface RoleMap {
  linkType: string;
  targetType: TargetType;
  attributes: string[];
  label: string;
}

const PUBLISHER: RoleMap = { linkType: LINK.publishing, targetType: "label", attributes: [], label: "publisher" };

const ROLES: Record<string, RoleMap> = {
  作詞: { linkType: LINK.lyricist, targetType: "artist", attributes: [], label: "lyricist" },
  補詞: { linkType: LINK.lyricist, targetType: "artist", attributes: [ATTR.additional], label: "additional lyricist" },
  訳詞: { linkType: LINK.translator, targetType: "artist", attributes: [], label: "translator" },
  作曲: { linkType: LINK.composer, targetType: "artist", attributes: [], label: "composer" },
  編曲: { linkType: LINK.arranger, targetType: "artist", attributes: [], label: "arranger" },
  作曲作詞: { linkType: LINK.writer, targetType: "artist", attributes: [], label: "writer" },
  不明: { linkType: LINK.writer, targetType: "artist", attributes: [], label: "writer" },
  出版者: PUBLISHER,
  出版社: PUBLISHER,
  サブ出版: { linkType: LINK.publishing, targetType: "label", attributes: [ATTR.sub], label: "sub-publisher" },
};

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export function mapCredits(credits: Credit[]): { rels: SeedRel[]; skipped: SkippedCredit[] } {
  const rels: SeedRel[] = [];
  const skipped: SkippedCredit[] = [];
  for (const credit of credits) {
    let name = credit.name;
    let map: RoleMap | undefined;
    if (fold(name).toUpperCase() === "UNKNOWN PUBLISHER") {
      skipped.push({ credit, reason: "unknown publisher" });
      continue;
    }
    if (RIGHTS_HOLDER.test(name)) {
      name = stripRightsHolder(name);
      if (!isCompany(name)) {
        skipped.push({ credit, reason: "rights holder" });
        continue;
      }
      map = PUBLISHER;
    } else {
      map = ROLES[fold(credit.role)];
    }
    const target = map ? targetName(name) : "";
    if (!map || target.length === 0) {
      skipped.push({ credit, reason: "not mapped" });
      continue;
    }
    const existing = rels.find(
      (r) => r.linkType === map!.linkType && r.target === target && sameSet(r.attributes, map!.attributes),
    );
    if (existing) {
      existing.from.push(credit);
    } else {
      rels.push({ ...map, attributes: [...map.attributes], target, from: [credit] });
    }
  }
  return { rels, skipped };
}

export type WorkKind = "song" | "instrumental" | "unknown";

export function workKind(credits: Credit[]): WorkKind {
  const roles = credits.map((c) => fold(c.role));
  if (roles.some((r) => r.includes("詞"))) return "song";
  if (roles.some((r) => r === "不明")) return "unknown";
  if (roles.some((r) => r === "作曲" || r === "編曲")) return "instrumental";
  return "unknown";
}
