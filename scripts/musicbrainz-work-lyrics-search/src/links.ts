const EDITOR = "#external-links-editor";

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function urlInputs(doc: Document): HTMLInputElement[] {
  return Array.from(doc.querySelectorAll<HTMLInputElement>(`${EDITOR} input[type=url]`));
}

/** URLs already in the external links editor: saved links and typed inputs. */
export function existingLinks(doc: Document): Set<string> {
  const urls = new Set<string>();
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>(`${EDITOR} a.url`))) {
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
 * Writes the URL into the empty url input the way a user would type it, then
 * waits up to one second for the editor to add a fresh empty input.
 */
export async function addLink(doc: Document, url: string, sleep: (ms: number) => Promise<void> = defaultSleep): Promise<boolean> {
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
