// ==UserScript==
// @name         MINC ISRC to MusicBrainz
// @namespace    https://github.com/ibmibmibm/userscripts
// @version      1.0.0
// @description  Submit ISRCs from MINC (音楽権利情報検索ナビ) CD product details to MusicBrainz through MagicISRC
// @author       Shen-Ta Hsieh
// @downloadURL  https://github.com/ibmibmibm/userscripts/raw/main/dist/minc-isrc-to-musicbrainz.user.js
// @updateURL    https://github.com/ibmibmibm/userscripts/raw/main/dist/minc-isrc-to-musicbrainz.user.js
// @match        https://www.minc.or.jp/product/list*
// @match        https://www.minc.or.jp/music/list*
// @grant        none
// @run-at       document-end
// ==/UserScript==
"use strict";
(() => {
  // scripts/minc-isrc-to-musicbrainz/src/musicbrainz.ts
  var WS = "https://musicbrainz.org/ws/2/release/";
  function catnoForQuery(catalogNumber) {
    return catalogNumber.split("/")[0].trim();
  }
  function luceneQuote(s) {
    return '"' + s.replace(/(["\\])/g, "\\$1") + '"';
  }
  function buildQueries(release) {
    const queries = [];
    if (release.barcode) queries.push(`barcode:${release.barcode}`);
    const catno = catnoForQuery(release.catalogNumber);
    if (catno.length > 0) queries.push(`catno:${luceneQuote(catno)}`);
    return queries;
  }
  function str(v) {
    return typeof v === "string" && v.length > 0 ? v : null;
  }
  function toReleaseHit(json) {
    const j = json ?? {};
    const credits = Array.isArray(j["artist-credit"]) ? j["artist-credit"] : [];
    const artist = credits.map((c) => `${str(c.name) ?? ""}${str(c.joinphrase) ?? ""}`).join("");
    const labelInfo = Array.isArray(j["label-info"]) ? j["label-info"] : [];
    const catalogNumbers = labelInfo.map((li) => str(li["catalog-number"])).filter((c) => c !== null);
    const mediaJson = Array.isArray(j.media) ? j.media : [];
    const media = mediaJson.map((m, i) => ({
      position: typeof m.position === "number" ? m.position : i + 1,
      format: str(m.format),
      trackCount: typeof m["track-count"] === "number" ? m["track-count"] : 0
    }));
    return {
      mbid: str(j.id) ?? "",
      title: str(j.title) ?? "",
      artist,
      date: str(j.date),
      country: str(j.country),
      catalogNumbers,
      barcode: str(j.barcode),
      media
    };
  }
  async function runQuery(query, fetchFn) {
    const url = `${WS}?fmt=json&limit=25&query=${encodeURIComponent(query)}`;
    const res = await fetchFn(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15e3) });
    if (!res.ok) throw new Error(`MusicBrainz responded with HTTP ${res.status}`);
    const body = await res.json();
    const releases = Array.isArray(body.releases) ? body.releases : [];
    return releases.map(toReleaseHit);
  }
  async function searchReleases(release, fetchFn = fetch) {
    for (const query of buildQueries(release)) {
      let hits = await runQuery(query, fetchFn);
      if (query.startsWith("barcode:") && release.barcode) {
        hits = hits.filter((h) => h.barcode === release.barcode);
      }
      if (hits.length > 0) return hits;
    }
    return [];
  }
  function mbSearchUrl(catalogNumber) {
    const q = `catno:${luceneQuote(catnoForQuery(catalogNumber))}`;
    return `https://musicbrainz.org/search?type=release&method=advanced&query=${encodeURIComponent(q)}`;
  }

  // scripts/minc-isrc-to-musicbrainz/src/analyze.ts
  function analyze(release) {
    const seen = /* @__PURE__ */ new Map();
    const tracksWithoutIsrc = [];
    const submittableDiscs = [];
    for (const disc of release.discs) {
      let count = 0;
      for (const track of disc.tracks) {
        if (track.isrc === null) {
          tracksWithoutIsrc.push({ disc: disc.position, track: track.position, title: track.title });
          continue;
        }
        count += 1;
        const where = seen.get(track.isrc) ?? [];
        where.push(`Disc ${disc.position} track ${track.position}`);
        seen.set(track.isrc, where);
      }
      if (count > 0) submittableDiscs.push(disc.position);
    }
    const duplicateIsrcs = Array.from(seen.entries()).filter(([, where]) => where.length > 1).map(([isrc, where]) => ({ isrc, where }));
    return { duplicateIsrcs, tracksWithoutIsrc, submittableDiscs };
  }

  // scripts/minc-isrc-to-musicbrainz/src/magicisrc.ts
  function mincProductUrl(catalogNumber) {
    return `https://www.minc.or.jp/product/list/?dn=${encodeURIComponent(catalogNumber)}&type=search-form-diskno`;
  }
  function collectEntries(release, mapping) {
    const entries = [];
    for (const m of mapping) {
      if (!m.included) continue;
      const disc = release.discs.find((d) => d.position === m.disc);
      if (!disc) continue;
      for (const t of disc.tracks) {
        if (t.isrc !== null) entries.push({ medium: m.medium, track: t.position, isrc: t.isrc });
      }
    }
    return entries;
  }
  function buildEditNote(release, version) {
    return `ISRCs from MINC (音楽権利情報検索ナビ) for 品番 ${release.catalogNumber}, POS ${release.barcode ?? "none"}
${mincProductUrl(release.catalogNumber)}
via MINC ISRC to MusicBrainz v${version}`;
  }
  function buildMagicIsrcUrl(input) {
    const params = new URLSearchParams();
    if (input.mbid) params.set("musicbrainzid", input.mbid);
    const seen = /* @__PURE__ */ new Set();
    for (const e of input.entries) {
      const key = `isrc${e.medium}-${e.track}`;
      if (seen.has(key)) throw new Error(`Duplicate ISRC slot ${key}`);
      seen.add(key);
      params.set(key, e.isrc);
    }
    params.set("edit-note", input.editNote);
    return `https://magicisrc.kepstin.ca/?${params.toString()}`;
  }

  // scripts/minc-isrc-to-musicbrainz/src/mapping.ts
  function isVideoFormat(format) {
    return format !== null && /dvd|blu-?ray|vhs|video/i.test(format);
  }
  function mbKind(format) {
    return isVideoFormat(format) ? "video" : "audio";
  }
  function defaultMapping(release, analysis, hit) {
    const mediaCount = hit ? hit.media.length : 0;
    return analysis.submittableDiscs.map((discPos) => {
      const disc = release.discs.find((d) => d.position === discPos);
      let medium = discPos;
      let included = disc.kind === "audio";
      if (hit) {
        medium = mediaCount === 0 ? discPos : Math.min(discPos, mediaCount);
        if (mediaCount > 0 && discPos > mediaCount) included = false;
      }
      return { disc: discPos, included, medium };
    });
  }
  function mappingMarks(release, mapping, hit) {
    if (!hit) return [];
    const marks = [];
    const needed = mapping.length;
    if (hit.media.length < needed) {
      const plural = hit.media.length === 1 ? "medium" : "media";
      marks.push(`MusicBrainz release has ${hit.media.length} ${plural} but minc has ${needed} discs with ISRCs`);
    }
    const includedByMedium = /* @__PURE__ */ new Map();
    for (const m of mapping) {
      if (!m.included) continue;
      const discs = includedByMedium.get(m.medium) ?? [];
      discs.push(m.disc);
      includedByMedium.set(m.medium, discs);
    }
    for (const medium of Array.from(includedByMedium.keys()).sort((a, b) => a - b)) {
      const discs = includedByMedium.get(medium).slice().sort((a, b) => a - b);
      if (discs.length < 2) continue;
      const verb = discs.length === 2 ? "are both mapped" : "are all mapped";
      const discList = discs.map((d) => `Disc ${d}`).join(" and ");
      marks.push(`${discList} ${verb} to medium ${medium}; only one disc's ISRCs can be sent per medium`);
    }
    for (const m of mapping) {
      if (!m.included) continue;
      const disc = release.discs.find((d) => d.position === m.disc);
      const medium = hit.media.find((x) => x.position === m.medium);
      if (!medium) continue;
      const problems = [];
      if (medium.trackCount !== disc.tracks.length) problems.push("track count differs");
      if (mbKind(medium.format) !== disc.kind) problems.push("kind differs");
      if (problems.length > 0) {
        marks.push(
          `Disc ${disc.position} (${disc.format}, ${disc.tracks.length} tracks) is mapped to medium ${medium.position} (${medium.format ?? "unknown format"}, ${medium.trackCount} tracks): ${problems.join(", ")}`
        );
      }
    }
    return marks;
  }

  // scripts/minc-isrc-to-musicbrainz/src/parser.ts
  var ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
  function isValidIsrc(s) {
    return ISRC_RE.test(s);
  }
  function text(el2) {
    return (el2?.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  function matchGroup(src, re) {
    const m = src.match(re);
    return m && m[1] !== void 0 ? m[1] : null;
  }
  function toInt(s) {
    if (s === null || s === "") return null;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
  }
  function discKind(format) {
    return /dvd|blu-?ray/i.test(format) ? "video" : "audio";
  }
  function parseDisc(wrapper, position) {
    const table = wrapper.querySelector("table.cd-detail2-track-list");
    if (!table) return null;
    let format = "CD";
    let catalogNumber = null;
    const diskData = wrapper.querySelector(".disk_data");
    if (diskData) {
      const t = text(diskData).normalize("NFKC");
      const f = matchGroup(t, /形態:\s*(.+?)\s*(?:カタログ番号|収録曲数|$)/);
      if (f && f.length > 0) format = f;
      catalogNumber = matchGroup(t, /カタログ番号:\s*(.+?)\s*(?:収録曲数|収録時間|Discタイトル|$)/);
      if (catalogNumber === "") catalogNumber = null;
    }
    const tracks = [];
    for (const tr of Array.from(table.querySelectorAll("tr"))) {
      const orderCell = tr.querySelector('td[data-th="曲順"]');
      if (!orderCell) continue;
      const pos = toInt(text(orderCell));
      if (pos === null) continue;
      const rawIsrc = text(tr.querySelector('td[data-th="ISRC"]')).toUpperCase();
      tracks.push({
        position: pos,
        title: text(tr.querySelector('td[data-th="曲名"]')),
        isrc: isValidIsrc(rawIsrc) ? rawIsrc : null
      });
    }
    return { position, format, kind: discKind(format), catalogNumber, tracks };
  }
  function parseProductModal(modalBody) {
    const detail = modalBody.querySelector(".detail_data");
    if (!detail) return null;
    const wrappers = Array.from(modalBody.querySelectorAll(".table_wrapper"));
    const discs = [];
    for (const w of wrappers) {
      const d = parseDisc(w, discs.length + 1);
      if (d) discs.push(d);
    }
    if (discs.length === 0) return null;
    const modal = modalBody.closest(".modal") ?? modalBody.parentElement;
    const title = text(modal?.querySelector(".modal-title") ?? null);
    const header = text(detail);
    const catalogNumber = matchGroup(header, /品番：\s*(.+?)\s*(?:発売日|税抜価格|ジャンル|POS|$)/) ?? "";
    const barcodeRaw = matchGroup(header, /POS：\s*(\d*)/);
    const barcode = barcodeRaw && barcodeRaw.length > 0 ? barcodeRaw : null;
    return {
      title,
      catalogNumber,
      barcode,
      discCount: toInt(matchGroup(header, /セット数：\s*(\d+)/)),
      trackCount: toInt(matchGroup(header, /収録曲数：\s*(\d+)/)),
      discs
    };
  }

  // scripts/minc-isrc-to-musicbrainz/src/ui.ts
  var MARKER = "minc-isrc-mb";
  function el(doc, tag, className = "", text2 = "") {
    const e = doc.createElement(tag);
    if (className) e.className = className;
    if (text2) e.textContent = text2;
    return e;
  }
  function mediaSummary(hit) {
    return hit.media.map((m) => `${m.format ?? "?"} ${m.trackCount}`).join(" + ");
  }
  function enhanceModalBody(body, deps) {
    if (body.classList.contains(MARKER)) return false;
    body.classList.add(MARKER);
    const release = parseProductModal(body);
    const detail = body.querySelector(".detail_data");
    if (!release || !detail) {
      console.debug("[minc-isrc-mb] no track table in modal");
      return false;
    }
    const doc = body.ownerDocument;
    const analysis = analyze(release);
    const state = { release, analysis, hit: null, mapping: [] };
    const ui = el(doc, "div", "minc-isrc-mb-ui");
    ui.style.cssText = "clear:both;padding-top:8px";
    const submit = el(doc, "button", "btn btn-primary btn-sm minc-isrc-mb-submit", "Submit ISRCs to MusicBrainz");
    submit.type = "button";
    const status = el(doc, "span", "minc-isrc-mb-status");
    status.style.marginLeft = "8px";
    const picker = el(doc, "div", "minc-isrc-mb-picker");
    picker.hidden = true;
    const mappingBox = el(doc, "div", "minc-isrc-mb-mapping");
    mappingBox.hidden = true;
    const warnings = el(doc, "div", "minc-isrc-mb-warnings");
    const open = el(doc, "button", "btn btn-success btn-sm minc-isrc-mb-open", "Open MagicISRC");
    open.type = "button";
    open.hidden = true;
    ui.append(submit, status, picker, mappingBox, warnings, open);
    detail.appendChild(ui);
    if (analysis.submittableDiscs.length === 0) {
      submit.disabled = true;
      status.textContent = "No ISRC in this product";
      return true;
    }
    const setStatus = (msg) => {
      status.textContent = msg;
    };
    const readMapping = () => Array.from(mappingBox.querySelectorAll("tbody tr")).map((tr) => {
      const disc = Number(tr.dataset.disc);
      const box = tr.querySelector("input[type=checkbox]");
      const sel = tr.querySelector("select");
      return { disc, included: box.checked, medium: sel ? Number(sel.value) : disc };
    });
    const renderWarnings = () => {
      warnings.textContent = "";
      const lines = [];
      for (const d of analysis.duplicateIsrcs) lines.push(`Warning: ISRC ${d.isrc} appears on ${d.where.join(" and ")}`);
      for (const m of mappingMarks(release, state.mapping, state.hit)) lines.push(`Warning: ${m}`);
      if (analysis.tracksWithoutIsrc.length > 0) {
        const list = analysis.tracksWithoutIsrc.map((t) => `Disc ${t.disc} track ${t.track}`).join(", ");
        lines.push(`Note: ${analysis.tracksWithoutIsrc.length} track(s) without ISRC will be skipped: ${list}`);
      }
      for (const line of lines) {
        const p = el(doc, "div", line.startsWith("Warning") ? "text-danger" : "text-muted", line);
        warnings.appendChild(p);
      }
    };
    const renderMapping = () => {
      mappingBox.textContent = "";
      const table = el(doc, "table", "table table-condensed");
      table.style.marginTop = "8px";
      const thead = el(doc, "thead");
      const hr = el(doc, "tr");
      for (const h of ["Include", "minc disc", "MusicBrainz medium"]) hr.appendChild(el(doc, "th", "", h));
      thead.appendChild(hr);
      const tbody = el(doc, "tbody");
      for (const m of state.mapping) {
        const disc = release.discs.find((d) => d.position === m.disc);
        const tr = el(doc, "tr");
        tr.dataset.disc = String(m.disc);
        const tdInc = el(doc, "td");
        const box = el(doc, "input");
        box.type = "checkbox";
        box.checked = m.included;
        box.addEventListener("change", () => {
          state.mapping = readMapping();
          renderWarnings();
        });
        tdInc.appendChild(box);
        const isrcCount = disc.tracks.filter((t) => t.isrc !== null).length;
        const tdDisc = el(doc, "td", "", `Disc ${disc.position} ${disc.format}, ${disc.tracks.length} tracks, ${isrcCount} ISRCs`);
        const tdMed = el(doc, "td");
        if (state.hit && state.hit.media.length > 0) {
          const sel = el(doc, "select");
          for (const med of state.hit.media) {
            const opt = el(doc, "option", "", `Medium ${med.position}: ${med.format ?? "?"}, ${med.trackCount} tracks`);
            opt.value = String(med.position);
            sel.appendChild(opt);
          }
          sel.value = String(m.medium);
          sel.addEventListener("change", () => {
            state.mapping = readMapping();
            renderWarnings();
          });
          tdMed.appendChild(sel);
        } else {
          tdMed.textContent = `Medium ${m.medium} (by position)`;
        }
        tr.append(tdInc, tdDisc, tdMed);
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      mappingBox.appendChild(table);
      mappingBox.hidden = false;
      renderWarnings();
      open.hidden = false;
    };
    const choose = (hit) => {
      state.hit = hit;
      state.mapping = defaultMapping(release, analysis, hit);
      picker.hidden = true;
      setStatus(hit ? `Release: ${hit.title} (${hit.date ?? "no date"})` : "No MusicBrainz release chosen");
      renderMapping();
    };
    const noMbidButton = () => {
      const b = el(doc, "button", "btn btn-default btn-xs minc-isrc-mb-nombid", "No MBID, paste it in MagicISRC");
      b.type = "button";
      b.addEventListener("click", () => choose(null));
      return b;
    };
    const renderPicker = (hits, showSearchLink) => {
      picker.textContent = "";
      const list = el(doc, "ul", "list-unstyled");
      for (const h of hits) {
        const li = el(doc, "li");
        const use = el(doc, "button", "btn btn-default btn-xs minc-isrc-mb-use", "Use this");
        use.type = "button";
        use.addEventListener("click", () => choose(h));
        const dateSegment = `${h.date ?? "no date"}${h.country ? ` ${h.country}` : ""}`;
        const catalogSegment = h.catalogNumbers.length > 0 ? h.catalogNumbers.join(", ") : "";
        const segments = [h.title, h.artist, dateSegment, catalogSegment, mediaSummary(h)];
        const desc = ` ${segments.filter(Boolean).join(" — ")}`;
        li.append(use, doc.createTextNode(desc));
        list.appendChild(li);
      }
      const last = el(doc, "li");
      last.appendChild(noMbidButton());
      if (showSearchLink) {
        const a = el(doc, "a", "", " Search MusicBrainz by catalog number");
        a.href = mbSearchUrl(release.catalogNumber);
        a.target = "_blank";
        a.rel = "noopener";
        last.append(doc.createTextNode(" "), a);
      }
      list.appendChild(last);
      picker.appendChild(list);
      picker.hidden = false;
    };
    submit.addEventListener("click", async () => {
      submit.disabled = true;
      open.hidden = true;
      mappingBox.hidden = true;
      warnings.textContent = "";
      picker.hidden = true;
      picker.textContent = "";
      setStatus("Searching MusicBrainz...");
      try {
        const hits = await deps.search(release);
        if (hits.length === 1) choose(hits[0]);
        else if (hits.length === 0) {
          setStatus("No MusicBrainz release found");
          renderPicker([], true);
        } else {
          setStatus(`${hits.length} MusicBrainz releases found, pick one`);
          renderPicker(hits, false);
        }
      } catch (e) {
        setStatus(`MusicBrainz lookup failed (${e instanceof Error ? e.message : String(e)}). Try again.`);
        renderPicker([], false);
      } finally {
        submit.disabled = false;
      }
    });
    open.addEventListener("click", () => {
      state.mapping = readMapping();
      const entries = collectEntries(release, state.mapping);
      try {
        const url = buildMagicIsrcUrl({ mbid: state.hit?.mbid ?? null, editNote: buildEditNote(release, deps.version), entries });
        deps.open(url);
      } catch (e) {
        setStatus(`MagicISRC URL not built (${e instanceof Error ? e.message : String(e)})`);
      }
    });
    return true;
  }

  // scripts/minc-isrc-to-musicbrainz/src/main.ts
  function enhanceOpenModals(doc, deps) {
    let count = 0;
    const bodies = doc.querySelectorAll(`.modal.in .modal-body:not(.${MARKER})`);
    for (const body of Array.from(bodies)) {
      if (!body.querySelector(".detail_data") || !body.querySelector("table.cd-detail2-track-list")) continue;
      if (enhanceModalBody(body, deps)) count += 1;
    }
    return count;
  }
  function start() {
    const deps = {
      version: true ? "1.0.0" : "dev",
      search: (release) => searchReleases(release),
      open: (url) => {
        window.open(url, "_blank", "noopener");
      }
    };
    setInterval(() => enhanceOpenModals(document, deps), 1e3);
  }
  if (typeof window !== "undefined" && typeof document !== "undefined" && /minc\.or\.jp$/.test(window.location.hostname)) {
    start();
  }
})();
