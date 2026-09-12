import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

function html(name: string): string {
  return readFileSync(`${FIXTURES}${name}.html`, "utf8");
}

/** A J-WID work detail page. The fixture is the page's <main> element. */
export function jwidDocument(name: string): Document {
  const dom = new JSDOM(`<!doctype html><html><body>${html(name)}</body></html>`, {
    url: `https://www2.jasrac.or.jp/eJwid/main?trxID=F20101&WORKS_CD=${name.replace("jwid-", "")}&subSessionID=001&subSession=start`,
  });
  return dom.window.document;
}

/** A minc work detail page. The fixture is the page's <body> element. */
export function mincDocument(name: string): Document {
  const m = name.match(/^minc-(\d{8})(?:-(N\d{8}))?$/)!;
  const dom = new JSDOM(`<!doctype html><html>${html(name)}</html>`, {
    url: `https://www.minc.or.jp/saku/detail/?jcd=${m[1]}&ncd=${m[2] ?? ""}&refer=music/list-work`,
  });
  return dom.window.document;
}

/** An empty document for negative tests. */
export function emptyDocument(url = "https://example.invalid/"): Document {
  return new JSDOM("<!doctype html><html><body></body></html>", { url }).window.document;
}

/** Parsed MusicBrainz fixture JSON. */
export function mbJson(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8"));
}
