import { controlsHeight, ensureStyle, MARKER } from "./dom";
import { DEFAULTS, MAX_SCALE, MIN_SCALE, normalizeFont, normalizeScale, normalizeTarget, type Settings } from "./settings";

/** Common Google Translate targets. The "Other" choice takes any other code. */
export const LANGUAGES: [code: string, name: string][] = [
  ["zh-TW", "中文（繁體）"],
  ["zh-CN", "中文（简体）"],
  ["en", "English"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["pt", "Português"],
  ["it", "Italiano"],
  ["ru", "Русский"],
  ["vi", "Tiếng Việt"],
  ["th", "ไทย"],
  ["id", "Bahasa Indonesia"],
  ["ar", "العربية"],
  ["hi", "हिन्दी"],
];

/** Font choices. "" is the default font list, and the "Other" choice takes any installed font name. */
export const FONTS: [name: string, label: string][] = [
  ["", "Default"],
  ["sans-serif", "Sans-serif"],
  ["serif", "Serif"],
  ["monospace", "Monospace"],
  ["Noto Sans TC", "Noto Sans TC"],
  ["Noto Serif TC", "Noto Serif TC"],
  ["Microsoft JhengHei", "Microsoft JhengHei"],
  ["PingFang TC", "PingFang TC"],
];

/** The option value of the "Other" choice. No language code or font name has a NUL character. */
export const OTHER = "\u0000other";

/** The gap between the panel and the control bar or the edges of the player. */
const PANEL_GAP_PX = 12;
/** The panel is at least this tall, and scrolls when the player has less room. */
const PANEL_MIN_HEIGHT_PX = 120;
/** The events that the panel keeps from the player. */
const STOPPED_EVENTS = ["keydown", "keyup", "keypress", "click", "dblclick", "mousedown", "mouseup", "wheel"];

const STYLE = `
.${MARKER}-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.${MARKER}-button svg {
  width: 24px;
  height: 24px;
  fill: #fff;
}
.${MARKER}-button.${MARKER}-off svg {
  opacity: 0.5;
}
.${MARKER}-panel {
  position: absolute;
  right: ${PANEL_GAP_PX}px;
  z-index: 70;
  width: 280px;
  max-width: calc(100% - ${2 * PANEL_GAP_PX}px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(28, 28, 28, 0.92);
  color: #eee;
  font: 13px/1.4 Roboto, Arial, sans-serif;
  text-align: left;
}
.${MARKER}-panel[hidden] {
  display: none;
}
.${MARKER}-panel h2 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 500;
}
.${MARKER}-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}
.${MARKER}-row > span {
  flex: 0 0 96px;
}
.${MARKER}-row select,
.${MARKER}-row input[type="text"] {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 3px 6px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #111;
  color: #eee;
  font: inherit;
}
.${MARKER}-row input[type="range"] {
  flex: 1;
  min-width: 0;
}
.${MARKER}-row input[hidden] {
  display: none;
}
.${MARKER}-row input[aria-invalid="true"] {
  border-color: #f66;
}
.${MARKER}-row output {
  flex: 0 0 40px;
  text-align: right;
}
.${MARKER}-reset {
  margin-top: 4px;
  padding: 4px 10px;
  border: 1px solid #555;
  border-radius: 4px;
  background: transparent;
  color: #eee;
  font: inherit;
  cursor: pointer;
}
`;

/** The Material "translate" icon. */
const ICON =
  "M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z";

export interface Panel {
  /** Open or close the panel. Without an argument, it changes to the other state. */
  toggle(open?: boolean): void;
  readonly open: boolean;
  /**
   * Put the button back into the control bar after YouTube builds the bar again, and dim it while
   * the script is off. Call it on every frame; it writes only on a change.
   */
  ensureButton(): void;
  destroy(): void;
}

interface Choice {
  elements: HTMLElement[];
  /** Show this value: in the select when it is listed, and in the Other field when it is not. */
  set(value: string): void;
}

/**
 * A select with fixed choices and an "Other" choice that shows a text field. commit gets the
 * value of the chosen item, or the text of the field, and returns false for a value it refuses.
 */
function choice(doc: Document, items: [string, string][], value: string, commit: (value: string) => boolean): Choice {
  const select = doc.createElement("select");
  for (const [v, label] of [...items, [OTHER, "Other…"] as [string, string]]) {
    const option = doc.createElement("option");
    option.value = v;
    option.textContent = label;
    select.appendChild(option);
  }
  const field = doc.createElement("input");
  field.type = "text";
  const commitField = () => field.setAttribute("aria-invalid", String(!commit(field.value)));
  const set = (v: string) => {
    const known = items.some(([item]) => item === v);
    select.value = known ? v : OTHER;
    field.value = known ? "" : v;
    field.hidden = known;
    field.removeAttribute("aria-invalid");
  };
  set(value);
  select.addEventListener("change", () => {
    field.hidden = select.value !== OTHER;
    if (select.value !== OTHER) {
      field.removeAttribute("aria-invalid");
      commit(select.value);
      return;
    }
    field.focus();
    if (field.value) commitField();
  });
  field.addEventListener("change", commitField);
  return { elements: [select, field], set };
}

function row(doc: Document, label: string, ...controls: HTMLElement[]): HTMLElement {
  const el = doc.createElement("label");
  el.className = `${MARKER}-row`;
  const text = doc.createElement("span");
  text.textContent = label;
  el.append(text, ...controls);
  return el;
}

function checkbox(doc: Document, checked: boolean, commit: (on: boolean) => void): HTMLInputElement {
  const box = doc.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.addEventListener("change", () => commit(box.checked));
  return box;
}

const percent = (scale: number) => `${Math.round(scale * 100)}%`;

function iconButton(doc: Document): HTMLButtonElement {
  const button = doc.createElement("button");
  button.className = `ytp-button ${MARKER}-button`;
  button.title = "Timed translation";
  button.setAttribute("aria-label", "Timed translation configuration");
  button.setAttribute("aria-expanded", "false");
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICON);
  svg.appendChild(path);
  button.appendChild(svg);
  return button;
}

/**
 * The configuration panel and its button in the player's control bar. Every change applies at
 * once through onChange. The panel stops the key and mouse events, so that typing in it does not
 * reach the player's hotkeys and a click does not pause the video.
 */
export function mountPanel(doc: Document, player: HTMLElement, settings: Settings, onChange: (patch: Partial<Settings>) => void): Panel {
  ensureStyle(doc, `${MARKER}-panel-style`, STYLE);
  const panel = doc.createElement("div");
  const button = iconButton(doc);

  function toggle(open = panel.hidden): void {
    if (open) {
      const controls = controlsHeight(player);
      panel.style.bottom = `${controls + PANEL_GAP_PX}px`;
      panel.style.maxHeight = `${Math.max(PANEL_MIN_HEIGHT_PX, player.clientHeight - controls - 2 * PANEL_GAP_PX)}px`;
    }
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  }

  panel.className = `${MARKER}-panel`;
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Timed translation configuration");
  for (const type of STOPPED_EVENTS) panel.addEventListener(type, (e) => e.stopPropagation());
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggle(false);
  });

  const heading = doc.createElement("h2");
  heading.textContent = "Timed translation";
  const language = choice(doc, LANGUAGES, settings.target, (v) => {
    const target = normalizeTarget(v);
    if (target) onChange({ target });
    return target !== null;
  });
  const font = choice(doc, FONTS, settings.fontFamily, (v) => {
    onChange({ fontFamily: normalizeFont(v) });
    return true;
  });
  const scale = doc.createElement("input");
  scale.type = "range";
  scale.min = String(MIN_SCALE);
  scale.max = String(MAX_SCALE);
  scale.step = "0.1";
  const scaleText = doc.createElement("output");
  const showScale = (value: number) => {
    scale.value = String(value);
    scaleText.textContent = percent(value);
  };
  showScale(settings.fontScale);
  scale.addEventListener("input", () => {
    const fontScale = normalizeScale(scale.value);
    scaleText.textContent = percent(fontScale);
    onChange({ fontScale });
  });
  const reset = doc.createElement("button");
  reset.type = "button";
  reset.className = `${MARKER}-reset`;
  reset.textContent = "Reset font";
  reset.addEventListener("click", () => {
    onChange({ fontFamily: DEFAULTS.fontFamily, fontScale: DEFAULTS.fontScale });
    font.set(DEFAULTS.fontFamily);
    showScale(DEFAULTS.fontScale);
  });

  panel.append(
    heading,
    row(doc, "Translation", checkbox(doc, settings.enabled, (enabled) => onChange({ enabled }))),
    row(doc, "Original line", checkbox(doc, settings.showOriginal, (showOriginal) => onChange({ showOriginal }))),
    row(doc, "Language", ...language.elements),
    row(doc, "Font", ...font.elements),
    row(doc, "Text size", scale, scaleText),
    reset,
  );
  player.appendChild(panel);

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });

  // A press outside the panel and its button closes the panel.
  const outside = (e: Event) => {
    const target = e.target as Node | null;
    if (!panel.hidden && target && !panel.contains(target) && !button.contains(target)) toggle(false);
  };
  doc.addEventListener("mousedown", outside, true);

  let dimmed: boolean | null = null;
  return {
    toggle,
    get open() {
      return !panel.hidden;
    },
    ensureButton() {
      if (dimmed !== !settings.enabled) {
        dimmed = !settings.enabled;
        button.classList.toggle(`${MARKER}-off`, dimmed);
      }
      if (button.isConnected) return;
      const bar = player.querySelector(".ytp-right-controls");
      if (!bar) return;
      const before = bar.querySelector(".ytp-settings-button");
      if (before && before.parentNode === bar) bar.insertBefore(button, before);
      else bar.prepend(button);
    },
    destroy() {
      doc.removeEventListener("mousedown", outside, true);
      panel.remove();
      button.remove();
    },
  };
}
