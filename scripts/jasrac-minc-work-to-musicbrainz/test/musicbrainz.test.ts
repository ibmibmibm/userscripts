import {
  iswcQuery,
  lookupWork,
  MbNotFound,
  parseWorkRef,
  searchByIswc,
  searchByTitle,
  titleQuery,
  toMbWork,
  toWorkHit,
} from "../src/musicbrainz";
import { LINK } from "../src/mapping";
import { mbJson } from "./helpers";

const LEMON = "d69ecd96-bb2c-461f-9762-29102d2b50a1";

function fakeFetch(responses: { status: number; body?: unknown }[]) {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const r = responses.shift() ?? { status: 500 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    } as Response;
  }) as typeof fetch;
  return { fetchFn, calls };
}

const noSleep = async () => {};

describe("queries", () => {
  it("quotes the formatted ISWC", () => {
    expect(iswcQuery("T-924.390.287-6")).toBe('iswc:"T-924.390.287-6"');
  });
  it("quotes and escapes the title", () => {
    expect(titleQuery('Say "Hi"')).toBe('work:"Say \\"Hi\\""');
  });
});

describe("toWorkHit", () => {
  it("reads the search fixture", () => {
    const hit = toWorkHit((mbJson("mb-work-search-iswc") as { works: unknown[] }).works[0]);
    expect(hit.mbid).toBe(LEMON);
    expect(hit.title).toBe("Lemon");
    expect(hit.type).toBe("Song");
    expect(hit.iswcs).toEqual(["T-924.390.287-6"]);
    expect(hit.writers).toContain("米津玄師 (composer)");
    expect(hit.writers).toContain("米津玄師 (lyricist)");
  });
});

describe("toMbWork", () => {
  it("reads the lookup fixture", () => {
    const w = toMbWork(mbJson("mb-work-lookup"));
    expect(w.mbid).toBe(LEMON);
    expect(w.title).toBe("Lemon");
    expect(w.type).toBe("Song");
    expect(w.languages).toEqual(["jpn"]);
    expect(w.iswcs).toEqual(["T-924.390.287-6"]);
    expect(w.attributes).toContainEqual({ type: "JASRAC ID", value: "720-5540-5" });
    expect(w.attributes.length).toBe(12);
    const lyr = w.relations.find((r) => r.linkTypeId === LINK.lyricist)!;
    expect(lyr).toEqual({ linkTypeId: LINK.lyricist, targetType: "artist", name: "米津玄師", sortName: "Yonezu, Kenshi", attributes: [] });
    expect(w.relations.filter((r) => r.linkTypeId === LINK.publishing).map((r) => r.name)).toEqual(["HORIPRO", "リイシューレコーズ", "日音"]);
  });
});

describe("searchByIswc", () => {
  it("requests the quoted ISWC and keeps only hits carrying it", async () => {
    const body = mbJson("mb-work-search-iswc");
    const { fetchFn, calls } = fakeFetch([{ status: 200, body }]);
    const hits = await searchByIswc("T-924.390.287-6", { fetchFn, sleep: noSleep });
    expect(calls[0]).toBe('https://musicbrainz.org/ws/2/work/?fmt=json&limit=25&query=iswc%3A%22T-924.390.287-6%22');
    expect(hits.map((h) => h.mbid)).toEqual([LEMON]);
    const none = await searchByIswc("T-000.000.000-0", { fetchFn: fakeFetch([{ status: 200, body }]).fetchFn, sleep: noSleep });
    expect(none).toEqual([]);
  });

  it("retries twice on 503 with a 2 s wait, then throws", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    const { fetchFn, calls } = fakeFetch([{ status: 503 }, { status: 503 }, { status: 200, body: mbJson("mb-work-search-iswc") }]);
    const hits = await searchByIswc("T-924.390.287-6", { fetchFn, sleep });
    expect(hits.length).toBe(1);
    expect(calls.length).toBe(3);
    expect(waits).toEqual([2000, 2000]);
    const bad = fakeFetch([{ status: 503 }, { status: 503 }, { status: 503 }]);
    await expect(searchByIswc("T-924.390.287-6", { fetchFn: bad.fetchFn, sleep })).rejects.toThrow("MusicBrainz responded with HTTP 503");
    expect(bad.calls.length).toBe(3);
  });
});

describe("searchByTitle", () => {
  it("requests the quoted title", async () => {
    const { fetchFn, calls } = fakeFetch([{ status: 200, body: mbJson("mb-work-search-title") }]);
    const hits = await searchByTitle("Lemon", { fetchFn, sleep: noSleep });
    expect(calls[0]).toBe("https://musicbrainz.org/ws/2/work/?fmt=json&limit=25&query=work%3A%22Lemon%22");
    expect(hits[0].title).toBe("Lemon");
  });
});

describe("lookupWork", () => {
  it("requests artist and label relations", async () => {
    const { fetchFn, calls } = fakeFetch([{ status: 200, body: mbJson("mb-work-lookup") }]);
    const w = await lookupWork(LEMON, { fetchFn, sleep: noSleep });
    expect(calls[0]).toBe(`https://musicbrainz.org/ws/2/work/${LEMON}?fmt=json&inc=artist-rels+label-rels`);
    expect(w.title).toBe("Lemon");
  });
  it("throws MbNotFound on 404 and a message on other errors", async () => {
    await expect(lookupWork(LEMON, { fetchFn: fakeFetch([{ status: 404 }]).fetchFn, sleep: noSleep })).rejects.toBeInstanceOf(MbNotFound);
    await expect(lookupWork(LEMON, { fetchFn: fakeFetch([{ status: 500 }]).fetchFn, sleep: noSleep })).rejects.toThrow("MusicBrainz responded with HTTP 500");
  });
});

describe("parseWorkRef", () => {
  it("accepts a bare MBID or a work URL", () => {
    expect(parseWorkRef(` ${LEMON} `)).toBe(LEMON);
    expect(parseWorkRef(`https://musicbrainz.org/work/${LEMON}`)).toBe(LEMON);
    expect(parseWorkRef(`https://beta.musicbrainz.org/work/${LEMON}/edit`)).toBe(LEMON);
    expect(parseWorkRef(LEMON.toUpperCase())).toBe(LEMON);
  });
  it("rejects other text", () => {
    expect(parseWorkRef("")).toBeNull();
    expect(parseWorkRef("Lemon")).toBeNull();
    expect(parseWorkRef(`https://musicbrainz.org/artist/${LEMON}`)).toBeNull();
  });
});
