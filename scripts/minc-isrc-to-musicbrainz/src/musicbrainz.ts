import type { MbMedium, MbReleaseHit, MincRelease } from "./types";

const WS = "https://musicbrainz.org/ws/2/release/";

export function catnoForQuery(catalogNumber: string): string {
  return catalogNumber.split("/")[0].trim();
}

function luceneQuote(s: string): string {
  return '"' + s.replace(/(["\\])/g, "\\$1") + '"';
}

export function buildQueries(release: MincRelease): string[] {
  const queries: string[] = [];
  if (release.barcode) queries.push(`barcode:${release.barcode}`);
  const catno = catnoForQuery(release.catalogNumber);
  if (catno.length > 0) queries.push(`catno:${luceneQuote(catno)}`);
  return queries;
}

type Json = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function toReleaseHit(json: unknown): MbReleaseHit {
  const j = (json ?? {}) as Json;
  const credits = Array.isArray(j["artist-credit"]) ? (j["artist-credit"] as Json[]) : [];
  const artist = credits.map((c) => `${str(c.name) ?? ""}${str(c.joinphrase) ?? ""}`).join("");
  const labelInfo = Array.isArray(j["label-info"]) ? (j["label-info"] as Json[]) : [];
  const catalogNumbers = labelInfo.map((li) => str(li["catalog-number"])).filter((c): c is string => c !== null);
  const mediaJson = Array.isArray(j.media) ? (j.media as Json[]) : [];
  const media: MbMedium[] = mediaJson.map((m, i) => ({
    position: typeof m.position === "number" ? m.position : i + 1,
    format: str(m.format),
    trackCount: typeof m["track-count"] === "number" ? (m["track-count"] as number) : 0,
  }));
  return {
    mbid: str(j.id) ?? "",
    title: str(j.title) ?? "",
    artist,
    date: str(j.date),
    country: str(j.country),
    catalogNumbers,
    barcode: str(j.barcode),
    media,
  };
}

async function runQuery(query: string, fetchFn: typeof fetch): Promise<MbReleaseHit[]> {
  const url = `${WS}?fmt=json&limit=25&query=${encodeURIComponent(query)}`;
  const res = await fetchFn(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`MusicBrainz responded with HTTP ${res.status}`);
  const body = (await res.json()) as Json;
  const releases = Array.isArray(body.releases) ? (body.releases as unknown[]) : [];
  return releases.map(toReleaseHit);
}

export async function searchReleases(release: MincRelease, fetchFn: typeof fetch = fetch): Promise<MbReleaseHit[]> {
  for (const query of buildQueries(release)) {
    let hits = await runQuery(query, fetchFn);
    if (query.startsWith("barcode:") && release.barcode) {
      hits = hits.filter((h) => h.barcode === release.barcode);
    }
    if (hits.length > 0) return hits;
  }
  return [];
}

export function mbSearchUrl(catalogNumber: string): string {
  const q = `catno:${luceneQuote(catnoForQuery(catalogNumber))}`;
  return `https://musicbrainz.org/search?type=release&method=advanced&query=${encodeURIComponent(q)}`;
}
