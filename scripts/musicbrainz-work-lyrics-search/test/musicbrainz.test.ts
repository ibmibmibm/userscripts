import { artistFromRecordings, fetchJson, lookupWorkPeople, mbidFromUrl, peopleFromWork } from "../src/musicbrainz";
import { mbJson } from "./helpers";

const MBID = "d2364f4b-3c9a-4698-af3e-0ec10eb52cf8";

describe("mbidFromUrl", () => {
  it("reads the MBID from a work edit URL", () => {
    expect(mbidFromUrl(`https://musicbrainz.org/work/${MBID}/edit`)).toBe(MBID);
    expect(mbidFromUrl(`https://beta.musicbrainz.org/work/${MBID.toUpperCase()}/edit?returnto=1`)).toBe(MBID);
    expect(mbidFromUrl("https://musicbrainz.org/work/create")).toBeNull();
    expect(mbidFromUrl(`https://musicbrainz.org/work/${MBID}`)).toBeNull();
  });
});

describe("peopleFromWork", () => {
  it("joins lyricist and composer names from artist relations", () => {
    expect(peopleFromWork(mbJson("mb-work-artist-rels"))).toEqual({ lyricist: "畑亜貴", composer: "伊藤真澄" });
  });

  it("deduplicates names and ignores other relation types", () => {
    const json = {
      relations: [
        { type: "lyricist", artist: { name: "A" } },
        { type: "lyricist", artist: { name: "A" } },
        { type: "lyricist", artist: { name: "B" } },
        { type: "composer", artist: { name: "B" } },
        { type: "publisher", label: { name: "L" } },
      ],
    };
    expect(peopleFromWork(json)).toEqual({ lyricist: "A / B", composer: "B" });
    expect(peopleFromWork({})).toEqual({ lyricist: "", composer: "" });
  });
});

describe("artistFromRecordings", () => {
  it("joins the distinct artist credit phrases", () => {
    expect(artistFromRecordings(mbJson("mb-recordings-by-work"))).toBe("結城アイラ");
    const json = {
      recordings: [
        { "artist-credit": [{ name: "A", joinphrase: " feat. " }, { name: "B", joinphrase: "" }] },
        { "artist-credit": [{ name: "A", joinphrase: " feat. " }, { name: "B", joinphrase: "" }] },
        { "artist-credit": [{ name: "C", joinphrase: "" }] },
      ],
    };
    expect(artistFromRecordings(json)).toBe("A feat. B / C");
    expect(artistFromRecordings({})).toBe("");
  });
});

describe("lookupWorkPeople", () => {
  it("requests the work and its recordings and merges the names", async () => {
    const urls: string[] = [];
    const fake = async (url: string) => {
      urls.push(url);
      return url.includes("/work/") ? mbJson("mb-work-artist-rels") : mbJson("mb-recordings-by-work");
    };
    await expect(lookupWorkPeople(MBID, fake)).resolves.toEqual({ artist: "結城アイラ", lyricist: "畑亜貴", composer: "伊藤真澄" });
    expect(urls).toEqual([
      `https://musicbrainz.org/ws/2/work/${MBID}?inc=artist-rels&fmt=json`,
      `https://musicbrainz.org/ws/2/recording?work=${MBID}&inc=artist-credits&fmt=json&limit=100`,
    ]);
  });
});

describe("fetchJson", () => {
  it("sends Accept json, retries once on 503, and throws on other errors", async () => {
    const calls: RequestInit[] = [];
    let status = 503;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      calls.push(init ?? {});
      const s = status;
      status = 200;
      return { ok: s === 200, status: s, json: async () => ({ ok: true }) } as Response;
    }) as unknown as typeof fetch;
    await expect(fetchJson("https://musicbrainz.org/ws/2/x", { fetchFn, sleep: async () => {} })).resolves.toEqual({ ok: true });
    expect(calls.length).toBe(2);
    expect((calls[0].headers as Record<string, string>).Accept).toBe("application/json");
    const bad = (async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    await expect(fetchJson("https://musicbrainz.org/ws/2/x", { fetchFn: bad })).rejects.toThrow("HTTP 500");
  });
});
