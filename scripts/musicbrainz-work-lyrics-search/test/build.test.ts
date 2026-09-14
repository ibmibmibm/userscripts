import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function versionFromHeader(header: string): string {
  const m = header.match(/^\/\/ @version\s+(\S+)/m);
  if (!m) throw new Error("header.txt has no @version line");
  return m[1];
}

describe("build", () => {
  it("writes one user.js file with the header, grants, and connects", () => {
    execFileSync("node", ["build.mjs", "musicbrainz-work-lyrics-search"], { stdio: "pipe" });
    const out = readFileSync("dist/musicbrainz-work-lyrics-search.user.js", "utf8");
    const header = readFileSync("scripts/musicbrainz-work-lyrics-search/header.txt", "utf8");
    const version = versionFromHeader(header);
    expect(out.startsWith(header.trimEnd() + "\n")).toBe(true);
    expect(out).toContain("@match        https://musicbrainz.org/work/*/edit*");
    expect(out).toContain("@match        https://musicbrainz.org/work/create*");
    expect(out).toContain("@grant        GM_xmlhttpRequest");
    for (const host of ["j-lyric.net", "utaten.com", "www.uta-net.com", "kashinavi.com", "petitlyrics.com", "www.joysound.com"]) {
      expect(out).toContain(`@connect      ${host}`);
    }
    expect(out).toContain(`"${version}"`);
    expect(out).not.toContain("__VERSION__");
  });
});
