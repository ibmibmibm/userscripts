import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function versionFromHeader(header: string): string {
  const m = header.match(/^\/\/ @version\s+(\S+)/m);
  if (!m) throw new Error("header.txt has no @version line");
  return m[1];
}

describe("build", () => {
  it("writes one user.js file with the header and version", () => {
    execFileSync("node", ["build.mjs", "minc-isrc-to-musicbrainz"], { stdio: "pipe" });
    const out = readFileSync("dist/minc-isrc-to-musicbrainz.user.js", "utf8");
    const header = readFileSync("scripts/minc-isrc-to-musicbrainz/header.txt", "utf8");
    const version = versionFromHeader(header);
    expect(out.startsWith(header.trimEnd() + "\n")).toBe(true);
    expect(out).toContain(`// @version      ${version}`);
    expect(out).toContain("@namespace    https://github.com/ibmibmibm/userscripts");
    expect(out).toContain("@downloadURL  https://github.com/ibmibmibm/userscripts/raw/main/dist/minc-isrc-to-musicbrainz.user.js");
    expect(out).toContain("@match        https://www.minc.or.jp/product/list*");
    expect(out).toContain("@match        https://www.minc.or.jp/music/list*");
    expect(out).toContain("@grant        none");
    expect(out).toContain(`"${version}"`);
    expect(out).not.toContain("__VERSION__");
  });
});
