import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Json3 } from "../src/json3";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** A caption track fixture. asr-en holds the first events of the English track of omuJpoV-Ko4, captured on 2026-10-17. */
export function track(name: string): Json3 {
  return JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8")) as Json3;
}
