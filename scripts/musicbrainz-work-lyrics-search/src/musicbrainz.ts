import type { WorkPeople } from "./types";

const WS = "https://musicbrainz.org/ws/2/";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EDIT_PATH = new RegExp(`^/work/(${UUID})/edit$`, "i");

type Json = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function arr(v: unknown): Json[] {
  return Array.isArray(v) ? (v as Json[]) : [];
}

/** Lower-cased MBID from a work edit URL, null for other pages. */
export function mbidFromUrl(href: string): string | null {
  let path: string;
  try {
    path = new URL(href).pathname;
  } catch {
    return null;
  }
  const m = EDIT_PATH.exec(path);
  return m ? m[1].toLowerCase() : null;
}

export type FetchJson = (url: string) => Promise<unknown>;

export interface FetchOptions {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** GET JSON from the web service; retries once after two seconds on 503. */
export async function fetchJson(url: string, opts: FetchOptions = {}): Promise<unknown> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (res.status === 503 && attempt < 1) {
      await sleep(2000);
      continue;
    }
    if (!res.ok) throw new Error(`MusicBrainz responded with HTTP ${res.status}`);
    return res.json();
  }
}

function unique(names: string[]): string[] {
  return names.filter((n, i) => n.length > 0 && names.indexOf(n) === i);
}

/** Names of related artists with link type "lyricist" and "composer", joined with " / ". */
export function peopleFromWork(json: unknown): { lyricist: string; composer: string } {
  const rels = arr((json as Json)?.relations);
  const names = (type: string) => unique(rels.filter((r) => str(r.type) === type && r.artist).map((r) => str((r.artist as Json).name))).join(" / ");
  return { lyricist: names("lyricist"), composer: names("composer") };
}

/** Distinct artist credit phrases of the recordings, joined with " / ". */
export function artistFromRecordings(json: unknown): string {
  const recordings = arr((json as Json)?.recordings);
  const phrases = recordings.map((rec) => arr(rec["artist-credit"]).map((c) => str(c.name) + str(c.joinphrase)).join(""));
  return unique(phrases).join(" / ");
}

export async function lookupWorkPeople(mbid: string, fetchJsonFn: FetchJson): Promise<WorkPeople> {
  const work = await fetchJsonFn(`${WS}work/${mbid}?inc=artist-rels&fmt=json`);
  const recordings = await fetchJsonFn(`${WS}recording?work=${mbid}&inc=artist-credits&fmt=json&limit=100`);
  return { artist: artistFromRecordings(recordings), ...peopleFromWork(work) };
}
