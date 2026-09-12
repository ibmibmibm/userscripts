import type { WorkDiff } from "./diff";
import { LANG_NO_LYRICS, WORK_ATTR, WORK_TYPE_SONG, type SeedRel, type WorkKind } from "./mapping";
import { displayTitle } from "./normalize";
import { buildEditNote, type NoteBlock } from "./note";
import type { WorkInfo } from "./types";

export const MAX_URL = 8000;
const MB = "https://musicbrainz.org";

function addAttribute(p: URLSearchParams, index: number, typeId: number, value: string): number {
  p.append(`edit-work.attributes.${index}.type_id`, String(typeId));
  p.append(`edit-work.attributes.${index}.value`, value);
  return index + 1;
}

function addRels(p: URLSearchParams, rels: SeedRel[]): void {
  rels.forEach((r, n) => {
    p.append(`rels.${n}.type`, r.linkType);
    p.append(`rels.${n}.target`, r.target);
    r.attributes.forEach((a, k) => p.append(`rels.${n}.attributes.${k}.type`, a));
  });
}

export function buildCreateUrl(info: WorkInfo, seeds: SeedRel[], kind: WorkKind, note: string): string {
  const p = new URLSearchParams();
  p.append("edit-work.name", displayTitle(info.title));
  if (info.iswc) p.append("edit-work.iswcs.0", info.iswc);
  let i = 0;
  if (info.jasracCode) i = addAttribute(p, i, WORK_ATTR.jasrac, info.jasracCode);
  if (info.nextoneCode) i = addAttribute(p, i, WORK_ATTR.nextone, info.nextoneCode);
  if (kind === "song") p.append("edit-work.type_id", String(WORK_TYPE_SONG));
  if (kind === "instrumental") p.append("edit-work.languages.0", String(LANG_NO_LYRICS));
  addRels(p, seeds);
  p.append("edit-work.edit_note", note);
  return `${MB}/work/create?${p.toString()}`;
}

export function buildEditUrl(mbid: string, diff: WorkDiff, note: string): string {
  const p = new URLSearchParams();
  if (diff.iswc) p.append(`edit-work.iswcs.${diff.iswcIndex}`, diff.iswc);
  let i = diff.attributeIndex;
  if (diff.jasracCode) i = addAttribute(p, i, WORK_ATTR.jasrac, diff.jasracCode);
  if (diff.nextoneCode) i = addAttribute(p, i, WORK_ATTR.nextone, diff.nextoneCode);
  if (diff.typeId !== null) p.append("edit-work.type_id", String(diff.typeId));
  if (diff.languageId !== null) p.append("edit-work.languages.0", String(diff.languageId));
  addRels(p, diff.rels);
  p.append("edit-work.edit_note", note);
  return `${MB}/work/${mbid}/edit?${p.toString()}`;
}

const DROP_ORDER: NoteBlock[] = ["artists", "titles", "credits"];

/** Builds the URL with the fullest edit note that keeps it within MAX_URL. */
export function fitUrl(
  build: (note: string) => string,
  info: WorkInfo,
  version: string,
): { url: string; dropped: NoteBlock[] } {
  const dropped: NoteBlock[] = [];
  let url = build(buildEditNote(info, version, new Set(dropped)));
  for (const block of DROP_ORDER) {
    if (url.length <= MAX_URL) break;
    dropped.push(block);
    url = build(buildEditNote(info, version, new Set(dropped)));
  }
  return { url, dropped };
}
