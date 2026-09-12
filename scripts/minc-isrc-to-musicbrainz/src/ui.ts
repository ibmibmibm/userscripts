import { analyze, type Analysis } from "./analyze";
import { buildEditNote, buildMagicIsrcUrl, collectEntries } from "./magicisrc";
import { defaultMapping, mappingMarks, type DiscMapping } from "./mapping";
import { mbSearchUrl } from "./musicbrainz";
import { parseProductModal } from "./parser";
import type { MbReleaseHit, MincRelease } from "./types";

export interface UiDeps {
  version: string;
  search: (release: MincRelease) => Promise<MbReleaseHit[]>;
  open: (url: string) => void;
}

export const MARKER = "minc-isrc-mb";

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function mediaSummary(hit: MbReleaseHit): string {
  return hit.media.map((m) => `${m.format ?? "?"} ${m.trackCount}`).join(" + ");
}

interface State {
  release: MincRelease;
  analysis: Analysis;
  hit: MbReleaseHit | null;
  mapping: DiscMapping[];
}

export function enhanceModalBody(body: Element, deps: UiDeps): boolean {
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
  const state: State = { release, analysis, hit: null, mapping: [] };

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

  const setStatus = (msg: string) => {
    status.textContent = msg;
  };

  const readMapping = (): DiscMapping[] =>
    Array.from(mappingBox.querySelectorAll<HTMLTableRowElement>("tbody tr")).map((tr) => {
      const disc = Number(tr.dataset.disc);
      const box = tr.querySelector<HTMLInputElement>("input[type=checkbox]")!;
      const sel = tr.querySelector<HTMLSelectElement>("select");
      return { disc, included: box.checked, medium: sel ? Number(sel.value) : disc };
    });

  const renderWarnings = () => {
    warnings.textContent = "";
    const lines: string[] = [];
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
      const disc = release.discs.find((d) => d.position === m.disc)!;
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

  const choose = (hit: MbReleaseHit | null) => {
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

  const renderPicker = (hits: MbReleaseHit[], showSearchLink: boolean) => {
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
