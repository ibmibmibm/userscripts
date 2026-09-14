import { diffWork, isEmpty, type WorkDiff } from "./diff";
import { mapCredits, workKind, type SeedRel, type SkippedCredit, type WorkKind } from "./mapping";
import { MbNotFound, parseWorkRef } from "./musicbrainz";
import { displayTitle } from "./normalize";
import { buildCreateUrl, buildEditUrl, fitUrl } from "./seed";
import type { MbWork, WorkHit, WorkInfo } from "./types";

export const MARKER = "jasrac-minc-mb";

export interface UiDeps {
  version: string;
  searchByIswc: (iswc: string) => Promise<WorkHit[]>;
  searchByTitle: (title: string) => Promise<WorkHit[]>;
  lookupWork: (mbid: string) => Promise<MbWork>;
  /** Opens the URL in a new tab. Returns null only when the browser blocked the popup. */
  open: (url: string) => Window | null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (className) e.className = `${MARKER}-${className}`;
  if (text) e.textContent = text;
  return e;
}

interface State {
  seeds: SeedRel[];
  skipped: SkippedCredit[];
  kind: WorkKind;
  hits: WorkHit[];
  target: string | null;
  work: MbWork | null;
  diff: WorkDiff | null;
  seq: number;
  searching: boolean;
}

const PANEL_STYLE = "margin:8px 0;padding:8px;border:1px solid #999;background:#f7f7ff;color:#000;font-size:13px;line-height:1.5";

export function enhancePage(doc: Document, info: WorkInfo, deps: UiDeps): HTMLElement {
  const { rels, skipped } = mapCredits(info.credits);
  const state: State = {
    seeds: rels,
    skipped,
    kind: workKind(info.credits),
    hits: [],
    target: null,
    work: null,
    diff: null,
    seq: 0,
    searching: false,
  };

  const panel = el(doc, "div", "panel");
  panel.classList.add(MARKER);
  panel.style.cssText = PANEL_STYLE;

  const heading = el(doc, "div", "heading", `MusicBrainz (${deps.version})`);
  heading.style.fontWeight = "bold";

  const summary = el(doc, "div", "summary");
  const ids = [info.jasracCode && `JASRAC ${info.jasracCode}`, info.nextoneCode && `NexTone ${info.nextoneCode}`, info.iswc && `ISWC ${info.iswc}`]
    .filter((s): s is string => !!s)
    .join(" / ");
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
  const search = el(doc, "button", "search", "Search by title");
  search.type = "button";
  const status = el(doc, "span", "status");
  status.style.marginLeft = "8px";
  targetRow.append(ref, " ");
  if (info.iswc) targetRow.append(searchIswc, " ");
  targetRow.append(search, status);

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

  const setStatus = (msg: string, retry?: () => void) => {
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
    const lines: string[] = [];
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
      (err: unknown) => {
        if (seq !== state.seq) return;
        if (err instanceof MbNotFound) setStatus("Work not found");
        else setStatus(err instanceof Error ? err.message : String(err), runLookup);
      },
    );
  };

  const setTarget = (mbid: string | null) => {
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

  const runSearch = (kind: "iswc" | "title") => {
    if (state.searching) return;
    state.searching = true;
    const seq = ++state.seq;
    setStatus(kind === "iswc" ? "Searching MusicBrainz by ISWC…" : "Searching MusicBrainz by title…");
    const p = kind === "iswc" ? deps.searchByIswc(info.iswc!) : deps.searchByTitle(displayTitle(info.title));
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
      (err: unknown) => {
        state.searching = false;
        if (seq !== state.seq) return;
        setStatus(err instanceof Error ? err.message : String(err), () => runSearch(kind));
      },
    );
  };

  const startSearch = (kind: "iswc" | "title") => {
    if (state.searching) return;
    ref.value = "";
    setTarget(null);
    runSearch(kind);
  };
  searchIswc.addEventListener("click", () => startSearch("iswc"));
  search.addEventListener("click", () => startSearch("title"));

  const openUrl = (build: (note: string) => string) => {
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
