import { LANG_NO_LYRICS, WORK_TYPE_SONG, type SeedRel, type WorkKind } from "./mapping";
import { targetName } from "./normalize";
import type { MbWork, WorkInfo } from "./types";

export interface WorkDiff {
  iswc: string | null;
  jasracCode: string | null;
  nextoneCode: string | null;
  typeId: number | null;
  languageId: number | null;
  rels: SeedRel[];
  iswcIndex: number;
  attributeIndex: number;
}

function hasAttribute(mb: MbWork, type: string, value: string | null): boolean {
  return value !== null && mb.attributes.some((a) => a.type === type && a.value === value);
}

function hasRelation(mb: MbWork, seed: SeedRel): boolean {
  const want = seed.target.toLowerCase();
  return mb.relations.some(
    (r) =>
      r.linkTypeId === seed.linkType &&
      [targetName(r.name), targetName(r.sortName)].some((n) => n.toLowerCase() === want),
  );
}

export function diffWork(info: WorkInfo, seeds: SeedRel[], kind: WorkKind, mb: MbWork): WorkDiff {
  return {
    iswc: info.iswc !== null && !mb.iswcs.includes(info.iswc) ? info.iswc : null,
    jasracCode: info.jasracCode !== null && !hasAttribute(mb, "JASRAC ID", info.jasracCode) ? info.jasracCode : null,
    nextoneCode: info.nextoneCode !== null && !hasAttribute(mb, "NexTone ID", info.nextoneCode) ? info.nextoneCode : null,
    typeId: kind === "song" && mb.type === null ? WORK_TYPE_SONG : null,
    languageId: kind === "instrumental" && mb.languages.length === 0 ? LANG_NO_LYRICS : null,
    rels: seeds.filter((s) => !hasRelation(mb, s)),
    iswcIndex: mb.iswcs.length,
    attributeIndex: mb.attributes.length,
  };
}

export function isEmpty(diff: WorkDiff): boolean {
  return (
    diff.iswc === null &&
    diff.jasracCode === null &&
    diff.nextoneCode === null &&
    diff.typeId === null &&
    diff.languageId === null &&
    diff.rels.length === 0
  );
}
