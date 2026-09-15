import { enhancePage, MARKER, type UiDeps } from "../src/ui";
import type { PageInfo, Site } from "../src/types";
import { createDocument, editDocument } from "./helpers";

const MBID = "d2364f4b-3c9a-4698-af3e-0ec10eb52cf8";
const editInfo: PageInfo = { kind: "edit", mbid: MBID, title: "Lemon" };
const createInfo: PageInfo = { kind: "create", mbid: null, title: "" };
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};
const q = <T extends Element>(root: ParentNode, cls: string) => root.querySelector<T>(`.${MARKER}-${cls}`)!;
const qa = (root: ParentNode, cls: string) => Array.from(root.querySelectorAll(`.${MARKER}-${cls}`));

const siteA: Site = {
  id: "a",
  name: "Site A",
  origin: "https://a.invalid",
  buildUrl: (qq) => `https://a.invalid/s?t=${encodeURIComponent(qq.title)}&ar=${encodeURIComponent(qq.artist)}`,
  parse: (doc, origin) =>
    Array.from(doc.querySelectorAll("li")).map((li) => ({
      url: `${origin}${li.getAttribute("data-url")}`,
      title: li.getAttribute("data-title") ?? "",
      artist: li.getAttribute("data-artist") ?? "",
      lyricist: li.getAttribute("data-lyricist") ?? "",
      composer: "",
    })),
};
const siteB: Site = { ...siteA, id: "b", name: "Site B", origin: "https://b.invalid", buildUrl: () => "https://b.invalid/s" };

const PAGE_A = `<ul>
<li data-url="/1" data-title="Lemonade" data-artist="aespa"></li>
<li data-url="/2" data-title="Lemon" data-artist="米津玄師" data-lyricist="米津玄師"></li>
<li data-url="/3" data-title="Lemon" data-artist="島津亜矢"></li>
</ul>`;

function deps(over: Partial<UiDeps> = {}) {
  const fetched: string[] = [];
  const added: string[] = [];
  const d: UiDeps = {
    version: "1.0.0",
    sites: [siteA, siteB],
    fetchText: async (url) => {
      fetched.push(url);
      return url.startsWith("https://a.invalid") ? PAGE_A : "<ul></ul>";
    },
    lookupPeople: async () => ({ artist: "米津玄師", lyricist: "米津玄師", composer: "米津玄師" }),
    hasLink: () => false,
    addLink: async (url) => {
      added.push(url);
      return true;
    },
    ...over,
  };
  return { d, fetched, added };
}

describe("enhancePage", () => {
  it("inserts the panel after the External links fieldset and returns null without it", () => {
    const doc = editDocument();
    const panel = enhancePage(doc, editInfo, deps().d)!;
    expect(panel.classList.contains(MARKER)).toBe(true);
    expect(panel.tagName).toBe("FIELDSET");
    const legends = Array.from(doc.querySelectorAll("fieldset > legend")).map((l) => l.textContent);
    expect(legends.indexOf("External links") + 1).toBe(legends.findIndex((t) => t!.startsWith("Lyrics search")));
    expect(q(panel, "legend").textContent).toBe("Lyrics search (1.0.0)");
    const doc2 = editDocument();
    doc2.querySelector("#external-links-editor")!.closest("fieldset")!.remove();
    expect(enhancePage(doc2, editInfo, deps().d)).toBeNull();
  });

  it("prefills the title at once and the people after the lookup, without overwriting typed text", async () => {
    const doc = editDocument();
    let resolvePeople: (p: { artist: string; lyricist: string; composer: string }) => void = () => {};
    const { d } = deps({ lookupPeople: () => new Promise((r) => (resolvePeople = r)) });
    const panel = enhancePage(doc, editInfo, d)!;
    expect(q<HTMLInputElement>(panel, "title").value).toBe("Lemon");
    expect(q(panel, "status").textContent).toBe("Looking up MusicBrainz…");
    q<HTMLInputElement>(panel, "artist").value = "typed";
    resolvePeople({ artist: "米津玄師", lyricist: "L", composer: "C" });
    await settle();
    expect(q<HTMLInputElement>(panel, "artist").value).toBe("typed");
    expect(q<HTMLInputElement>(panel, "lyricist").value).toBe("L");
    expect(q<HTMLInputElement>(panel, "composer").value).toBe("C");
    expect(q(panel, "status").textContent).toBe("");
  });

  it("reports a failed lookup with a Retry lookup button and does no lookup on the create page", async () => {
    const doc = editDocument();
    let fail = true;
    const { d } = deps({
      lookupPeople: async () => {
        if (fail) throw new Error("HTTP 503");
        return { artist: "A", lyricist: "L", composer: "C" };
      },
    });
    const panel = enhancePage(doc, editInfo, d)!;
    expect(q<HTMLButtonElement>(panel, "lookup-retry").hidden).toBe(true);
    await settle();
    expect(q(panel, "status").textContent).toBe("MusicBrainz lookup failed: HTTP 503");
    expect(q<HTMLButtonElement>(panel, "lookup-retry").hidden).toBe(false);
    fail = false;
    q<HTMLInputElement>(panel, "artist").value = "typed";
    q<HTMLButtonElement>(panel, "lookup-retry").click();
    expect(q(panel, "status").textContent).toBe("Looking up MusicBrainz…");
    expect(q<HTMLButtonElement>(panel, "lookup-retry").hidden).toBe(true);
    await settle();
    expect(q(panel, "status").textContent).toBe("");
    expect(q<HTMLInputElement>(panel, "artist").value).toBe("typed");
    expect(q<HTMLInputElement>(panel, "lyricist").value).toBe("L");
    expect(q<HTMLInputElement>(panel, "composer").value).toBe("C");
    let called = false;
    const panel2 = enhancePage(createDocument(), createInfo, deps({ lookupPeople: async () => ((called = true), { artist: "", lyricist: "", composer: "" }) }).d)!;
    await settle();
    expect(called).toBe(false);
    expect(q<HTMLInputElement>(panel2, "title").value).toBe("");
    expect(q(panel2, "status").textContent).toBe("");
  });

  it("keeps the Musixmatch link in step with title and artist", async () => {
    const doc = editDocument();
    const panel = enhancePage(doc, editInfo, deps().d)!;
    await settle();
    const link = q<HTMLAnchorElement>(panel, "musixmatch");
    expect(link.target).toBe("_blank");
    expect(link.href).toBe("https://www.musixmatch.com/search?query=Lemon%20%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB");
    const artist = q<HTMLInputElement>(panel, "artist");
    artist.value = "";
    artist.dispatchEvent(new doc.defaultView!.Event("input"));
    expect(link.href).toBe("https://www.musixmatch.com/search?query=Lemon");
  });

  it("searches every site with the current fields, ranks rows, and marks matched fields", async () => {
    const doc = editDocument();
    const { d, fetched } = deps();
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLInputElement>(panel, "composer").value = "";
    q<HTMLButtonElement>(panel, "search").click();
    expect(qa(panel, "site-status").map((s) => s.textContent)).toEqual(["Searching…", "Searching…"]);
    await settle();
    expect(fetched).toEqual(["https://a.invalid/s?t=Lemon&ar=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB", "https://b.invalid/s"]);
    const siteEl = panel.querySelector(`.${MARKER}-site[data-site="a"]`)!;
    expect(q(siteEl, "site-status").textContent).toBe("3 results");
    const rows = qa(siteEl, "row");
    expect(rows.map((r) => q<HTMLAnchorElement>(r, "link").href)).toEqual(["https://a.invalid/2", "https://a.invalid/3", "https://a.invalid/1"]);
    expect(rows[0].textContent).toContain("Lemon");
    expect(rows[0].textContent).toContain("米津玄師");
    expect(qa(rows[0], "hit").map((h) => h.textContent)).toEqual(["Lemon", "米津玄師", "米津玄師"]);
    expect(qa(rows[1], "hit").map((h) => h.textContent)).toEqual(["Lemon"]);
    expect(qa(rows[2], "hit").length).toBe(0);
    expect(q<HTMLAnchorElement>(rows[0], "link").target).toBe("_blank");
    expect(q<HTMLAnchorElement>(rows[0], "link").rel).toBe("noreferrer");
    const siteB2 = panel.querySelector(`.${MARKER}-site[data-site="b"]`)!;
    expect(q(siteB2, "site-status").textContent).toBe("No results");
  });

  it("passes the site's charset and emptyStatus to fetchText and shows No results for an empty body", async () => {
    const doc = editDocument();
    const args: unknown[][] = [];
    const siteC: Site = { ...siteA, id: "c", name: "Site C", charset: "shift_jis", emptyStatus: 404 };
    const { d } = deps({ sites: [siteC], fetchText: async (...a) => ((args.push(a), "")) });
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLButtonElement>(panel, "search").click();
    await settle();
    expect(args).toEqual([["https://a.invalid/s?t=Lemon&ar=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB", "shift_jis", 404]]);
    expect(q(panel, "site-status").textContent).toBe("No results");
  });

  it("says No results parsed for a long page without rows and ignores clicks while searching", async () => {
    const doc = editDocument();
    let count = 0;
    const { d } = deps({ fetchText: async () => ((count += 1), "<p>" + "x".repeat(1200) + "</p>") });
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLButtonElement>(panel, "search").click();
    q<HTMLButtonElement>(panel, "search").click();
    await settle();
    expect(count).toBe(2);
    expect(qa(panel, "site-status").map((s) => s.textContent)).toEqual(["No results parsed", "No results parsed"]);
  });

  it("shows Request failed with a Retry button that searches that site again", async () => {
    const doc = editDocument();
    let fail = true;
    const { d } = deps({
      fetchText: async (url) => {
        if (url.startsWith("https://b.invalid") && fail) throw new Error("Timed out");
        return url.startsWith("https://a.invalid") ? PAGE_A : "<ul></ul>";
      },
    });
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLButtonElement>(panel, "search").click();
    await settle();
    const siteB2 = panel.querySelector(`.${MARKER}-site[data-site="b"]`)!;
    expect(q(siteB2, "site-status").textContent).toBe("Request failed: Timed out");
    expect(q<HTMLButtonElement>(siteB2, "retry").hidden).toBe(false);
    const siteA2 = panel.querySelector(`.${MARKER}-site[data-site="a"]`)!;
    expect(q<HTMLButtonElement>(siteA2, "retry").hidden).toBe(true);
    fail = false;
    q<HTMLButtonElement>(siteB2, "retry").click();
    expect(q(siteB2, "site-status").textContent).toBe("Searching…");
    await settle();
    expect(q(siteB2, "site-status").textContent).toBe("No results");
    expect(q<HTMLButtonElement>(siteB2, "retry").hidden).toBe(true);
  });

  it("adds a row's URL, marks it added, and marks rows that are already linked", async () => {
    const doc = editDocument();
    const { d, added } = deps({ hasLink: (url) => url === "https://a.invalid/3" });
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLButtonElement>(panel, "search").click();
    await settle();
    const rows = qa(panel.querySelector(`.${MARKER}-site[data-site="a"]`)!, "row");
    expect(rows[1].querySelector(`.${MARKER}-add`)).toBeNull();
    expect(q(rows[1], "added").textContent).toBe("added");
    q<HTMLButtonElement>(rows[0], "add").click();
    await settle();
    expect(added).toEqual(["https://a.invalid/2"]);
    expect(rows[0].querySelector(`.${MARKER}-add`)).toBeNull();
    expect(q(rows[0], "added").textContent).toBe("added");
  });

  it("reports when adding fails and keeps the button", async () => {
    const doc = editDocument();
    const { d } = deps({ addLink: async () => false });
    const panel = enhancePage(doc, editInfo, d)!;
    await settle();
    q<HTMLButtonElement>(panel, "search").click();
    await settle();
    const row = qa(panel.querySelector(`.${MARKER}-site[data-site="a"]`)!, "row")[0];
    q<HTMLButtonElement>(row, "add").click();
    await settle();
    expect(q(panel, "status").textContent).toBe("Could not add, paste the URL by hand");
    expect(q<HTMLButtonElement>(row, "add").disabled).toBe(false);
  });
});
