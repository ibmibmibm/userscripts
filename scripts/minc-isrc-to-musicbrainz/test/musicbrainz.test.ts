import { loadFixture, mbJson as mb } from "./helpers";
import { parseProductModal } from "../src/parser";
import { buildQueries, catnoForQuery, toReleaseHit, searchReleases, mbSearchUrl } from "../src/musicbrainz";

function fakeFetch(responses: Record<string, unknown>, status = 200): typeof fetch {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const q = new URL(url).searchParams.get("query") ?? "";
    const body = responses[q];
    if (body === undefined) throw new Error(`unexpected query: ${q}`);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  (fn as unknown as { calls: string[] }).calls = calls;
  return fn;
}

describe("catnoForQuery", () => {
  it("keeps the part before the slash", () => {
    expect(catnoForQuery("TFCC-86851/3")).toBe("TFCC-86851");
    expect(catnoForQuery("RRCX 21017")).toBe("RRCX 21017");
  });
});

describe("buildQueries", () => {
  it("uses barcode first, then catalog number", () => {
    const r = parseProductModal(loadFixture("two-cd-dvd"))!;
    expect(buildQueries(r)).toEqual(['barcode:4988061868516', 'catno:"TFCC-86851"']);
  });
  it("uses only catalog number when POS is empty", () => {
    const r = parseProductModal(loadFixture("music-list-empty-pos"))!;
    expect(buildQueries(r)).toEqual(['catno:"RRCX 21017"']);
  });
});

describe("toReleaseHit", () => {
  it("maps a full search result", () => {
    const hit = toReleaseHit(mb("barcode-two-cd-dvd").releases![0]);
    expect(hit).toEqual({
      mbid: hit.mbid,
      title: "Mr.Children 2011–2015",
      artist: "Mr.Children",
      date: "2022-05-10",
      country: "JP",
      catalogNumbers: ["TFCC-86853", "TFCC-86852", "TFCC-86851"],
      barcode: "4988061868516",
      media: [
        { position: 1, format: "CD", trackCount: 14 },
        { position: 2, format: "CD", trackCount: 13 },
        { position: 3, format: "DVD-Video", trackCount: 1 },
      ],
    });
    expect(hit.mbid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("tolerates missing fields", () => {
    const hit = toReleaseHit({ id: "x", title: "T" });
    expect(hit).toEqual({ mbid: "x", title: "T", artist: "", date: null, country: null, catalogNumbers: [], barcode: null, media: [] });
  });
});

describe("searchReleases", () => {
  it("returns the barcode hit and stops", async () => {
    const r = parseProductModal(loadFixture("single-cd"))!;
    const f = fakeFetch({ "barcode:4988021823012": mb("barcode-single-cd") });
    const hits = await searchReleases(r, f);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("YOUTHFUL");
    expect((f as unknown as { calls: string[] }).calls).toHaveLength(1);
  });

  it("drops barcode hits whose barcode differs", async () => {
    const r = parseProductModal(loadFixture("single-cd"))!;
    const f = fakeFetch({ "barcode:4988021823012": mb("barcode-none"), 'catno:"VPCC-82301"': mb("catno-rrcx-21017") });
    const hits = await searchReleases(r, f);
    expect(hits).toEqual([]);
    expect((f as unknown as { calls: string[] }).calls).toHaveLength(2);
  });

  it("falls back to catalog number and returns several hits", async () => {
    const r = parseProductModal(loadFixture("two-cd-dvd"))!;
    const f = fakeFetch({ "barcode:4988061868516": { releases: [] }, 'catno:"TFCC-86851"': mb("catno-multi") });
    const hits = await searchReleases(r, f);
    expect(hits).toHaveLength(2);
  });

  it("rejects on HTTP error", async () => {
    const r = parseProductModal(loadFixture("single-cd"))!;
    const f = fakeFetch({ "barcode:4988021823012": { error: "busy" } }, 503);
    await expect(searchReleases(r, f)).rejects.toThrow(/503/);
  });

  it("sends fmt=json, limit=25, and an Accept header", async () => {
    const r = parseProductModal(loadFixture("single-cd"))!;
    let seenInit: RequestInit | undefined;
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seenInit = init;
      const u = new URL(String(input));
      expect(u.origin + u.pathname).toBe("https://musicbrainz.org/ws/2/release/");
      expect(u.searchParams.get("fmt")).toBe("json");
      expect(u.searchParams.get("limit")).toBe("25");
      return new Response(JSON.stringify(mb("barcode-single-cd")), { status: 200 });
    }) as unknown as typeof fetch;
    await searchReleases(r, f);
    expect((seenInit?.headers as Record<string, string>)["Accept"]).toBe("application/json");
  });
});

describe("mbSearchUrl", () => {
  it("links to the advanced release search by catalog number", () => {
    expect(mbSearchUrl("TFCC-86851/3")).toBe(
      'https://musicbrainz.org/search?type=release&method=advanced&query=catno%3A%22TFCC-86851%22',
    );
  });
});
