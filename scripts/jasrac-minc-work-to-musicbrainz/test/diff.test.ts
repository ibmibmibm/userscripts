import { diffWork, isEmpty } from "../src/diff";
import { LINK, mapCredits, workKind } from "../src/mapping";
import { toMbWork } from "../src/musicbrainz";
import type { MbWork, WorkInfo } from "../src/types";
import { mbJson } from "./helpers";

const lemon = (): MbWork => toMbWork(mbJson("mb-work-lookup"));

const info = (over: Partial<WorkInfo> = {}): WorkInfo => ({
  site: "jwid",
  sourceUrl: "https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=72055405&subSessionID=001&subSession=start",
  title: "Ｌｅｍｏｎ",
  jasracCode: "720-5540-5",
  nextoneCode: "N12345678",
  iswc: "T-924.390.287-6",
  domestic: true,
  titles: [],
  artists: [],
  credits: [
    { source: "JASRAC", name: "米津　玄師", role: "作詞", trust: null, society: null, note: null },
    { source: "JASRAC", name: "米津　玄師", role: "作曲", trust: null, society: null, note: null },
    { source: "JASRAC", name: "ホリプロ", role: "出版者", trust: null, society: null, note: null },
    { source: "JASRAC", name: "日音　株式会社", role: "サブ出版", trust: null, society: null, note: null },
  ],
  ...over,
});

describe("diffWork", () => {
  it("adds only what the work lacks", () => {
    const i = info();
    const { rels } = mapCredits(i.credits);
    const d = diffWork(i, rels, workKind(i.credits), lemon());
    expect(d.iswc).toBeNull();
    expect(d.jasracCode).toBeNull();
    expect(d.nextoneCode).toBe("N12345678");
    expect(d.typeId).toBeNull();
    expect(d.languageId).toBeNull();
    expect(d.iswcIndex).toBe(1);
    expect(d.attributeIndex).toBe(12);
    expect(d.rels.map((r) => [r.label, r.target])).toEqual([["publisher", "ホリプロ"]]);
    expect(isEmpty(d)).toBe(false);
  });

  it("matches existing relations by name or sort name, case-insensitively", () => {
    const i = info({
      credits: [
        { source: "JASRAC", name: "YONEZU, KENSHI", role: "作詞", trust: null, society: null, note: null },
        { source: "JASRAC", name: "horipro", role: "出版者", trust: null, society: null, note: null },
      ],
    });
    const d = diffWork(i, mapCredits(i.credits).rels, "song", lemon());
    expect(d.rels).toEqual([]);
  });

  it("keeps a relation of another link type to the same name", () => {
    const i = info({ credits: [{ source: "JASRAC", name: "米津　玄師", role: "編曲", trust: null, society: null, note: null }] });
    const d = diffWork(i, mapCredits(i.credits).rels, "instrumental", lemon());
    expect(d.rels.map((r) => r.linkType)).toEqual([LINK.arranger]);
  });

  it("adds ISWC, JASRAC code, type, and language to a bare work", () => {
    const bare: MbWork = { mbid: "x", title: "X", type: null, languages: [], iswcs: [], attributes: [], relations: [] };
    const i = info();
    const song = diffWork(i, [], "song", bare);
    expect(song.iswc).toBe("T-924.390.287-6");
    expect(song.jasracCode).toBe("720-5540-5");
    expect(song.typeId).toBe(17);
    expect(song.languageId).toBeNull();
    expect(song.iswcIndex).toBe(0);
    expect(song.attributeIndex).toBe(0);
    const inst = diffWork(i, [], "instrumental", bare);
    expect(inst.typeId).toBeNull();
    expect(inst.languageId).toBe(486);
    const unknown = diffWork(i, [], "unknown", bare);
    expect(unknown.typeId).toBeNull();
    expect(unknown.languageId).toBeNull();
  });

  it("does not set language when the work has one, nor type when it has one", () => {
    const d = diffWork(info(), [], "instrumental", lemon());
    expect(d.languageId).toBeNull();
    expect(d.typeId).toBeNull();
  });

  it("is empty when nothing is missing", () => {
    const i = info({ nextoneCode: null, credits: [] });
    const d = diffWork(i, [], "song", lemon());
    expect(isEmpty(d)).toBe(true);
  });
});
