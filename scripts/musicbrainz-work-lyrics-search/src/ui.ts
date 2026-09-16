import { searchQuery } from "./query";
import { rankRows } from "./rank";
import { MUSIXMATCH_SEARCH } from "./sites";
import { FIELDS, type Field, type PageInfo, type Query, type ScoredRow, type Site, type WorkPeople } from "./types";

export const MARKER = "mb-lyrics";

export interface UiDeps {
  version: string;
  sites: Site[];
  /** GET a lyrics site page through the userscript manager. */
  fetchText: (url: string, charset?: string, emptyStatus?: number) => Promise<string>;
  lookupPeople: (mbid: string) => Promise<WorkPeople>;
  /** True when the external links editor already holds the URL. */
  hasLink: (url: string) => boolean;
  /** Writes the URL into the external links editor; false when the editor did not react. */
  addLink: (url: string) => Promise<boolean>;
}

const LABELS: Record<Field, string> = { title: "Title", artist: "Artist", lyricist: "Lyricist", composer: "Composer" };

/**
 * The panel brings its own styles instead of borrowing the MusicBrainz form styles, which give a
 * text input a fixed width wide enough to push the next label onto the line of the previous input.
 * Every rule names the panel class, so it wins over the page styles without !important.
 */
const STYLE = `
fieldset.${MARKER} .${MARKER}-fields {
  display: grid;
  grid-template-columns: max-content minmax(8em, 28em);
  gap: 4px 8px;
  align-items: center;
  margin: 4px 0 6px;
}
fieldset.${MARKER} .${MARKER}-fields > label {
  display: block;
  float: none;
  clear: none;
  width: auto;
  margin: 0;
  padding: 0;
  text-align: right;
  font-weight: normal;
}
fieldset.${MARKER} .${MARKER}-fields > input {
  display: block;
  float: none;
  width: 100%;
  margin: 0;
  box-sizing: border-box;
}
fieldset.${MARKER} .${MARKER}-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
fieldset.${MARKER} .${MARKER}-site {
  margin-top: 6px;
}
fieldset.${MARKER} .${MARKER}-site-name {
  font-weight: bold;
}
fieldset.${MARKER} .${MARKER}-site-status,
fieldset.${MARKER} .${MARKER}-retry {
  margin-left: 8px;
}
fieldset.${MARKER} .${MARKER}-rows {
  margin: 2px 0 0 16px;
  padding: 0;
  list-style: disc outside;
}
`;

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (className) e.className = `${MARKER}-${className}`;
  if (text) e.textContent = text;
  return e;
}

interface SiteView {
  site: Site;
  status: HTMLElement;
  retry: HTMLButtonElement;
  rows: HTMLUListElement;
  seq: number;
}

export function enhancePage(doc: Document, info: PageInfo, deps: UiDeps): HTMLElement | null {
  const editor = doc.querySelector("#external-links-editor");
  const anchor = editor?.closest("fieldset");
  if (!anchor) return null;

  const panel = el(doc, "fieldset", "panel");
  panel.classList.add(MARKER);
  // The legend stays the first child; a browser reads only that one as the caption of the fieldset.
  panel.appendChild(el(doc, "legend", "legend", `Lyrics search (${deps.version})`));
  panel.appendChild(el(doc, "style", "style", STYLE));

  const fields = el(doc, "div", "fields");
  const inputs = {} as Record<Field, HTMLInputElement>;
  for (const f of FIELDS) {
    const id = `${MARKER}-field-${f}`;
    const label = el(doc, "label", "", `${LABELS[f]}:`);
    label.htmlFor = id;
    const input = el(doc, "input", f);
    input.type = "text";
    input.id = id;
    fields.append(label, input);
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
  const status = el(doc, "span", "status");
  const lookupRetry = el(doc, "button", "lookup-retry", "Retry lookup");
  lookupRetry.type = "button";
  lookupRetry.hidden = true;
  controls.append(search, musixmatch, status, lookupRetry);
  panel.appendChild(controls);

  const query = (): Query => ({
    title: inputs.title.value.trim(),
    artist: inputs.artist.value.trim(),
    lyricist: inputs.lyricist.value.trim(),
    composer: inputs.composer.value.trim(),
  });
  const updateMusixmatch = () => {
    const q = searchQuery(query());
    musixmatch.href = `${MUSIXMATCH_SEARCH}?query=${encodeURIComponent([q.title, q.artist].filter(Boolean).join(" "))}`;
  };
  inputs.title.addEventListener("input", updateMusixmatch);
  inputs.artist.addEventListener("input", updateMusixmatch);
  updateMusixmatch();

  const views: SiteView[] = deps.sites.map((site) => {
    const box = el(doc, "div", "site");
    box.dataset.site = site.id;
    const name = el(doc, "span", "site-name", site.name);
    const siteStatus = el(doc, "span", "site-status");
    const retry = el(doc, "button", "retry", "Retry");
    retry.type = "button";
    retry.hidden = true;
    const rows = el(doc, "ul", "rows");
    box.append(name, siteStatus, retry, rows);
    panel.appendChild(box);
    const view: SiteView = { site, status: siteStatus, retry, rows, seq: 0 };
    retry.addEventListener("click", () => void searchSite(view, query()));
    return view;
  });

  function renderRow(scored: ScoredRow): HTMLLIElement {
    const li = el(doc, "li", "row");
    const link = el(doc, "a", "link");
    link.href = scored.row.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    const parts: Array<[Field, string]> = [
      ["title", ""],
      ["artist", ""],
      ["lyricist", "作詞 "],
      ["composer", "作曲 "],
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

  async function searchSite(view: SiteView, q: Query): Promise<void> {
    const seq = ++view.seq;
    view.retry.hidden = true;
    view.status.textContent = "Searching…";
    view.rows.replaceChildren();
    try {
      const text = await deps.fetchText(view.site.buildUrl(searchQuery(q)), view.site.charset, view.site.emptyStatus);
      if (seq !== view.seq) return;
      const parsed = new (doc.defaultView as Window & typeof globalThis).DOMParser().parseFromString(text, "text/html");
      const rows = view.site.parse(parsed, view.site.origin);
      if (rows.length === 0) {
        view.status.textContent = text.length > 1000 ? "No results parsed" : "No results";
        return;
      }
      view.status.textContent = `${rows.length} result${rows.length === 1 ? "" : "s"}`;
      for (const scored of rankRows(q, rows)) view.rows.appendChild(renderRow(scored));
    } catch (e) {
      if (seq !== view.seq) return;
      view.status.textContent = `Request failed: ${(e as Error).message}`;
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

  /** Fills the empty people fields from the web service; on failure offers a retry. */
  async function lookup(mbid: string): Promise<void> {
    lookupRetry.hidden = true;
    status.textContent = "Looking up MusicBrainz…";
    try {
      const people = await deps.lookupPeople(mbid);
      for (const f of ["artist", "lyricist", "composer"] as const) {
        if (!inputs[f].value) inputs[f].value = people[f];
      }
      status.textContent = "";
      updateMusixmatch();
    } catch (e) {
      status.textContent = `MusicBrainz lookup failed: ${e instanceof Error ? e.message : String(e)}`;
      lookupRetry.hidden = false;
    }
  }

  if (info.mbid) {
    const mbid = info.mbid;
    lookupRetry.addEventListener("click", () => void lookup(mbid));
    void lookup(mbid);
  }

  anchor.after(panel);
  return panel;
}
