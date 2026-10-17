import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

describe("build", () => {
  it("writes one user.js file with the header, grants, and connect", () => {
    execFileSync("node", ["build.mjs", "youtube-timed-translation"], { stdio: "pipe" });
    const out = readFileSync("dist/youtube-timed-translation.user.js", "utf8");
    const header = readFileSync("scripts/youtube-timed-translation/header.txt", "utf8");
    expect(out.startsWith(header.trimEnd() + "\n")).toBe(true);
    for (const grant of ["GM_xmlhttpRequest", "GM_getValue", "GM_setValue", "GM_registerMenuCommand"]) {
      expect(out).toContain(`@grant        ${grant}`);
    }
    expect(out).toContain("@connect      translate.googleapis.com");
    expect(out).not.toContain("__VERSION__");
    expect(out).not.toContain("innerHTML");
  });
});
