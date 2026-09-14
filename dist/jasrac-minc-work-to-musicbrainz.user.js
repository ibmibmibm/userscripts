// ==UserScript==
// @name         JASRAC / MINC work to MusicBrainz
// @namespace    https://github.com/ibmibmibm/userscripts
// @version      1.1.0
// @description  Create or update a MusicBrainz work from a J-WID (JASRAC) or MINC (音楽権利情報検索ナビ) work detail page, with ISWC, codes, credits, and edit note prefilled
// @author       Shen-Ta Hsieh
// @downloadURL  https://github.com/ibmibmibm/userscripts/raw/main/dist/jasrac-minc-work-to-musicbrainz.user.js
// @updateURL    https://github.com/ibmibmibm/userscripts/raw/main/dist/jasrac-minc-work-to-musicbrainz.user.js
// @match        https://www2.jasrac.or.jp/eJwid/main?trxID=F20101*
// @match        https://www.minc.or.jp/saku/detail/*
// @grant        none
// @run-at       document-end
// ==/UserScript==
"use strict";
(() => {
  // scripts/jasrac-minc-work-to-musicbrainz/src/musicbrainz.ts
  var WS = "https://musicbrainz.org/ws/2/";
  var UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  var MbNotFound = class extends Error {
    constructor() {
      super("Work not found");
      this.name = "MbNotFound";
    }
  };
  var defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function str(v) {
    return typeof v === "string" && v.length > 0 ? v : null;
  }
  function arr(v) {
    return Array.isArray(v) ? v : [];
  }
  async function request(path, opts) {
    const fetchFn = opts.fetchFn ?? fetch;
    const sleep = opts.sleep ?? defaultSleep;
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(WS + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15e3) });
      if (res.status === 503 && attempt < 2) {
        await sleep(2e3);
        continue;
      }
      if (res.status === 404) throw new MbNotFound();
      if (!res.ok) throw new Error(`MusicBrainz responded with HTTP ${res.status}`);
      return res.json();
    }
  }
  function luceneQuote(s) {
    return '"' + s.replace(/(["\\])/g, "\\$1") + '"';
  }
  function iswcQuery(iswc) {
    return `iswc:${luceneQuote(iswc)}`;
  }
  function titleQuery(title) {
    return `work:${luceneQuote(title)}`;
  }
  function toWorkHit(json) {
    const j = json ?? {};
    const writers = arr(j.relations).filter((r) => r.artist).map((r) => `${str(r.artist.name) ?? ""} (${str(r.type) ?? ""})`).join(", ");
    return {
      mbid: str(j.id) ?? "",
      title: str(j.title) ?? "",
      type: str(j.type),
      iswcs: arr(j.iswcs).map(String),
      disambiguation: str(j.disambiguation),
      writers
    };
  }
  function toRelation(r) {
    const target = r.artist ?? r.label;
    if (!target) return null;
    return {
      linkTypeId: str(r["type-id"]) ?? "",
      targetType: r.artist ? "artist" : "label",
      name: str(target.name) ?? "",
      sortName: str(target["sort-name"]) ?? "",
      attributes: arr(r.attributes).map(String)
    };
  }
  function toMbWork(json) {
    const j = json ?? {};
    return {
      mbid: str(j.id) ?? "",
      title: str(j.title) ?? "",
      type: str(j.type),
      languages: arr(j.languages).map(String),
      iswcs: arr(j.iswcs).map(String),
      attributes: arr(j.attributes).map((a) => ({ type: str(a.type) ?? "", value: str(a.value) ?? "" })),
      relations: arr(j.relations).map(toRelation).filter((r) => r !== null)
    };
  }
  async function search(query, opts) {
    const body = await request(`work/?fmt=json&limit=25&query=${encodeURIComponent(query)}`, opts);
    return arr(body.works).map(toWorkHit);
  }
  async function searchByIswc(iswc, opts = {}) {
    const hits = await search(iswcQuery(iswc), opts);
    return hits.filter((h) => h.iswcs.includes(iswc));
  }
  async function searchByTitle(title, opts = {}) {
    return search(titleQuery(title), opts);
  }
  async function lookupWork(mbid, opts = {}) {
    return toMbWork(await request(`work/${mbid}?fmt=json&inc=artist-rels+label-rels`, opts));
  }
  function parseWorkRef(text) {
    const t = text.trim();
    const bare = new RegExp(`^${UUID}$`, "i").exec(t);
    if (bare) return t.toLowerCase();
    const url = new RegExp(`musicbrainz\\.org/work/(${UUID})`, "i").exec(t);
    return url ? url[1].toLowerCase() : null;
  }

  // scripts/jasrac-minc-work-to-musicbrainz/src/parser.ts
  function textOf(el2) {
    return (el2?.textContent ?? "").replace(/\u00a0/g, " ").trim();
  }
  function orNull(s) {
    return s.length > 0 ? s : null;
  }
  function iswcOf(s) {
    const v = s.replace(/\s+/g, "");
    return /^T-\d{3}\.\d{3}\.\d{3}-\d$/.test(v) ? v : null;
  }
  function jasracCodeOf(s) {
    const v = s.trim();
    return /^\d{3}-\d{4}-\d$/.test(v) ? v : null;
  }
  function nextoneCodeOf(s) {
    const v = s.trim();
    return /^N\d{8}$/.test(v) ? v : null;
  }
  function cellLines(td) {
    const lines = [];
    let current = "";
    for (const node of Array.from(td.childNodes)) {
      if (node.nodeType === 1 && node.tagName === "BR") {
        lines.push(current);
        current = "";
      } else {
        current += node.textContent ?? "";
      }
    }
    lines.push(current);
    return lines.map((l) => {
      const t = l.replace(/\u00a0/g, " ").trim();
      return t === "" || t === "－" || t === "-" ? null : t;
    });
  }
  function jwidTitles(doc) {
    const table = Array.from(doc.querySelectorAll("table.detail.auto")).find((t) => t.textContent?.includes("作品タイトル"));
    if (!table) return [];
    const out = [];
    for (const tr of Array.from(table.querySelectorAll("tr"))) {
      const td = tr.querySelectorAll("td");
      if (td.length < 2) continue;
      const kind = textOf(td[0]);
      const [title, kana, romaji] = cellLines(td[1]);
      if (!title) continue;
      out.push({ kind, title, kana: kana ?? null, romaji: romaji ?? null, searchName: /^[＊*]/.test(title) });
    }
    return out;
  }
  function jwidArtists(doc) {
    return Array.from(doc.querySelectorAll("section[data-role='artist'] table.detail tr")).map((tr) => textOf(tr.querySelectorAll("td")[1])).filter((s) => s.length > 0);
  }
  function parseJwid(doc) {
    const nameEl = doc.querySelector(".baseinfo--name");
    if (!nameEl) return null;
    const jasracCode = jasracCodeOf(textOf(doc.querySelector(".baseinfo--code strong")));
    const iswc = iswcOf(textOf(doc.querySelector(".baseinfo--iswc strong")));
    let domestic = null;
    for (const dl of Array.from(doc.querySelectorAll(".baseinfo--status dl"))) {
      if (textOf(dl.querySelector("dt")) !== "内外") continue;
      const v = textOf(dl.querySelector("dd"));
      domestic = v === "内国作品" ? true : v === "外国作品" ? false : null;
    }
    const table = doc.querySelector("div#tab-def .PC table.detail") ?? doc.querySelector("section.content-block .PC table.detail");
    const credits = [];
    for (const tr of Array.from(table?.querySelectorAll("tr") ?? [])) {
      const td = tr.querySelectorAll("td");
      if (td.length < 3) continue;
      credits.push({
        source: "JASRAC",
        name: textOf(td[1]),
        role: textOf(td[2]),
        trust: orNull(textOf(td[3])),
        society: orNull(textOf(td[4])),
        note: orNull(textOf(td[5]))
      });
    }
    const sourceUrl = jasracCode ? `https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=${jasracCode.replace(/-/g, "")}&subSessionID=001&subSession=start` : doc.location.href;
    return {
      site: "jwid",
      sourceUrl,
      title: textOf(nameEl),
      jasracCode,
      nextoneCode: null,
      iswc,
      domestic,
      titles: jwidTitles(doc),
      artists: jwidArtists(doc),
      credits
    };
  }
  function headerFields(table) {
    const fields = /* @__PURE__ */ new Map();
    for (const tr of Array.from(table.querySelectorAll("tr"))) {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (th && td) fields.set(textOf(th), td);
    }
    return fields;
  }
  function nonBlankLines(td) {
    if (!td) return [];
    return cellLines(td).filter((l) => l !== null);
  }
  function splitSlash(s) {
    return s.split(/\s+\/(?:\s+|$)/).map((p) => p.trim());
  }
  function mincJasracCredits(area) {
    const out = [];
    for (const table of Array.from(area.querySelectorAll("table")).slice(1)) {
      const td = table.querySelectorAll("td");
      if (td.length < 2) continue;
      const [role = "", trust = ""] = splitSlash(textOf(td[1]));
      out.push({ source: "JASRAC", name: textOf(td[0]), role, trust: orNull(trust), society: null, note: null });
    }
    return out;
  }
  function mincNextoneCredits(area) {
    const out = [];
    for (const table of Array.from(area.querySelectorAll("table")).slice(1)) {
      const td = table.querySelectorAll("td");
      if (td.length < 2) continue;
      const names = splitSlash(textOf(td[0])).filter((n) => n.length > 0);
      const roles = splitSlash(textOf(td[1]));
      names.forEach((name, i) => {
        out.push({ source: "NexTone", name, role: roles[i] || "不明", trust: null, society: null, note: null });
      });
    }
    return out;
  }
  function parseMinc(doc) {
    const jasracArea = doc.querySelector("#jasrac-area");
    const head = jasracArea?.querySelector("table");
    if (!jasracArea || !head) return null;
    const fields = headerFields(head);
    if (!fields.has("作品名") && !fields.has("作品コード")) return null;
    const title = textOf(fields.get("作品名"));
    const jasracCode = jasracCodeOf(textOf(fields.get("作品コード")));
    const iswc = iswcOf(textOf(fields.get("ISWC")));
    const titles = [{ kind: "正題", title, kana: null, romaji: null, searchName: false }];
    for (const sub of nonBlankLines(fields.get("副題"))) {
      titles.push({ kind: "副題", title: sub, kana: null, romaji: null, searchName: /^[＊*]/.test(sub) });
    }
    const artists = nonBlankLines(fields.get("アーティスト"));
    const credits = mincJasracCredits(jasracArea);
    let nextoneCode = null;
    const nextoneArea = doc.querySelector("#nextone-area");
    const nextoneHead = nextoneArea?.querySelector("table");
    if (nextoneArea && nextoneHead) {
      const nf = headerFields(nextoneHead);
      nextoneCode = nextoneCodeOf(textOf(nf.get("作品コード")));
      for (const sub of nonBlankLines(nf.get("副題"))) {
        if (!titles.some((t) => t.title === sub)) {
          titles.push({ kind: "副題", title: sub, kana: null, romaji: null, searchName: /^[＊*]/.test(sub) });
        }
      }
      for (const a of nonBlankLines(nf.get("アーティスト"))) if (!artists.includes(a)) artists.push(a);
      credits.push(...mincNextoneCredits(nextoneArea));
    }
    const jcd = jasracCode ? jasracCode.replace(/-/g, "") : new URL(doc.location.href).searchParams.get("jcd") ?? "";
    return {
      site: "minc",
      sourceUrl: `https://www.minc.or.jp/saku/detail/?jcd=${jcd}&ncd=${nextoneCode ?? ""}`,
      title,
      jasracCode,
      nextoneCode,
      iswc,
      domestic: null,
      titles,
      artists,
      credits
    };
  }

  // scripts/jasrac-minc-work-to-musicbrainz/src/normalize.ts
  var CJK_CHAR = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;
  var CJK_ONLY = /^[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿0-9 ]*$/;
  function fold(s) {
    return s.normalize("NFKC").replace(/\s+/g, " ").trim();
  }
  function moveArticle(s) {
    const n = s.normalize("NFKC");
    if (CJK_CHAR.test(n)) return fold(n);
    const m = n.match(/^(.+?)\s{2,}(THE|A|AN)\s*$/i);
    return m ? fold(`${m[2]} ${m[1]}`) : fold(n);
  }
  function displayTitle(title) {
    return moveArticle(title);
  }
  var JP_MARKERS = ["株式会社", "(株)", "有限会社", "合同会社"];
  var LATIN_MARKERS = ["Co., Ltd.", "Co.,Ltd.", "Inc.", "Inc", "Ltd.", "Ltd", "LLC", "Co."];
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function findMarker(s) {
    for (const m of JP_MARKERS) {
      if (s.startsWith(m)) return { start: 0, end: m.length };
      if (s.endsWith(m)) return { start: s.length - m.length, end: s.length };
    }
    for (const m of LATIN_MARKERS) {
      const tail = new RegExp(`[ ,]+${escapeRe(m)}$`, "i").exec(s);
      if (tail) return { start: tail.index, end: s.length };
      const head = new RegExp(`^${escapeRe(m)}[ ,]+`, "i").exec(s);
      if (head) return { start: 0, end: head[0].length };
    }
    return null;
  }
  function isCompany(name) {
    return findMarker(fold(name)) !== null;
  }
  function stripCompany(name) {
    const s = fold(name);
    const m = findMarker(s);
    if (!m) return s;
    return fold(`${s.slice(0, m.start)} ${s.slice(m.end)}`);
  }
  function isCjkOnly(s) {
    return CJK_ONLY.test(s);
  }
  function targetName(name) {
    const s = stripCompany(name);
    return isCjkOnly(s) ? s.replace(/ /g, "") : s;
  }
  var RIGHTS_HOLDER = /^権利者[\s　]*/;
  function stripRightsHolder(name) {
    return name.replace(RIGHTS_HOLDER, "");
  }

  // scripts/jasrac-minc-work-to-musicbrainz/src/mapping.ts
  var LINK = {
    lyricist: "3e48faba-ec01-47fd-8e89-30e81161661c",
    translator: "da6c5d8a-ce13-474d-9375-61feb29039a5",
    composer: "d59d99ea-23d4-4a80-b066-edca32ee158f",
    writer: "a255bca1-b157-4518-9108-7b147dc3fc68",
    arranger: "d3fd781c-5894-47e2-8c12-86cc0e2c8d08",
    publishing: "05ee6f18-4517-342d-afdf-5897f64276e3"
  };
  var ATTR = {
    additional: "0a5341f8-3b1d-4f99-a0c6-26b7f4e42c7f",
    sub: "4521ce8e-3d24-4b64-9805-59df6f3a4740"
  };
  var WORK_ATTR = { jasrac: 3, nextone: 33 };
  var WORK_TYPE_SONG = 17;
  var LANG_NO_LYRICS = 486;
  var PUBLISHER = { linkType: LINK.publishing, targetType: "label", attributes: [], label: "publisher" };
  var ROLES = {
    作詞: { linkType: LINK.lyricist, targetType: "artist", attributes: [], label: "lyricist" },
    補詞: { linkType: LINK.lyricist, targetType: "artist", attributes: [ATTR.additional], label: "additional lyricist" },
    訳詞: { linkType: LINK.translator, targetType: "artist", attributes: [], label: "translator" },
    作曲: { linkType: LINK.composer, targetType: "artist", attributes: [], label: "composer" },
    編曲: { linkType: LINK.arranger, targetType: "artist", attributes: [], label: "arranger" },
    作曲作詞: { linkType: LINK.writer, targetType: "artist", attributes: [], label: "writer" },
    不明: { linkType: LINK.writer, targetType: "artist", attributes: [], label: "writer" },
    出版者: PUBLISHER,
    出版社: PUBLISHER,
    サブ出版: { linkType: LINK.publishing, targetType: "label", attributes: [ATTR.sub], label: "sub-publisher" }
  };
  function sameSet(a, b) {
    return a.length === b.length && a.every((x) => b.includes(x));
  }
  function mapCredits(credits) {
    const rels = [];
    const skipped = [];
    for (const credit of credits) {
      let name = credit.name;
      let map;
      if (fold(name).toUpperCase() === "UNKNOWN PUBLISHER") {
        skipped.push({ credit, reason: "unknown publisher" });
        continue;
      }
      if (RIGHTS_HOLDER.test(name)) {
        name = stripRightsHolder(name);
        if (!isCompany(name)) {
          skipped.push({ credit, reason: "rights holder" });
          continue;
        }
        map = PUBLISHER;
      } else {
        map = ROLES[fold(credit.role)];
      }
      const target = map ? targetName(name) : "";
      if (!map || target.length === 0) {
        skipped.push({ credit, reason: "not mapped" });
        continue;
      }
      const existing = rels.find(
        (r) => r.linkType === map.linkType && r.target === target && sameSet(r.attributes, map.attributes)
      );
      if (existing) {
        existing.from.push(credit);
      } else {
        rels.push({ ...map, attributes: [...map.attributes], target, from: [credit] });
      }
    }
    return { rels, skipped };
  }
  function workKind(credits) {
    const roles = credits.map((c) => fold(c.role));
    if (roles.some((r) => r.includes("詞"))) return "song";
    if (roles.some((r) => r === "不明")) return "unknown";
    if (roles.some((r) => r === "作曲" || r === "編曲")) return "instrumental";
    return "unknown";
  }

  // scripts/jasrac-minc-work-to-musicbrainz/src/diff.ts
  function hasAttribute(mb, type, value) {
    return value !== null && mb.attributes.some((a) => a.type === type && a.value === value);
  }
  function hasRelation(mb, seed) {
    const want = seed.target.toLowerCase();
    return mb.relations.some(
      (r) => r.linkTypeId === seed.linkType && [targetName(r.name), targetName(r.sortName)].some((n) => n.toLowerCase() === want)
    );
  }
  function diffWork(info, seeds, kind, mb) {
    return {
      iswc: info.iswc !== null && !mb.iswcs.includes(info.iswc) ? info.iswc : null,
      jasracCode: info.jasracCode !== null && !hasAttribute(mb, "JASRAC ID", info.jasracCode) ? info.jasracCode : null,
      nextoneCode: info.nextoneCode !== null && !hasAttribute(mb, "NexTone ID", info.nextoneCode) ? info.nextoneCode : null,
      typeId: kind === "song" && mb.type === null ? WORK_TYPE_SONG : null,
      languageId: kind === "instrumental" && mb.languages.length === 0 ? LANG_NO_LYRICS : null,
      rels: seeds.filter((s) => !hasRelation(mb, s)),
      iswcIndex: mb.iswcs.length,
      attributeIndex: mb.attributes.length
    };
  }
  function isEmpty(diff) {
    return diff.iswc === null && diff.jasracCode === null && diff.nextoneCode === null && diff.typeId === null && diff.languageId === null && diff.rels.length === 0;
  }

  // scripts/jasrac-minc-work-to-musicbrainz/src/note.ts
  var SCRIPT_NAME = "JASRAC / MINC work to MusicBrainz";
  var MAX_PERFORMERS = 10;
  function block(name, lines, omitted) {
    if (omitted) return [`${name} omitted, see source page`, ""];
    if (lines.length === 0) return [];
    return [name, ...lines, ""];
  }
  function buildEditNote(info, version, dropped = /* @__PURE__ */ new Set()) {
    const ids = [];
    if (info.jasracCode) ids.push(`JASRAC ${info.jasracCode}`);
    if (info.nextoneCode) ids.push(`NexTone ${info.nextoneCode}`);
    if (info.iswc) ids.push(`ISWC ${info.iswc}`);
    const header = ids.length > 0 ? `${displayTitle(info.title)} (${ids.join(" / ")})` : displayTitle(info.title);
    const creditLines = [];
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
      `${SCRIPT_NAME} v${version}`
    ].join("\n");
  }

  // scripts/jasrac-minc-work-to-musicbrainz/src/seed.ts
  var MAX_URL = 8e3;
  var MB = "https://musicbrainz.org";
  function addAttribute(p, index, typeId, value) {
    p.append(`edit-work.attributes.${index}.type_id`, String(typeId));
    p.append(`edit-work.attributes.${index}.value`, value);
    return index + 1;
  }
  function addRels(p, rels) {
    rels.forEach((r, n) => {
      p.append(`rels.${n}.type`, r.linkType);
      p.append(`rels.${n}.target`, r.target);
      r.attributes.forEach((a, k) => p.append(`rels.${n}.attributes.${k}.type`, a));
    });
  }
  function buildCreateUrl(info, seeds, kind, note) {
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
  function buildEditUrl(mbid, diff, note) {
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
  var DROP_ORDER = ["artists", "titles", "credits"];
  function fitUrl(build, info, version) {
    const dropped = [];
    let url = build(buildEditNote(info, version, new Set(dropped)));
    for (const block2 of DROP_ORDER) {
      if (url.length <= MAX_URL) break;
      dropped.push(block2);
      url = build(buildEditNote(info, version, new Set(dropped)));
    }
    return { url, dropped };
  }

  // scripts/jasrac-minc-work-to-musicbrainz/src/ui.ts
  var MARKER = "jasrac-minc-mb";
  function el(doc, tag, className = "", text = "") {
    const e = doc.createElement(tag);
    if (className) e.className = `${MARKER}-${className}`;
    if (text) e.textContent = text;
    return e;
  }
  var PANEL_STYLE = "margin:8px 0;padding:8px;border:1px solid #999;background:#f7f7ff;color:#000;font-size:13px;line-height:1.5";
  function enhancePage(doc, info, deps) {
    const { rels, skipped } = mapCredits(info.credits);
    const state = {
      seeds: rels,
      skipped,
      kind: workKind(info.credits),
      hits: [],
      target: null,
      work: null,
      diff: null,
      seq: 0,
      searching: false
    };
    const panel = el(doc, "div", "panel");
    panel.classList.add(MARKER);
    panel.style.cssText = PANEL_STYLE;
    const heading = el(doc, "div", "heading", `MusicBrainz (${deps.version})`);
    heading.style.fontWeight = "bold";
    const summary = el(doc, "div", "summary");
    const ids = [info.jasracCode && `JASRAC ${info.jasracCode}`, info.nextoneCode && `NexTone ${info.nextoneCode}`, info.iswc && `ISWC ${info.iswc}`].filter((s) => !!s).join(" / ");
    summary.textContent = `${displayTitle(info.title)}${ids ? ` (${ids})` : ""} — ${state.kind}`;
    const relsTable = el(doc, "table", "rels");
    const thead = el(doc, "thead");
    const hr = el(doc, "tr");
    for (const h of ["Relationship", "Target", "From"]) hr.appendChild(el(doc, "th", "", h));
    thead.appendChild(hr);
    const tbody = el(doc, "tbody");
    for (const r of state.seeds) {
      const tr = el(doc, "tr");
      tr.appendChild(el(doc, "td", "", r.label));
      tr.appendChild(el(doc, "td", "", r.target));
      tr.appendChild(el(doc, "td", "", r.from.map((c) => `${c.source} ${c.role} ${c.name}`).join(", ")));
      tbody.appendChild(tr);
    }
    relsTable.append(thead, tbody);
    const skippedLine = el(doc, "div", "skipped");
    if (state.skipped.length > 0) {
      skippedLine.textContent = `Skipped: ${state.skipped.map((s) => `${s.credit.role} ${s.credit.name} (${s.reason})`).join("; ")}`;
    }
    const targetRow = el(doc, "div", "target");
    const ref = el(doc, "input", "ref");
    ref.type = "text";
    ref.placeholder = "MusicBrainz work URL or MBID";
    ref.style.width = "24em";
    const searchIswc = el(doc, "button", "search-iswc", "Search by ISWC");
    searchIswc.type = "button";
    const search2 = el(doc, "button", "search", "Search by title");
    search2.type = "button";
    const status = el(doc, "span", "status");
    status.style.marginLeft = "8px";
    targetRow.append(ref, " ");
    if (info.iswc) targetRow.append(searchIswc, " ");
    targetRow.append(search2, status);
    const picker = el(doc, "div", "picker");
    const diffBox = el(doc, "div", "diff");
    const actions = el(doc, "div", "actions");
    const create = el(doc, "button", "create", "Create work in MusicBrainz");
    create.type = "button";
    const update = el(doc, "button", "update", "Update");
    update.type = "button";
    update.disabled = true;
    actions.append(create, " ", update);
    const notice = el(doc, "div", "notice");
    panel.append(heading, summary, relsTable, skippedLine, targetRow, picker, diffBox, actions, notice);
    const setStatus = (msg, retry) => {
      status.textContent = msg;
      if (retry) {
        const btn = el(doc, "button", "retry", "Retry");
        btn.type = "button";
        btn.style.marginLeft = "4px";
        btn.addEventListener("click", retry);
        status.appendChild(btn);
      }
    };
    const renderDiff = () => {
      diffBox.textContent = "";
      update.disabled = true;
      update.textContent = "Update";
      const d = state.diff;
      if (!d || !state.work) return;
      update.textContent = `Update "${state.work.title}"`;
      if (isEmpty(d)) {
        diffBox.textContent = "Nothing to add";
        return;
      }
      const lines = [];
      if (d.iswc) lines.push(`ISWC ${d.iswc}`);
      if (d.jasracCode) lines.push(`JASRAC ID ${d.jasracCode}`);
      if (d.nextoneCode) lines.push(`NexTone ID ${d.nextoneCode}`);
      if (d.typeId !== null) lines.push("type Song");
      if (d.languageId !== null) lines.push("language [No lyrics]");
      for (const r of d.rels) lines.push(`${r.label}: ${r.target}`);
      diffBox.appendChild(el(doc, "div", "", "Will add:"));
      const ul = el(doc, "ul");
      for (const l of lines) ul.appendChild(el(doc, "li", "", l));
      diffBox.appendChild(ul);
      update.disabled = false;
    };
    const renderPicker = () => {
      picker.textContent = "";
      for (const h of state.hits) {
        const label = el(doc, "label");
        label.style.display = "block";
        const radio = el(doc, "input");
        radio.type = "radio";
        radio.name = `${MARKER}-hit`;
        radio.value = h.mbid;
        radio.checked = h.mbid === state.target;
        radio.addEventListener("change", () => {
          if (radio.checked) {
            ref.value = "";
            setTarget(h.mbid);
          }
        });
        const link = el(doc, "a");
        link.href = `https://musicbrainz.org/work/${h.mbid}`;
        link.target = "_blank";
        link.textContent = h.mbid.slice(0, 8);
        const desc = [h.title, h.type, h.disambiguation, h.writers, h.iswcs.join(", ")].filter((s) => s).join(" · ");
        label.append(radio, " ", desc, " ", link);
        picker.appendChild(label);
      }
    };
    const runLookup = () => {
      const mbid = state.target;
      if (!mbid) return;
      const seq = ++state.seq;
      state.work = null;
      state.diff = null;
      renderDiff();
      setStatus("Loading work…");
      deps.lookupWork(mbid).then(
        (work) => {
          if (seq !== state.seq) return;
          state.work = work;
          state.diff = diffWork(info, state.seeds, state.kind, work);
          setStatus("");
          renderDiff();
        },
        (err) => {
          if (seq !== state.seq) return;
          if (err instanceof MbNotFound) setStatus("Work not found");
          else setStatus(err instanceof Error ? err.message : String(err), runLookup);
        }
      );
    };
    const setTarget = (mbid) => {
      state.target = mbid;
      state.seq++;
      state.work = null;
      state.diff = null;
      renderPicker();
      renderDiff();
      if (mbid) runLookup();
      else setStatus("");
    };
    ref.addEventListener("input", () => {
      const text = ref.value.trim();
      if (text === "") {
        setTarget(null);
        return;
      }
      const mbid = parseWorkRef(text);
      if (!mbid) {
        setTarget(null);
        setStatus("Not a MusicBrainz work URL or MBID");
        return;
      }
      setTarget(mbid);
    });
    const runSearch = (kind) => {
      if (state.searching) return;
      state.searching = true;
      const seq = ++state.seq;
      setStatus(kind === "iswc" ? "Searching MusicBrainz by ISWC…" : "Searching MusicBrainz by title…");
      const p = kind === "iswc" ? deps.searchByIswc(info.iswc) : deps.searchByTitle(displayTitle(info.title));
      p.then(
        (hits) => {
          state.searching = false;
          if (seq !== state.seq) return;
          state.hits = hits;
          if (hits.length === 0) {
            setStatus(kind === "iswc" ? "No work with this ISWC" : "No work with this title");
            renderPicker();
            return;
          }
          setStatus("");
          if (kind === "iswc" && hits.length === 1 && ref.value.trim() === "") setTarget(hits[0].mbid);
          else renderPicker();
        },
        (err) => {
          state.searching = false;
          if (seq !== state.seq) return;
          setStatus(err instanceof Error ? err.message : String(err), () => runSearch(kind));
        }
      );
    };
    const startSearch = (kind) => {
      if (state.searching) return;
      ref.value = "";
      setTarget(null);
      runSearch(kind);
    };
    searchIswc.addEventListener("click", () => startSearch("iswc"));
    search2.addEventListener("click", () => startSearch("title"));
    const openUrl = (build) => {
      notice.textContent = "";
      const { url, dropped } = fitUrl(build, info, deps.version);
      if (dropped.length > 0) notice.textContent = `Edit note shortened: ${dropped.join(", ")}`;
      const win = deps.open(url);
      if (win === null) {
        const a = el(doc, "a", "link", "Popup blocked, open this link");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        notice.appendChild(a);
      }
    };
    create.addEventListener("click", () => openUrl((note) => buildCreateUrl(info, state.seeds, state.kind, note)));
    update.addEventListener("click", () => {
      if (!state.target || !state.diff) return;
      const mbid = state.target;
      const diff = state.diff;
      openUrl((note) => buildEditUrl(mbid, diff, note));
    });
    if (info.site === "jwid") {
      const base = doc.querySelector(".baseinfo");
      if (base?.parentNode) base.parentNode.insertBefore(panel, base.nextSibling);
      else doc.body.prepend(panel);
    } else {
      const area = doc.querySelector("#jasrac-area");
      if (area?.parentNode) area.parentNode.insertBefore(panel, area);
      else doc.body.prepend(panel);
    }
    return panel;
  }

  // scripts/jasrac-minc-work-to-musicbrainz/src/main.ts
  var VERSION = true ? "1.1.0" : "dev";
  function siteOf(hostname) {
    if (hostname === "www2.jasrac.or.jp") return "jwid";
    if (hostname === "www.minc.or.jp") return "minc";
    return null;
  }
  var warned = /* @__PURE__ */ new WeakSet();
  function enhance(doc, site, deps) {
    if (doc.querySelector(`.${MARKER}`)) return "present";
    const info = site === "jwid" ? parseJwid(doc) : parseMinc(doc);
    if (!info) {
      if (!warned.has(doc)) {
        warned.add(doc);
        console.warn(`[${MARKER}] no work found on this ${site} page`);
      }
      return "none";
    }
    enhancePage(doc, info, deps);
    return "added";
  }
  function start(site) {
    const deps = {
      version: VERSION,
      searchByIswc: (iswc) => searchByIswc(iswc),
      searchByTitle: (title) => searchByTitle(title),
      lookupWork: (mbid) => lookupWork(mbid),
      // Contract: returns null only when the browser blocked the popup.
      open: (url) => {
        const w = window.open(url, "_blank");
        if (w) w.opener = null;
        return w;
      }
    };
    setInterval(() => enhance(document, site, deps), 1e3);
  }
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const site = siteOf(window.location.hostname);
    if (site) start(site);
  }
})();
