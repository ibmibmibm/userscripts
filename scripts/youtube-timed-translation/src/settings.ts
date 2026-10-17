export interface Settings {
  enabled: boolean;
  target: string;
  showOriginal: boolean;
  /** A font family name, or "" for the default font list. */
  fontFamily: string;
  /** A factor for the text size, from MIN_SCALE to MAX_SCALE. */
  fontScale: number;
}

export const DEFAULTS: Settings = { enabled: true, target: "zh-TW", showOriginal: true, fontFamily: "", fontScale: 1 };

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2;

export interface Store {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export function loadSettings(store: Store): Settings {
  const target = store.get<unknown>("target", DEFAULTS.target);
  const fontFamily = store.get<unknown>("fontFamily", DEFAULTS.fontFamily);
  return {
    enabled: store.get<unknown>("enabled", DEFAULTS.enabled) !== false,
    target: (typeof target === "string" && normalizeTarget(target)) || DEFAULTS.target,
    showOriginal: store.get<unknown>("showOriginal", DEFAULTS.showOriginal) !== false,
    fontFamily: typeof fontFamily === "string" ? normalizeFont(fontFamily) : DEFAULTS.fontFamily,
    fontScale: normalizeScale(store.get<unknown>("fontScale", DEFAULTS.fontScale)),
  };
}

export function saveSettings(store: Store, settings: Settings): void {
  store.set("enabled", settings.enabled);
  store.set("target", settings.target);
  store.set("showOriginal", settings.showOriginal);
  store.set("fontFamily", settings.fontFamily);
  store.set("fontScale", settings.fontScale);
}

/** A language code that Google Translate takes: "zh-TW", "ja", "en", "pt-BR", "fil" and the like. */
export function normalizeTarget(input: string): string | null {
  const code = input.trim();
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?$/.test(code) ? code : null;
}

/** A font family name without quotes, backslashes, or the characters that end a CSS value. */
export function normalizeFont(input: string): string {
  return input.replace(/["'\\;{}<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** A text size factor in steps of 0.1 between MIN_SCALE and MAX_SCALE. */
export function normalizeScale(input: unknown): number {
  const n = typeof input === "number" ? input : Number(input);
  if (input === null || input === "" || !Number.isFinite(n)) return DEFAULTS.fontScale;
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)) * 10) / 10;
}

export interface Menu {
  register(label: string, onClick: () => void): unknown;
}

/** The userscript manager menu has one item, which opens the configuration panel in the player. */
export function installMenu(menu: Menu, open: () => void): void {
  menu.register("Timed translation configuration", open);
}
