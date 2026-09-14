import { rankRows } from "./rank";
import { MUSIXMATCH_SEARCH } from "./sites";
import { FIELDS, type Field, type PageInfo, type Query, type ScoredRow, type Site, type WorkPeople } from "./types";

export const MARKER = "mb-lyrics";

export interface UiDeps {
  version: string;
  sites: Site[];
  /** GET a lyrics site page through the userscript manager. */
  fetchText: (url: string, charset?: string) => Promise<string>;
  lookupPeople: (mbid: string) => Promise<WorkPeople>;
  /** True when the external links editor already holds the URL. */
  hasLink: (url: string) => boolean;
  /** Writes the URL into the external links editor; false when the editor did not react. */
  addLink: (url: string) => Promise<boolean>;
}

const LABELS: Record<Field, string> = { title: "Title", artist: "Artist", lyricist: "Lyricist", composer: "Composer" };

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
  panel.appendChild(el(doc, "legend", "legend", `Lyrics search (${deps.version})`));

  const fields = el(doc, "div", "fields");
  const inputs = {} as Record<Field, HTMLInputElement>;
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

  const query = (): Query => ({
    title: inputs.title.value.trim(),
    artist: inputs.artist.value.trim(),
    lyricist: inputs.lyricist.value.trim(),
    composer: inputs.composer.value.trim(),
  });
  const updateMusixmatch = () => {
    const q = query();
    musixmatch.href = `${MUSIXMATCH_SEARCH}?query=${encodeURIComponent([q.title, q.artist].filter(Boolean).join(" "))}`;
  };
  inputs.title.addEventListener("input", updateMusixmatch);
  inputs.artist.addEventListener("input", updateMusixmatch);
  updateMusixmatch();

  const views: SiteView[] = deps.sites.map((site) => {
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
      const text = await deps.fetchText(view.site.buildUrl(q), view.site.charset);
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

  if (info.mbid) {
    status.textContent = "Looking up MusicBrainz…";
    deps
      .lookupPeople(info.mbid)
      .then((people) => {
        for (const f of ["artist", "lyricist", "composer"] as const) {
          if (!inputs[f].value) inputs[f].value = people[f];
        }
        status.textContent = "";
        updateMusixmatch();
      })
      .catch((e: Error) => {
        status.textContent = `MusicBrainz lookup failed: ${e.message}`;
      });
  }

  anchor.after(panel);
  return panel;
}
