import { build } from "esbuild";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPTS = "scripts";
const only = process.argv[2]; // optional: build one script folder by name

function versionFromHeader(header, name) {
  const m = header.match(/^\/\/ @version\s+(\S+)/m);
  if (!m) throw new Error(`${name}: header.txt has no @version line`);
  return m[1];
}

mkdirSync("dist", { recursive: true });
const names = readdirSync(SCRIPTS).filter((n) => !only || n === only);
let built = 0;
for (const name of names) {
  const dir = join(SCRIPTS, name);
  const entry = join(dir, "src", "main.ts");
  const headerPath = join(dir, "header.txt");
  if (!existsSync(entry) || !existsSync(headerPath)) continue;
  const header = readFileSync(headerPath, "utf8");
  const version = versionFromHeader(header, name);
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    target: "es2020",
    write: false,
    charset: "utf8",
    define: { __VERSION__: JSON.stringify(version) },
  });
  const out = join("dist", `${name}.user.js`);
  writeFileSync(out, header.trimEnd() + "\n" + result.outputFiles[0].text);
  console.log(`built ${out} (v${version})`);
  built += 1;
}
if (built === 0) throw new Error("no script folder with header.txt and src/main.ts found");
