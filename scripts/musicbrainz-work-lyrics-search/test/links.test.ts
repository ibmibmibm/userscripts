import { addLink, existingLinks, hasLink, normalizeUrl } from "../src/links";
import { createDocument, editDocument, emptyDocument } from "./helpers";

const JL = "https://j-lyric.net/artist/a04d770/l01afdb.html";
const NEW = "https://utaten.com/lyric/sa18020902/";

/** Makes the fixture editor behave like MusicBrainz: on input, add a new empty url input. */
function reactLikeEditor(doc: Document): void {
  doc.querySelector("#external-links-editor")!.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.value) return;
    const tr = doc.createElement("tr");
    tr.className = "external-link-item";
    tr.innerHTML = '<td></td><td class="link-actions"></td><td><input class="value with-button" placeholder="Add another link" type="url" value=""></td>';
    input.closest("tbody")!.appendChild(tr);
  });
}

/** MusicBrainz also cleans the URL on focus out and replaces the input with the link. */
function committingEditor(doc: Document, clean: (url: string) => string = (u) => u): void {
  reactLikeEditor(doc);
  doc.querySelector("#external-links-editor")!.addEventListener("focusout", (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.value) return;
    const a = doc.createElement("a");
    a.className = "url";
    a.setAttribute("href", clean(input.value));
    input.replaceWith(a);
  });
}

describe("existingLinks", () => {
  it("collects link hrefs and non-empty url inputs, without trailing slashes", () => {
    const doc = editDocument();
    expect(Array.from(existingLinks(doc))).toEqual([JL, "https://www.uta-net.com/song/96028"]);
    expect(hasLink(doc, JL)).toBe(true);
    expect(hasLink(doc, "https://www.uta-net.com/song/96028/")).toBe(true);
    expect(hasLink(doc, NEW)).toBe(false);
    expect(normalizeUrl(" https://x.invalid/a/ ")).toBe("https://x.invalid/a");
    expect(existingLinks(emptyDocument()).size).toBe(0);
  });
});

describe("addLink", () => {
  it("writes the URL into the empty input, fires input, and resolves true when the editor reacts", async () => {
    const doc = editDocument();
    reactLikeEditor(doc);
    await expect(addLink(doc, NEW, async () => {})).resolves.toBe(true);
    const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>("#external-links-editor input[type=url]")).map((i) => i.value);
    expect(inputs).toEqual([NEW, ""]);
    expect(hasLink(doc, NEW)).toBe(true);
  });

  it("fires focus out, so an editor that turns the input into a link takes the URL", async () => {
    const doc = editDocument();
    committingEditor(doc);
    await expect(addLink(doc, NEW, async () => {})).resolves.toBe(true);
    const hrefs = Array.from(doc.querySelectorAll("#external-links-editor a.url")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(NEW);
    const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>("#external-links-editor input[type=url]")).map((i) => i.value);
    expect(inputs).toEqual([""]);
    expect(hasLink(doc, NEW)).toBe(true);
  });

  it("counts a link the editor cleaned into another form as taken", async () => {
    const doc = editDocument();
    committingEditor(doc, (url) => url.replace("https://utaten.com/lyric/", "https://utaten.com/lyric/x/"));
    await expect(addLink(doc, NEW, async () => {})).resolves.toBe(true);
    expect(hasLink(doc, NEW)).toBe(false);
    expect(hasLink(doc, "https://utaten.com/lyric/x/sa18020902/")).toBe(true);
  });

  it("resolves false when the editor does not react or is missing", async () => {
    let waited = 0;
    await expect(addLink(editDocument(), NEW, async () => void waited++)).resolves.toBe(false);
    expect(waited).toBe(10);
    await expect(addLink(emptyDocument(), NEW, async () => {})).resolves.toBe(false);
  });

  it("works on the create page fixture", async () => {
    const doc = createDocument();
    committingEditor(doc);
    await expect(addLink(doc, NEW, async () => {})).resolves.toBe(true);
  });
});
