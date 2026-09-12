import { diffWork } from "../src/diff";
import { ATTR, LINK, mapCredits, workKind } from "../src/mapping";
import { toMbWork } from "../src/musicbrainz";
import { buildCreateUrl, buildEditUrl, fitUrl, MAX_URL } from "../src/seed";
import { parseJwid, parseMinc } from "../src/parser";
import { jwidDocument, mbJson, mincDocument } from "./helpers";

function params(url: string): [string, string][] {
  return Array.from(new URL(url).searchParams.entries());
}

describe("buildCreateUrl", () => {
  it("orders name, ISWC, attributes, type, rels, and note", () => {
    const info = parseMinc(mincDocument("minc-25707965-N00913658"))!;
    const { rels } = mapCredits(info.credits);
    const url = buildCreateUrl(info, rels, workKind(info.credits), "NOTE");
    expect(url.startsWith("https://musicbrainz.org/work/create?")).toBe(true);
    expect(params(url)).toEqual([
      ["edit-work.name", "ダーリンダンス"],
      ["edit-work.iswcs.0", "T-302.445.339-8"],
      ["edit-work.attributes.0.type_id", "3"],
      ["edit-work.attributes.0.value", "257-0796-5"],
      ["edit-work.attributes.1.type_id", "33"],
      ["edit-work.attributes.1.value", "N00913658"],
      ["edit-work.type_id", "17"],
      ["rels.0.type", LINK.lyricist],
      ["rels.0.target", "かいりきベア"],
      ["rels.1.type", LINK.composer],
      ["rels.1.target", "かいりきベア"],
      ["rels.2.type", LINK.publishing],
      ["rels.2.target", "ドワンゴ第7事業部"],
      ["rels.3.type", LINK.publishing],
      ["rels.3.target", "ドワンゴ第七事業部"],
      ["edit-work.edit_note", "NOTE"],
    ]);
  });

  it("seeds language for instrumental works and attributes for 補詞 and サブ出版", () => {
    const info = parseJwid(jwidDocument("jwid-70417750"))!;
    info.credits.push({ source: "JASRAC", name: "補詞者", role: "補詞", trust: null, society: null, note: null });
    info.credits.push({ source: "JASRAC", name: "サブ社", role: "サブ出版", trust: null, society: null, note: null });
    const { rels } = mapCredits(info.credits);
    const url = buildCreateUrl(info, rels, "instrumental", "N");
    const p = params(url);
    expect(p).toContainEqual(["edit-work.languages.0", "486"]);
    expect(p.some(([k]) => k === "edit-work.type_id")).toBe(false);
    expect(p).toContainEqual(["rels.2.attributes.0.type", ATTR.additional]);
    expect(p).toContainEqual(["rels.3.attributes.0.type", ATTR.sub]);
    expect(p.filter(([k]) => k.startsWith("edit-work.attributes")).length).toBe(2);
  });

  it("moves the article in the seeded name and skips absent fields", () => {
    const info = parseJwid(jwidDocument("jwid-15233952"))!;
    const p = params(buildCreateUrl(info, [], "unknown", "N"));
    expect(p).toEqual([
      ["edit-work.name", "THE ALMIGHTY"],
      ["edit-work.attributes.0.type_id", "3"],
      ["edit-work.attributes.0.value", "152-3395-2"],
      ["edit-work.edit_note", "N"],
    ]);
  });
});

describe("buildEditUrl", () => {
  it("continues indexes after existing values and sends no name", () => {
    const info = parseMinc(mincDocument("minc-25707965-N00913658"))!;
    const { rels } = mapCredits(info.credits);
    const diff = diffWork(info, rels, "song", toMbWork(mbJson("mb-work-lookup")));
    const url = buildEditUrl("d69ecd96-bb2c-461f-9762-29102d2b50a1", diff, "NOTE");
    expect(url.startsWith("https://musicbrainz.org/work/d69ecd96-bb2c-461f-9762-29102d2b50a1/edit?")).toBe(true);
    const p = params(url);
    expect(p[0]).toEqual(["edit-work.iswcs.1", "T-302.445.339-8"]);
    expect(p).toContainEqual(["edit-work.attributes.12.type_id", "3"]);
    expect(p).toContainEqual(["edit-work.attributes.12.value", "257-0796-5"]);
    expect(p).toContainEqual(["edit-work.attributes.13.type_id", "33"]);
    expect(p).toContainEqual(["edit-work.attributes.13.value", "N00913658"]);
    expect(p.some(([k]) => k === "edit-work.name" || k === "edit-work.type_id" || k === "edit-work.languages.0")).toBe(false);
    expect(p.filter(([k]) => /^rels\.\d+\.type$/.test(k)).length).toBe(4);
    expect(p[p.length - 1]).toEqual(["edit-work.edit_note", "NOTE"]);
  });
});

describe("fitUrl", () => {
  it("returns the full note when the URL is short", () => {
    const info = parseJwid(jwidDocument("jwid-70342415"))!;
    const r = fitUrl((note) => buildCreateUrl(info, [], "song", note), info, "1.0.0");
    expect(r.dropped).toEqual([]);
    expect(new URL(r.url).searchParams.get("edit-work.edit_note")).toContain("PERFORMERS");
  });

  it("drops artists, then titles, then credits until the URL fits", () => {
    const base = parseJwid(jwidDocument("jwid-70342415"))!;
    const long = (n: number) => Array.from({ length: n }, (_, i) => `名前${i}`);
    const artists = { ...base, artists: long(10).map((s) => s.repeat(300)) };
    const r1 = fitUrl((note) => buildCreateUrl(artists, [], "song", note), artists, "1.0.0");
    expect(r1.dropped).toEqual(["artists"]);
    expect(r1.url.length).toBeLessThanOrEqual(MAX_URL);
    const titles = { ...artists, titles: base.titles.map((t) => ({ ...t, title: t.title.repeat(200) })) };
    const r2 = fitUrl((note) => buildCreateUrl(titles, [], "song", note), titles, "1.0.0");
    expect(r2.dropped).toEqual(["artists", "titles"]);
    const credits = { ...titles, credits: base.credits.map((c) => ({ ...c, name: c.name.repeat(300) })) };
    const r3 = fitUrl((note) => buildCreateUrl(credits, [], "song", note), credits, "1.0.0");
    expect(r3.dropped).toEqual(["artists", "titles", "credits"]);
    expect(r3.url.length).toBeLessThanOrEqual(MAX_URL);
  });
});
