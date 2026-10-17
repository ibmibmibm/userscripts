import { controlsHeight, ensureStyle, MARKER } from "./dom";

/** The fonts of the box when the configuration names none, and the fallback after a named font. */
export const DEFAULT_FONTS = `"YouTube Noto", Roboto, Arial, "Noto Sans TC", "Noto Sans CJK TC", sans-serif`;
const GENERIC_FONTS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);

/** The text size is this part of the player height, between MIN_FONT_PX and MAX_FONT_PX before the configured factor. */
const FONT_HEIGHT_RATIO = 0.045;
const MIN_FONT_PX = 14;
const MAX_FONT_PX = 44;
/** The gap below the box: this part of the player height while the control bar hides, and above the bar while it shows. */
const GAP_HIDDEN_RATIO = 0.04;
const GAP_CONTROLS_RATIO = 0.02;

/**
 * The box sits inside #movie_player, so it shows in the normal view, theater mode, and fullscreen.
 * While the script shows its box, the player carries the class ytt-active and YouTube's own
 * caption box is hidden. The page enforces Trusted Types, so every node is built with
 * createElement and textContent.
 */
const STYLE = `
#movie_player.${MARKER}-active .ytp-caption-window-container {
  display: none !important;
}
.${MARKER}-box {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  max-width: 80%;
  width: max-content;
  box-sizing: border-box;
  padding: 0.2em 0.5em;
  border-radius: 0.2em;
  background: rgba(8, 8, 8, 0.75);
  color: #fff;
  text-align: center;
  line-height: 1.3;
  pointer-events: none;
  transition: bottom 0.2s;
  font-family: ${DEFAULT_FONTS};
}
.${MARKER}-box[hidden] {
  display: none;
}
.${MARKER}-original {
  font-size: 0.65em;
  opacity: 0.85;
}
.${MARKER}-original[hidden] {
  display: none;
}
`;

/** The subtitle text size for a player height, times the configured factor. */
export function fontSizeFor(playerHeight: number, scale = 1): number {
  return Math.round(Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, playerHeight * FONT_HEIGHT_RATIO)) * scale);
}

/** The distance of the box from the bottom of the player: above the control bar while it shows. */
export function bottomFor(playerHeight: number, controls: number, controlsHidden: boolean): number {
  return Math.round(controlsHidden ? playerHeight * GAP_HIDDEN_RATIO : controls + playerHeight * GAP_CONTROLS_RATIO);
}

/** The CSS font-family value for a configured font name. A named font falls back to the default fonts. */
export function fontFamilyCss(name: string): string {
  if (!name) return DEFAULT_FONTS;
  if (GENERIC_FONTS.has(name.toLowerCase())) return name.toLowerCase();
  return `"${name}", ${DEFAULT_FONTS}`;
}

export interface Overlay {
  /** Show a line and its original, or hide the box with null. An empty original hides the original line. */
  show(main: string | null, original: string): void;
  /** Set the configured font name and size factor. It writes only on a change. */
  setFont(family: string, scale: number): void;
  /** Hide YouTube's caption box while true. */
  setActive(on: boolean): void;
  /** Follow the player size and the control bar. Call it on every frame; it writes only on a change. */
  layout(): void;
  destroy(): void;
}

export function mountOverlay(doc: Document, player: HTMLElement): Overlay {
  ensureStyle(doc, `${MARKER}-style`, STYLE);
  const box = doc.createElement("div");
  box.className = `${MARKER}-box`;
  box.hidden = true;
  const main = doc.createElement("div");
  main.className = `${MARKER}-main`;
  const original = doc.createElement("div");
  original.className = `${MARKER}-original`;
  box.append(main, original);
  player.appendChild(box);

  let lastMain: string | null = null;
  let lastOriginal = "";
  let lastFont = -1;
  let lastBottom = -1;
  let family = "";
  let scale = 1;
  return {
    show(text, orig) {
      if (text === lastMain && orig === lastOriginal) return;
      lastMain = text;
      lastOriginal = orig;
      box.hidden = text === null;
      main.textContent = text ?? "";
      original.textContent = orig;
      original.hidden = !orig;
    },
    setFont(f, s) {
      if (f !== family) {
        family = f;
        box.style.fontFamily = fontFamilyCss(f);
      }
      if (s !== scale) {
        scale = s;
        lastFont = -1;
      }
    },
    setActive(on) {
      player.classList.toggle(`${MARKER}-active`, on);
      if (!on) box.hidden = true;
      lastMain = null;
    },
    layout() {
      const height = player.clientHeight;
      const font = fontSizeFor(height, scale);
      const bottom = bottomFor(height, controlsHeight(player), player.classList.contains("ytp-autohide"));
      if (font !== lastFont) {
        lastFont = font;
        box.style.fontSize = `${font}px`;
      }
      if (bottom !== lastBottom) {
        lastBottom = bottom;
        box.style.bottom = `${bottom}px`;
      }
    },
    destroy() {
      player.classList.remove(`${MARKER}-active`);
      box.remove();
    },
  };
}
