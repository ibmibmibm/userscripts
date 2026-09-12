import type { MbRelation, MbWork, WorkHit } from "./types";

const WS = "https://musicbrainz.org/ws/2/";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export class MbNotFound extends Error {
  constructor() {
    super("Work not found");
    this.name = "MbNotFound";
  }
}

export interface MbOptions {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Json = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function arr(v: unknown): Json[] {
  return Array.isArray(v) ? (v as Json[]) : [];
}

async function request(path: string, opts: MbOptions): Promise<unknown> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(WS + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (res.status === 503 && attempt < 2) {
      await sleep(2000);
      continue;
    }
    if (res.status === 404) throw new MbNotFound();
    if (!res.ok) throw new Error(`MusicBrainz responded with HTTP ${res.status}`);
    return res.json();
  }
}

function luceneQuote(s: string): string {
  return '"' + s.replace(/(["\\])/g, "\\$1") + '"';
}

export function iswcQuery(iswc: string): string {
  return `iswc:${luceneQuote(iswc)}`;
}

export function titleQuery(title: string): string {
  return `work:${luceneQuote(title)}`;
}

export function toWorkHit(json: unknown): WorkHit {
  const j = (json ?? {}) as Json;
  const writers = arr(j.relations)
    .filter((r) => r.artist)
    .map((r) => `${str((r.artist as Json).name) ?? ""} (${str(r.type) ?? ""})`)
    .join(", ");
  return {
    mbid: str(j.id) ?? "",
    title: str(j.title) ?? "",
    type: str(j.type),
    iswcs: arr(j.iswcs).map(String),
    disambiguation: str(j.disambiguation),
    writers,
  };
}

function toRelation(r: Json): MbRelation | null {
  const target = (r.artist ?? r.label) as Json | undefined;
  if (!target) return null;
  return {
    linkTypeId: str(r["type-id"]) ?? "",
    targetType: r.artist ? "artist" : "label",
    name: str(target.name) ?? "",
    sortName: str(target["sort-name"]) ?? "",
    attributes: arr(r.attributes).map(String),
  };
}

export function toMbWork(json: unknown): MbWork {
  const j = (json ?? {}) as Json;
  return {
    mbid: str(j.id) ?? "",
    title: str(j.title) ?? "",
    type: str(j.type),
    languages: arr(j.languages).map(String),
    iswcs: arr(j.iswcs).map(String),
    attributes: arr(j.attributes).map((a) => ({ type: str(a.type) ?? "", value: str(a.value) ?? "" })),
    relations: arr(j.relations)
      .map(toRelation)
      .filter((r): r is MbRelation => r !== null),
  };
}

async function search(query: string, opts: MbOptions): Promise<WorkHit[]> {
  const body = (await request(`work/?fmt=json&limit=25&query=${encodeURIComponent(query)}`, opts)) as Json;
  return arr(body.works).map(toWorkHit);
}

export async function searchByIswc(iswc: string, opts: MbOptions = {}): Promise<WorkHit[]> {
  const hits = await search(iswcQuery(iswc), opts);
  return hits.filter((h) => h.iswcs.includes(iswc));
}

export async function searchByTitle(title: string, opts: MbOptions = {}): Promise<WorkHit[]> {
  return search(titleQuery(title), opts);
}

export async function lookupWork(mbid: string, opts: MbOptions = {}): Promise<MbWork> {
  return toMbWork(await request(`work/${mbid}?fmt=json&inc=artist-rels+label-rels`, opts));
}

/** MBID from a bare MBID or a musicbrainz.org work URL, lower-cased; null otherwise. */
export function parseWorkRef(text: string): string | null {
  const t = text.trim();
  const bare = new RegExp(`^${UUID}$`, "i").exec(t);
  if (bare) return t.toLowerCase();
  const url = new RegExp(`musicbrainz\\.org/work/(${UUID})`, "i").exec(t);
  return url ? url[1].toLowerCase() : null;
}
