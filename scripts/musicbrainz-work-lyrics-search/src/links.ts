const EDITOR = "#external-links-editor";

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function urlInputs(doc: Document): HTMLInputElement[] {
  return Array.from(doc.querySelectorAll<HTMLInputElement>(`${EDITOR} input[type=url]`));
}

/** The links the editor shows as a link, that is every link it has taken. */
function linkAnchors(doc: Document): HTMLAnchorElement[] {
  return Array.from(doc.querySelectorAll<HTMLAnchorElement>(`${EDITOR} a.url`));
}

/** URLs already in the external links editor: saved links and typed inputs. */
export function existingLinks(doc: Document): Set<string> {
  const urls = new Set<string>();
  for (const a of linkAnchors(doc)) {
    const href = normalizeUrl(a.getAttribute("href") ?? "");
    if (href) urls.add(href);
  }
  for (const input of urlInputs(doc)) {
    const v = normalizeUrl(input.value);
    if (v) urls.add(v);
  }
  return urls;
}

export function hasLink(doc: Document, url: string): boolean {
  return existingLinks(doc).has(normalizeUrl(url));
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Writes the URL into the empty url input the way a user would type it, then waits up to one second
 * for the editor to take it.
 *
 * The editor cleans the URL and replaces the input with a link when the input loses the focus, so
 * the focusout event is part of typing a link: without it the row stays a half typed input. The
 * editor can clean the URL into another form, so the wait accepts a new link as well as an input
 * that still holds the URL.
 */
export async function addLink(doc: Document, url: string, sleep: (ms: number) => Promise<void> = defaultSleep): Promise<boolean> {
  const win = doc.defaultView;
  const input = urlInputs(doc).find((i) => i.value === "");
  if (!win || !input) return false;
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
  if (!setter) return false;
  const links = linkAnchors(doc).length;
  setter.call(input, url);
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  input.dispatchEvent(new win.Event("focusout", { bubbles: true }));
  for (let i = 0; i < 10; i++) {
    const inputs = urlInputs(doc);
    const taken = linkAnchors(doc).length > links || inputs.some((x) => x.value === url);
    if (taken && inputs.some((x) => x.value === "")) return true;
    await sleep(100);
  }
  return false;
}
