import { DEFAULTS, installMenu, loadSettings, MAX_SCALE, MIN_SCALE, normalizeFont, normalizeScale, normalizeTarget, saveSettings, type Store } from "../src/settings";

function memoryStore(init: Record<string, unknown> = {}): Store {
  const data = new Map<string, unknown>(Object.entries(init));
  return {
    get: <T>(k: string, f: T): T => (data.has(k) ? (data.get(k) as T) : f),
    set: (k, v) => void data.set(k, v),
  };
}

describe("settings", () => {
  it("defaults to Traditional Chinese with the original line and the default font", () => {
    expect(loadSettings(memoryStore())).toEqual({ enabled: true, target: "zh-TW", showOriginal: true, fontFamily: "", fontScale: 1 });
  });

  it("saves and loads every field", () => {
    const store = memoryStore();
    const settings = { enabled: false, target: "ja", showOriginal: false, fontFamily: "Noto Serif TC", fontScale: 1.5 };
    saveSettings(store, settings);
    expect(loadSettings(store)).toEqual(settings);
  });

  it("replaces stored values that are not valid", () => {
    const store = memoryStore({ target: "Chinese", fontFamily: 3, fontScale: "big" });
    expect(loadSettings(store)).toEqual(DEFAULTS);
  });

  it("accepts language codes only", () => {
    expect(normalizeTarget(" zh-TW ")).toBe("zh-TW");
    expect(normalizeTarget("fil")).toBe("fil");
    expect(normalizeTarget("Chinese")).toBeNull();
    expect(normalizeTarget("")).toBeNull();
  });

  it("removes the characters that end a CSS value from a font name", () => {
    expect(normalizeFont('  Noto  "Sans" TC; } ')).toBe("Noto Sans TC");
  });

  it("keeps the size factor between MIN_SCALE and MAX_SCALE in steps of 0.1", () => {
    expect(normalizeScale("1.26")).toBe(1.3);
    expect(normalizeScale(0.1)).toBe(MIN_SCALE);
    expect(normalizeScale(9)).toBe(MAX_SCALE);
    expect(normalizeScale("")).toBe(1);
    expect(normalizeScale(null)).toBe(1);
  });

  it("puts one item in the menu that opens the panel", () => {
    const items: [string, () => void][] = [];
    let opened = 0;
    installMenu({ register: (label, onClick) => items.push([label, onClick]) }, () => opened++);
    expect(items.map(([l]) => l)).toEqual(["Timed translation configuration"]);
    items[0][1]();
    expect(opened).toBe(1);
  });
});
