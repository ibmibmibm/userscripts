// ==UserScript==
// @name         MusicBrainz work lyrics search
// @namespace    https://github.com/ibmibmibm/userscripts
// @version      1.0.1
// @description  Search Japanese lyrics sites from a MusicBrainz work edit page and add the lyrics page to the external links
// @author       Shen-Ta Hsieh
// @downloadURL  https://github.com/ibmibmibm/userscripts/raw/main/dist/musicbrainz-work-lyrics-search.user.js
// @updateURL    https://github.com/ibmibmibm/userscripts/raw/main/dist/musicbrainz-work-lyrics-search.user.js
// @match        https://musicbrainz.org/work/*/edit*
// @match        https://musicbrainz.org/work/create*
// @match        https://beta.musicbrainz.org/work/*/edit*
// @match        https://beta.musicbrainz.org/work/create*
// @grant        GM_xmlhttpRequest
// @connect      j-lyric.net
// @connect      utaten.com
// @connect      www.uta-net.com
// @connect      kashinavi.com
// @connect      petitlyrics.com
// @connect      www.joysound.com
// @run-at       document-end
// ==/UserScript==
"use strict";
(() => {
  // scripts/musicbrainz-work-lyrics-search/src/fetch.ts
  function gmFetchText(url, charset, request, emptyStatus) {
    return new Promise((resolve, reject) => {
      const details = {
        method: "GET",
        url,
        timeout: 15e3,
        onload: (r) => {
          if (r.status >= 200 && r.status < 300) resolve(r.responseText);
          else if (r.status === emptyStatus) resolve("");
          else reject(new Error(`HTTP ${r.status}`));
        },
        onerror: () => reject(new Error("Request failed")),
        ontimeout: () => reject(new Error("Timed out"))
      };
      if (charset) details.overrideMimeType = `text/html; charset=${charset}`;
      request(details);
    });
  }

  // scripts/musicbrainz-work-lyrics-search/src/links.ts
  var EDITOR = "#external-links-editor";
  function normalizeUrl(url) {
    return url.trim().replace(/\/+$/, "");
  }
  function urlInputs(doc) {
    return Array.from(doc.querySelectorAll(`${EDITOR} input[type=url]`));
  }
  function existingLinks(doc) {
    const urls = /* @__PURE__ */ new Set();
    for (const a of Array.from(doc.querySelectorAll(`${EDITOR} a.url`))) {
      const href = normalizeUrl(a.getAttribute("href") ?? "");
      if (href) urls.add(href);
    }
    for (const input of urlInputs(doc)) {
      const v = normalizeUrl(input.value);
      if (v) urls.add(v);
    }
    return urls;
  }
  function hasLink(doc, url) {
    return existingLinks(doc).has(normalizeUrl(url));
  }
  var defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function addLink(doc, url, sleep = defaultSleep) {
    const win = doc.defaultView;
    const input = urlInputs(doc).find((i) => i.value === "");
    if (!win || !input) return false;
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
    if (!setter) return false;
    setter.call(input, url);
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    for (let i = 0; i < 10; i++) {
      const inputs = urlInputs(doc);
      if (inputs.some((x) => x.value === url) && inputs.some((x) => x.value === "")) return true;
      await sleep(100);
    }
    return false;
  }

  // scripts/musicbrainz-work-lyrics-search/src/musicbrainz.ts
  var WS = "https://musicbrainz.org/ws/2/";
  var UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  var EDIT_PATH = new RegExp(`^/work/(${UUID})/edit$`, "i");
  function str(v) {
    return typeof v === "string" ? v : "";
  }
  function arr(v) {
    return Array.isArray(v) ? v : [];
  }
  function mbidFromUrl(href) {
    let path;
    try {
      path = new URL(href).pathname;
    } catch {
      return null;
    }
    const m = EDIT_PATH.exec(path);
    return m ? m[1].toLowerCase() : null;
  }
  var defaultSleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fetchJson(url, opts = {}) {
    const fetchFn = opts.fetchFn ?? fetch;
    const sleep = opts.sleep ?? defaultSleep2;
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15e3) });
      if (res.status === 503 && attempt < 1) {
        await sleep(2e3);
        continue;
      }
      if (!res.ok) throw new Error(`MusicBrainz responded with HTTP ${res.status}`);
      return res.json();
    }
  }
  function unique(names) {
    return names.filter((n, i) => n.length > 0 && names.indexOf(n) === i);
  }
  function peopleFromWork(json) {
    const rels = arr(json?.relations);
    const names = (type) => unique(rels.filter((r) => str(r.type) === type && r.artist).map((r) => str(r.artist.name))).join(" / ");
    return { lyricist: names("lyricist"), composer: names("composer") };
  }
  function artistFromRecordings(json) {
    const recordings = arr(json?.recordings);
    const phrases = recordings.map((rec) => arr(rec["artist-credit"]).map((c) => str(c.name) + str(c.joinphrase)).join(""));
    return unique(phrases).join(" / ");
  }
  async function lookupWorkPeople(mbid, fetchJsonFn) {
    const work = await fetchJsonFn(`${WS}work/${mbid}?inc=artist-rels&fmt=json`);
    const recordings = await fetchJsonFn(`${WS}recording?work=${mbid}&inc=artist-credits&fmt=json&limit=100`);
    return { artist: artistFromRecordings(recordings), ...peopleFromWork(work) };
  }

  // scripts/musicbrainz-work-lyrics-search/src/sites/util.ts
  function text(el2) {
    return (el2?.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  function abs(origin, href) {
    if (!href) return "";
    try {
      const u = new URL(href, origin);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      return u.toString();
    } catch {
      return "";
    }
  }
  function withParams(base, params, encode) {
    if (encode) {
      const parts = [];
      for (const [k, v] of Object.entries(params)) {
        const trimmed = v.trim();
        if (trimmed) parts.push(`${k}=${encode(trimmed)}`);
      }
      return parts.length ? `${base}?${parts.join("&")}` : base;
    }
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v.trim()) p.set(k, v.trim());
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  }
  function row(partial) {
    return { title: "", artist: "", lyricist: "", composer: "", ...partial };
  }

  // scripts/musicbrainz-work-lyrics-search/src/sites/j-lyric.ts
  var jLyric = {
    id: "j-lyric",
    name: "J-Lyric",
    origin: "https://j-lyric.net",
    buildUrl(q) {
      const params = { kt: q.title, ct: "2" };
      if (q.artist.trim()) {
        params.ka = q.artist;
        params.ca = "2";
      }
      return withParams("https://j-lyric.net/search.php", params);
    },
    parse(doc, origin) {
      const rows = [];
      for (const bdy of Array.from(doc.querySelectorAll("div.bdy"))) {
        const link = bdy.querySelector("p.mid a");
        if (!link) continue;
        const url = abs(origin, link.getAttribute("href"));
        if (!url) continue;
        const singer = Array.from(bdy.querySelectorAll("p.sml")).find((p) => text(p).startsWith("歌："));
        rows.push(row({ url, title: text(link), artist: text(singer?.querySelector("a")) }));
      }
      return rows;
    }
  };

  // scripts/musicbrainz-work-lyrics-search/src/sites/joysound.ts
  var joysound = {
    id: "joysound",
    name: "JOYSOUND",
    origin: "https://www.joysound.com",
    buildUrl(q) {
      return withParams("https://www.joysound.com/web/search/song", { keyword: q.title, match: "1" });
    },
    parse(doc, origin) {
      const rows = [];
      for (const link of Array.from(doc.querySelectorAll("li a[href^='/web/search/song/']"))) {
        const title = link.querySelector("p");
        if (!title) continue;
        const url = abs(origin, link.getAttribute("href"));
        if (!url) continue;
        rows.push(row({ url, title: text(title), artist: text(title.parentElement?.nextElementSibling) }));
      }
      return rows;
    }
  };

  // scripts/musicbrainz-work-lyrics-search/src/sites/shift-jis.ts
  var table = null;
  function buildTable() {
    const decoder = new TextDecoder("shift_jis");
    const map = /* @__PURE__ */ new Map();
    const setIfNew = (ch, bytes) => {
      if (ch && ch !== "�" && !map.has(ch)) map.set(ch, bytes);
    };
    for (let b = 0; b <= 127; b++) setIfNew(decoder.decode(new Uint8Array([b])), [b]);
    for (let b = 161; b <= 223; b++) setIfNew(decoder.decode(new Uint8Array([b])), [b]);
    for (let lead = 129; lead <= 252; lead++) {
      if (!(lead >= 129 && lead <= 159 || lead >= 224 && lead <= 252)) continue;
      for (let trail = 64; trail <= 252; trail++) {
        if (!(trail >= 64 && trail <= 126 || trail >= 128 && trail <= 252)) continue;
        const decoded = decoder.decode(new Uint8Array([lead, trail]));
        if (decoded.length !== 1 && decoded.length !== 2) continue;
        setIfNew(decoded, [lead, trail]);
      }
    }
    return map;
  }
  function toPercentByte(b) {
    return `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  function shiftJisEncode(value) {
    if (!table) table = buildTable();
    let out = "";
    for (const ch of value) {
      const bytes = table.get(ch) ?? [63];
      for (const b of bytes) out += toPercentByte(b);
    }
    return out;
  }

  // scripts/musicbrainz-work-lyrics-search/src/sites/kashinavi.ts
  var RESULT_HEADERS = ["曲名", "歌手名", "歌い出し", "ミニ情報"];
  function stripHeaderPrefix(s) {
    return s.replace(/^[-\s]*◆\s*/, "");
  }
  function findResultTable(doc) {
    for (const table2 of Array.from(doc.querySelectorAll("table"))) {
      const headerRow = table2.querySelector("tr");
      if (!headerRow) continue;
      const headers = Array.from(headerRow.querySelectorAll(":scope > td")).map((td) => stripHeaderPrefix(text(td)));
      if (RESULT_HEADERS.every((h) => headers.includes(h))) return table2;
    }
    return null;
  }
  var kashinavi = {
    id: "kashinavi",
    name: "歌詞ナビ",
    origin: "https://kashinavi.com",
    charset: "shift_jis",
    buildUrl(q) {
      return withParams(
        "https://kashinavi.com/search.php",
        { kyoku: q.title, kashu: q.artist, sakushi: q.lyricist, sakkyoku: q.composer, start: "1" },
        shiftJisEncode
      );
    },
    parse(doc, origin) {
      const table2 = findResultTable(doc);
      if (!table2) return [];
      const rows = [];
      for (const tr of Array.from(table2.querySelectorAll("tr"))) {
        const cells = tr.querySelectorAll(":scope > td");
        const link = cells[1]?.querySelector("a[href*='/lyrics/']");
        if (!link) continue;
        const url = abs(origin, link.getAttribute("href"));
        if (!url) continue;
        rows.push(row({ url, title: text(link), artist: text(cells[2]?.querySelector("a")) }));
      }
      return rows;
    }
  };

  // scripts/musicbrainz-work-lyrics-search/src/sites/petitlyrics.ts
  var petitlyrics = {
    id: "petitlyrics",
    name: "プチリリ",
    origin: "https://petitlyrics.com",
    buildUrl(q) {
      return withParams("https://petitlyrics.com/search_lyrics", { title: q.title, artist: q.artist });
    },
    parse(doc, origin) {
      const rows = [];
      for (const title of Array.from(doc.querySelectorAll("#lyrics_list .lyrics-list-title"))) {
        const link = title.closest("a");
        const cell = title.closest("td");
        if (!link || !cell) continue;
        const url = abs(origin, link.getAttribute("href"));
        if (!url) continue;
        rows.push(row({ url, title: text(title), artist: text(cell.querySelector(".lyrics-list-artist")) }));
      }
      return rows;
    }
  };

  // scripts/musicbrainz-work-lyrics-search/src/sites/uta-net.ts
  var utaNet = {
    id: "uta-net",
    name: "歌ネット",
    origin: "https://www.uta-net.com",
    emptyStatus: 404,
    buildUrl(q) {
      return withParams("https://www.uta-net.com/search/", { target: "songtitle", type: "in", Keyword: q.title });
    },
    parse(doc, origin) {
      const rows = [];
      for (const tr of Array.from(doc.querySelectorAll("table tbody tr"))) {
        const title = tr.querySelector(".songlist-title");
        const link = tr.querySelector("td a");
        if (!title || !link) continue;
        const url = abs(origin, link.getAttribute("href"));
        if (!url) continue;
        const cells = tr.querySelectorAll("td");
        rows.push(
          row({
            url,
            title: text(title),
            artist: text(cells[1]),
            lyricist: text(cells[2]),
            composer: text(cells[3])
          })
        );
      }
      return rows;
    }
  };

  // scripts/musicbrainz-work-lyrics-search/src/sites/utaten.ts
  function writers(cell, label) {
    if (!cell) return "";
    const p = Array.from(cell.querySelectorAll("p")).find((x) => text(x).startsWith(label));
    return p ? Array.from(p.querySelectorAll(".songWriters a")).map(text).filter(Boolean).join(" / ") : "";
  }
  var utaten = {
    id: "utaten",
    name: "UtaTen",
    origin: "https://utaten.com",
    buildUrl(q) {
      return withParams("https://utaten.com/search", { title: q.title, artist_name: q.artist, lyricist: q.lyricist, composer: q.composer });
    },
    parse(doc, origin) {
      const rows = [];
      for (const tr of Array.from(doc.querySelectorAll("table.searchResult tr"))) {
        const link = tr.querySelector(".searchResult__title a");
        if (!link) continue;
        const url = abs(origin, link.getAttribute("href"));
        if (!url) continue;
        const writersCell = tr.querySelector(".searchResult__lyricist");
        rows.push(
          row({
            url,
            title: text(link),
            artist: text(tr.querySelector(".searchResult__artist > p a")),
            lyricist: writers(writersCell, "作詞"),
            composer: writers(writersCell, "作曲")
          })
        );
      }
      return rows;
    }
  };

  // scripts/musicbrainz-work-lyrics-search/src/sites/index.ts
  var SITES = [jLyric, utaten, utaNet, kashinavi, petitlyrics, joysound];
  var MUSIXMATCH_SEARCH = "https://www.musixmatch.com/search";

  // scripts/musicbrainz-work-lyrics-search/src/normalize.ts
  var STRIP = /[\s　・･·,，、]/g;
  function fold(s) {
    return s.normalize("NFKC").toLowerCase().replace(STRIP, "");
  }
  function splitNames(s) {
    return s.split(" / ").map((n) => n.trim()).filter((n) => n.length > 0);
  }
  function swapped(s) {
    const parts = s.normalize("NFKC").trim().split(/\s+/);
    return parts.length === 2 ? `${parts[1]} ${parts[0]}` : null;
  }
  function namesMatch(a, b) {
    const fa = fold(a);
    const fb = fold(b);
    if (!fa || !fb) return false;
    if (fa === fb) return true;
    const sa = swapped(a);
    const sb = swapped(b);
    return sa !== null && fold(sa) === fb || sb !== null && fold(sb) === fa;
  }
  function namesOverlap(a, b) {
    const bs = splitNames(b);
    return splitNames(a).some((x) => bs.some((y) => namesMatch(x, y)));
  }
  function titlesMatch(a, b) {
    const fa = fold(a);
    return fa.length > 0 && fa === fold(b);
  }

  // scripts/musicbrainz-work-lyrics-search/src/types.ts
  var FIELDS = ["title", "artist", "lyricist", "composer"];

  // scripts/musicbrainz-work-lyrics-search/src/rank.ts
  function fieldMatches(field, query, value) {
    if (!query.trim() || !value.trim()) return false;
    return field === "title" ? titlesMatch(query, value) : namesOverlap(query, value);
  }
  function scoreRow(query, row2) {
    const matched = FIELDS.filter((f) => fieldMatches(f, query[f], row2[f]));
    return { row: row2, score: matched.length, matched };
  }
  function rankRows(query, rows) {
    return rows.map((row2, index) => ({ scored: scoreRow(query, row2), index })).sort((a, b) => b.scored.score - a.scored.score || a.index - b.index).map((x) => x.scored);
  }

  // scripts/musicbrainz-work-lyrics-search/src/ui.ts
  var MARKER = "mb-lyrics";
  var LABELS = { title: "Title", artist: "Artist", lyricist: "Lyricist", composer: "Composer" };
  function el(doc, tag, className = "", text2 = "") {
    const e = doc.createElement(tag);
    if (className) e.className = `${MARKER}-${className}`;
    if (text2) e.textContent = text2;
    return e;
  }
  function enhancePage(doc, info, deps) {
    const editor = doc.querySelector("#external-links-editor");
    const anchor = editor?.closest("fieldset");
    if (!anchor) return null;
    const panel = el(doc, "fieldset", "panel");
    panel.classList.add(MARKER);
    panel.appendChild(el(doc, "legend", "legend", `Lyrics search (${deps.version})`));
    const fields = el(doc, "div", "fields");
    const inputs = {};
    for (const f of FIELDS) {
      const label = el(doc, "label", "", `${LABELS[f]}: `);
      const input = el(doc, "input", f);
      input.type = "text";
      input.size = 28;
      label.appendChild(input);
      label.style.marginRight = "8px";
      fields.appendChild(label);
      inputs[f] = input;
    }
    inputs.title.value = info.title;
    panel.appendChild(fields);
    const controls = el(doc, "div", "controls");
    const search = el(doc, "button", "search", "Search lyrics");
    search.type = "button";
    const musixmatch = el(doc, "a", "musixmatch", "Search on Musixmatch");
    musixmatch.target = "_blank";
    musixmatch.rel = "noreferrer";
    musixmatch.style.marginLeft = "8px";
    const status = el(doc, "span", "status");
    status.style.marginLeft = "8px";
    controls.append(search, musixmatch, status);
    panel.appendChild(controls);
    const query = () => ({
      title: inputs.title.value.trim(),
      artist: inputs.artist.value.trim(),
      lyricist: inputs.lyricist.value.trim(),
      composer: inputs.composer.value.trim()
    });
    const updateMusixmatch = () => {
      const q = query();
      musixmatch.href = `${MUSIXMATCH_SEARCH}?query=${encodeURIComponent([q.title, q.artist].filter(Boolean).join(" "))}`;
    };
    inputs.title.addEventListener("input", updateMusixmatch);
    inputs.artist.addEventListener("input", updateMusixmatch);
    updateMusixmatch();
    const views = deps.sites.map((site) => {
      const box = el(doc, "div", "site");
      box.dataset.site = site.id;
      box.style.marginTop = "6px";
      const name = el(doc, "span", "site-name", site.name);
      name.style.fontWeight = "bold";
      const siteStatus = el(doc, "span", "site-status");
      siteStatus.style.marginLeft = "8px";
      const retry = el(doc, "button", "retry", "Retry");
      retry.type = "button";
      retry.hidden = true;
      retry.style.marginLeft = "8px";
      const rows = el(doc, "ul", "rows");
      rows.style.margin = "2px 0 0 16px";
      box.append(name, siteStatus, retry, rows);
      panel.appendChild(box);
      const view = { site, status: siteStatus, retry, rows, seq: 0 };
      retry.addEventListener("click", () => void searchSite(view, query()));
      return view;
    });
    function renderRow(scored) {
      const li = el(doc, "li", "row");
      const link = el(doc, "a", "link");
      link.href = scored.row.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      const parts = [
        ["title", ""],
        ["artist", ""],
        ["lyricist", "作詞 "],
        ["composer", "作曲 "]
      ];
      let first = true;
      for (const [field, prefix] of parts) {
        const value = scored.row[field];
        if (!value) continue;
        if (!first) link.append(" — ");
        first = false;
        if (prefix) link.append(prefix);
        if (scored.matched.includes(field)) link.appendChild(el(doc, "b", "hit", value));
        else link.append(value);
      }
      li.appendChild(link);
      li.append(" ");
      if (deps.hasLink(scored.row.url)) {
        li.appendChild(el(doc, "span", "added", "added"));
      } else {
        const add = el(doc, "button", "add", "Add");
        add.type = "button";
        add.addEventListener("click", async () => {
          add.disabled = true;
          status.textContent = "";
          const ok = await deps.addLink(scored.row.url);
          if (ok) {
            add.replaceWith(el(doc, "span", "added", "added"));
          } else {
            status.textContent = "Could not add, paste the URL by hand";
            add.disabled = false;
          }
        });
        li.appendChild(add);
      }
      return li;
    }
    async function searchSite(view, q) {
      const seq = ++view.seq;
      view.retry.hidden = true;
      view.status.textContent = "Searching…";
      view.rows.replaceChildren();
      try {
        const text2 = await deps.fetchText(view.site.buildUrl(q), view.site.charset, view.site.emptyStatus);
        if (seq !== view.seq) return;
        const parsed = new doc.defaultView.DOMParser().parseFromString(text2, "text/html");
        const rows = view.site.parse(parsed, view.site.origin);
        if (rows.length === 0) {
          view.status.textContent = text2.length > 1e3 ? "No results parsed" : "No results";
          return;
        }
        view.status.textContent = `${rows.length} result${rows.length === 1 ? "" : "s"}`;
        for (const scored of rankRows(q, rows)) view.rows.appendChild(renderRow(scored));
      } catch (e) {
        if (seq !== view.seq) return;
        view.status.textContent = `Request failed: ${e.message}`;
        view.retry.hidden = false;
      }
    }
    let searching = false;
    search.addEventListener("click", async () => {
      if (searching) return;
      searching = true;
      const q = query();
      try {
        await Promise.all(views.map((v) => searchSite(v, q)));
      } finally {
        searching = false;
      }
    });
    if (info.mbid) {
      status.textContent = "Looking up MusicBrainz…";
      deps.lookupPeople(info.mbid).then((people) => {
        for (const f of ["artist", "lyricist", "composer"]) {
          if (!inputs[f].value) inputs[f].value = people[f];
        }
        status.textContent = "";
        updateMusixmatch();
      }).catch((e) => {
        status.textContent = `MusicBrainz lookup failed: ${e.message}`;
      });
    }
    anchor.after(panel);
    return panel;
  }

  // scripts/musicbrainz-work-lyrics-search/src/main.ts
  var VERSION = true ? "1.0.1" : "dev";
  var NAME_INPUT = "#id-edit-work\\.name";
  function pageInfo(doc, href) {
    let path;
    try {
      path = new URL(href).pathname;
    } catch {
      return null;
    }
    const title = doc.querySelector(NAME_INPUT)?.value ?? "";
    const mbid = mbidFromUrl(href);
    if (mbid) return { kind: "edit", mbid, title };
    if (path === "/work/create") return { kind: "create", mbid: null, title };
    return null;
  }
  function enhance(doc, deps) {
    if (doc.querySelector(`.${MARKER}`)) return "present";
    const info = pageInfo(doc, doc.location.href);
    if (!info) return "none";
    return enhancePage(doc, info, deps) ? "added" : "none";
  }
  function start() {
    const deps = {
      version: VERSION,
      sites: SITES,
      fetchText: (url, charset, emptyStatus) => gmFetchText(url, charset, GM_xmlhttpRequest, emptyStatus),
      lookupPeople: (mbid) => lookupWorkPeople(mbid, (url) => fetchJson(url)),
      hasLink: (url) => hasLink(document, url),
      addLink: (url) => addLink(document, url)
    };
    setInterval(() => enhance(document, deps), 1e3);
  }
  if (typeof window !== "undefined" && typeof document !== "undefined" && /(^|\.)musicbrainz\.org$/.test(window.location.hostname)) {
    start();
  }
})();
