import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { TimedTranslation } from "../src/main";
import { DEFAULTS, type Settings } from "../src/settings";
import type { Translator } from "../src/translate";
import { FIXTURES } from "./helpers";

const VIDEO = "omuJpoV-Ko4";
const REQUEST = `https://www.youtube.com/api/timedtext?v=${VIDEO}&lang=en&kind=asr&pot=TOKEN&tlang=zh-Hant`;
const BODY = readFileSync(`${FIXTURES}asr-en.json`, "utf8");
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

/** A started app with a fake caption observer, a fetch that answers when told, and a translator that records its targets. */
function setup(init: Partial<Settings> = {}) {
  const doc = new JSDOM(`<!doctype html><div id="movie_player"></div>`, { url: `https://www.youtube.com/watch?v=${VIDEO}` }).window.document;
  let report: (url: string) => void = () => {};
  vi.stubGlobal(
    "PerformanceObserver",
    class {
      constructor(callback: (list: { getEntries(): { name: string }[] }) => void) {
        report = (name) => callback({ getEntries: () => [{ name }] });
      }
      observe() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const answers: (() => void)[] = [];
  const fetched: string[] = [];
  vi.stubGlobal("fetch", (url: string) => {
    fetched.push(url);
    return new Promise((resolve) => answers.push(() => resolve(new Response(BODY))));
  });
  const targets: string[] = [];
  const translator: Translator = {
    async translate(lines, target) {
      targets.push(target);
      return lines.map((l) => `${target}:${l}`);
    },
  };
  const settings = { ...DEFAULTS, ...init };
  const app = new TimedTranslation(doc, settings, translator, () => {});
  app.start();
  return { app, report, answers, fetched, targets };
}

describe("TimedTranslation", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads the original track of the player's request and translates it", async () => {
    const { report, answers, fetched, targets } = setup();
    report(REQUEST);
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).not.toContain("tlang");
    expect(fetched[0]).toContain("fmt=json3");
    answers[0]();
    await settle();
    expect(targets).toEqual(["zh-TW"]);
  });

  it("translates into the new language when the user changes it while the track loads", async () => {
    const { app, report, answers, targets } = setup();
    report(REQUEST);
    app.change({ target: "ja" });
    answers[0]();
    await settle();
    expect(targets).toEqual(["ja"]);
  });

  it("loads the last caption request when the user turns the script on", async () => {
    const { app, report, answers, fetched, targets } = setup({ enabled: false });
    report(REQUEST);
    expect(fetched).toHaveLength(0);
    app.change({ enabled: true });
    expect(fetched).toHaveLength(1);
    answers[0]();
    await settle();
    expect(targets).toEqual(["zh-TW"]);
  });

  it("ignores the caption request of another video", () => {
    const { report, fetched } = setup();
    report(REQUEST.replace(VIDEO, "adVideo0000"));
    expect(fetched).toHaveLength(0);
  });
});
