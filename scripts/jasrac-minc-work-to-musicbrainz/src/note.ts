import { displayTitle } from "./normalize";
import type { WorkInfo } from "./types";

export type NoteBlock = "artists" | "titles" | "credits";
export const SCRIPT_NAME = "JASRAC / MINC work to MusicBrainz";
const MAX_PERFORMERS = 10;

function block(name: string, lines: string[], omitted: boolean): string[] {
  if (omitted) return [`${name} omitted, see source page`, ""];
  if (lines.length === 0) return [];
  return [name, ...lines, ""];
}

export function buildEditNote(info: WorkInfo, version: string, dropped: Set<NoteBlock> = new Set()): string {
  const ids: string[] = [];
  if (info.jasracCode) ids.push(`JASRAC ${info.jasracCode}`);
  if (info.nextoneCode) ids.push(`NexTone ${info.nextoneCode}`);
  if (info.iswc) ids.push(`ISWC ${info.iswc}`);
  const header = ids.length > 0 ? `${displayTitle(info.title)} (${ids.join(" / ")})` : displayTitle(info.title);

  const creditLines: string[] = [];
  for (const c of info.credits) {
    const prefix = c.source === "NexTone" ? "[NexTone] " : "";
    const paren = c.trust ?? c.society;
    const line = `${prefix}${c.role}：${c.name}${paren ? `（${paren}）` : ""}`;
    if (!creditLines.includes(line)) creditLines.push(line);
  }
  const titleLines = info.titles.map((t) => `${t.kind}：${[t.title, t.kana, t.romaji].filter((s) => s !== null).join(" ／ ")}`);
  const performerLines = info.artists.slice(0, MAX_PERFORMERS);
  if (info.artists.length > MAX_PERFORMERS) performerLines.push(`… (${info.artists.length})`);

  return [
    header,
    "",
    ...block("CREDITS", creditLines, dropped.has("credits")),
    ...block("TITLES", titleLines, dropped.has("titles")),
    ...block("PERFORMERS", performerLines, dropped.has("artists")),
    info.sourceUrl,
    `${SCRIPT_NAME} v${version}`,
  ].join("\n");
}
