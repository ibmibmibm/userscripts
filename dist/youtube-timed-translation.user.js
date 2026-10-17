// ==UserScript==
// @name         YouTube timed translation
// @namespace    https://github.com/ibmibmibm/userscripts
// @version      1.1.0
// @description  Show translated YouTube subtitles one sentence at a time, at the moment the words are spoken
// @author       Shen-Ta Hsieh
// @downloadURL  https://github.com/ibmibmibm/userscripts/raw/main/dist/youtube-timed-translation.user.js
// @updateURL    https://github.com/ibmibmibm/userscripts/raw/main/dist/youtube-timed-translation.user.js
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      translate.googleapis.com
// @run-at       document-idle
// ==/UserScript==
"use strict";
(() => {
  // scripts/youtube-timed-translation/src/captions.ts
  var TIMEDTEXT_PATH = "/api/timedtext";
  function videoIdFromUrl(href) {
    try {
      const url = new URL(href);
      if (url.pathname === "/watch") return url.searchParams.get("v");
      return /^\/live\/([\w-]+)$/.exec(url.pathname)?.[1] ?? null;
    } catch {
      return null;
    }
  }
  function originalTrackUrl(requestUrl, videoId) {
    let url;
    try {
      url = new URL(requestUrl);
    } catch {
      return null;
    }
    if (!url.pathname.endsWith(TIMEDTEXT_PATH)) return null;
    if (url.searchParams.get("v") !== videoId) return null;
    url.searchParams.delete("tlang");
    url.searchParams.set("fmt", "json3");
    return url.toString();
  }
  function trackKey(trackUrl) {
    const p = new URL(trackUrl).searchParams;
    return [p.get("v"), p.get("lang"), p.get("kind") ?? "", p.get("name") ?? ""].join("|");
  }
  function observeCaptionRequests(onUrl) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name.includes(TIMEDTEXT_PATH)) onUrl(entry.name);
      }
    });
    observer.observe({ type: "resource", buffered: true });
  }

  // scripts/youtube-timed-translation/src/fetch.ts
  var TIMEOUT_MS = 15e3;
  function gmPostForm(url, form, request) {
    return new Promise((resolve, reject) => {
      request({
        method: "POST",
        url,
        data: new URLSearchParams(form).toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        timeout: TIMEOUT_MS,
        onload: (r) => {
          if (r.status >= 200 && r.status < 300) resolve(r.responseText);
          else reject(new Error(`HTTP ${r.status}`));
        },
        onerror: () => reject(new Error("Request failed")),
        ontimeout: () => reject(new Error("Timed out"))
      });
    });
  }

  // scripts/youtube-timed-translation/src/json3.ts
  var MAX_WORD_MS = 1200;
  var NO_SPACE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}　-〿＀-￯]/u;
  function needsSpace(before, after) {
    if (!before || !after) return false;
    if (/\s$/.test(before) || /^\s/.test(after)) return false;
    return !NO_SPACE.test(before.slice(-1)) && !NO_SPACE.test(after[0]);
  }
  function parseWords(track) {
    const raw = [];
    let previous = "";
    for (const ev of track.events ?? []) {
      if (!ev.segs || ev.aAppend) continue;
      const start2 = ev.tStartMs ?? 0;
      const eventEnd = start2 + (ev.dDurationMs ?? 0);
      const timed = ev.segs.length > 1;
      let first = true;
      for (const seg of ev.segs) {
        let text = (seg.utf8 ?? "").replace(/\s+/g, " ");
        if (!text.trim()) continue;
        if (first && needsSpace(previous, text)) text = " " + text;
        first = false;
        previous = text;
        const wordStart = start2 + (seg.tOffsetMs ?? 0);
        raw.push({ text, startMs: wordStart, endMs: timed ? Math.min(eventEnd, wordStart + MAX_WORD_MS) : eventEnd });
      }
    }
    raw.sort((a, b) => a.startMs - b.startMs);
    return raw.map((w, i) => {
      const next = raw[i + 1];
      const endMs = next ? Math.min(next.startMs, w.endMs) : w.endMs;
      return { text: w.text, startMs: w.startMs, endMs: Math.max(endMs, w.startMs) };
    });
  }

  // scripts/youtube-timed-translation/src/dom.ts
  var MARKER = "ytt";
  function ensureStyle(doc, id, css) {
    if (doc.getElementById(id)) return;
    const style = doc.createElement("style");
    style.id = id;
    style.textContent = css;
    doc.head.appendChild(style);
  }
  function controlsHeight(player) {
    return player.querySelector(".ytp-chrome-bottom")?.offsetHeight ?? 0;
  }

  // scripts/youtube-timed-translation/src/overlay.ts
  var DEFAULT_FONTS = `"YouTube Noto", Roboto, Arial, "Noto Sans TC", "Noto Sans CJK TC", sans-serif`;
  var GENERIC_FONTS = /* @__PURE__ */ new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);
  var FONT_HEIGHT_RATIO = 0.045;
  var MIN_FONT_PX = 14;
  var MAX_FONT_PX = 44;
  var GAP_HIDDEN_RATIO = 0.04;
  var GAP_CONTROLS_RATIO = 0.02;
  var STYLE = `
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
  function fontSizeFor(playerHeight, scale = 1) {
    return Math.round(Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, playerHeight * FONT_HEIGHT_RATIO)) * scale);
  }
  function bottomFor(playerHeight, controls, controlsHidden) {
    return Math.round(controlsHidden ? playerHeight * GAP_HIDDEN_RATIO : controls + playerHeight * GAP_CONTROLS_RATIO);
  }
  function fontFamilyCss(name) {
    if (!name) return DEFAULT_FONTS;
    if (GENERIC_FONTS.has(name.toLowerCase())) return name.toLowerCase();
    return `"${name}", ${DEFAULT_FONTS}`;
  }
  function mountOverlay(doc, player) {
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
    let lastMain = null;
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
      }
    };
  }

  // scripts/youtube-timed-translation/src/settings.ts
  var DEFAULTS = { enabled: true, target: "zh-TW", showOriginal: true, fontFamily: "", fontScale: 1 };
  var MIN_SCALE = 0.5;
  var MAX_SCALE = 2;
  function loadSettings(store) {
    const target = store.get("target", DEFAULTS.target);
    const fontFamily = store.get("fontFamily", DEFAULTS.fontFamily);
    return {
      enabled: store.get("enabled", DEFAULTS.enabled) !== false,
      target: typeof target === "string" && normalizeTarget(target) || DEFAULTS.target,
      showOriginal: store.get("showOriginal", DEFAULTS.showOriginal) !== false,
      fontFamily: typeof fontFamily === "string" ? normalizeFont(fontFamily) : DEFAULTS.fontFamily,
      fontScale: normalizeScale(store.get("fontScale", DEFAULTS.fontScale))
    };
  }
  function saveSettings(store, settings) {
    store.set("enabled", settings.enabled);
    store.set("target", settings.target);
    store.set("showOriginal", settings.showOriginal);
    store.set("fontFamily", settings.fontFamily);
    store.set("fontScale", settings.fontScale);
  }
  function normalizeTarget(input) {
    const code = input.trim();
    return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?$/.test(code) ? code : null;
  }
  function normalizeFont(input) {
    return input.replace(/["'\\;{}<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
  }
  function normalizeScale(input) {
    const n = typeof input === "number" ? input : Number(input);
    if (input === null || input === "" || !Number.isFinite(n)) return DEFAULTS.fontScale;
    return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)) * 10) / 10;
  }
  function installMenu(menu, open) {
    menu.register("Timed translation configuration", open);
  }

  // scripts/youtube-timed-translation/src/panel.ts
  var LANGUAGES = [
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
    ["hi", "हिन्दी"]
  ];
  var FONTS = [
    ["", "Default"],
    ["sans-serif", "Sans-serif"],
    ["serif", "Serif"],
    ["monospace", "Monospace"],
    ["Noto Sans TC", "Noto Sans TC"],
    ["Noto Serif TC", "Noto Serif TC"],
    ["Microsoft JhengHei", "Microsoft JhengHei"],
    ["PingFang TC", "PingFang TC"]
  ];
  var OTHER = "\0other";
  var PANEL_GAP_PX = 12;
  var PANEL_MIN_HEIGHT_PX = 120;
  var STOPPED_EVENTS = ["keydown", "keyup", "keypress", "click", "dblclick", "mousedown", "mouseup", "wheel"];
  var STYLE2 = `
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
  var ICON = "M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z";
  function choice(doc, items, value, commit) {
    const select = doc.createElement("select");
    for (const [v, label] of [...items, [OTHER, "Other…"]]) {
      const option = doc.createElement("option");
      option.value = v;
      option.textContent = label;
      select.appendChild(option);
    }
    const field = doc.createElement("input");
    field.type = "text";
    const commitField = () => field.setAttribute("aria-invalid", String(!commit(field.value)));
    const set = (v) => {
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
  function row(doc, label, ...controls) {
    const el = doc.createElement("label");
    el.className = `${MARKER}-row`;
    const text = doc.createElement("span");
    text.textContent = label;
    el.append(text, ...controls);
    return el;
  }
  function checkbox(doc, checked, commit) {
    const box = doc.createElement("input");
    box.type = "checkbox";
    box.checked = checked;
    box.addEventListener("change", () => commit(box.checked));
    return box;
  }
  var percent = (scale) => `${Math.round(scale * 100)}%`;
  function iconButton(doc) {
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
  function mountPanel(doc, player, settings, onChange) {
    ensureStyle(doc, `${MARKER}-panel-style`, STYLE2);
    const panel = doc.createElement("div");
    const button = iconButton(doc);
    function toggle(open = panel.hidden) {
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
    const showScale = (value) => {
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
      reset
    );
    player.appendChild(panel);
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });
    const outside = (e) => {
      const target = e.target;
      if (!panel.hidden && target && !panel.contains(target) && !button.contains(target)) toggle(false);
    };
    doc.addEventListener("mousedown", outside, true);
    let dimmed = null;
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
      }
    };
  }

  // scripts/youtube-timed-translation/src/sentences.ts
  var PAUSE_MS = 800;
  var MAX_WORDS = 20;
  var END = /[.!?。！？…‼⁇⁈⁉]["'”’»›)\]）」』】]*$/;
  function toSentences(words) {
    const out = [];
    let group = [];
    const flush = () => {
      if (group.length === 0) return;
      const text = group.map((w) => w.text).join("").replace(/\s+/g, " ").trim();
      if (text) out.push({ text, startMs: group[0].startMs, endMs: group[group.length - 1].endMs });
      group = [];
    };
    words.forEach((w, i) => {
      group.push(w);
      const next = words[i + 1];
      if (!next || END.test(w.text.trim()) || next.startMs - w.endMs > PAUSE_MS || group.length >= MAX_WORDS) flush();
    });
    return out;
  }
  function linesFor(sentence, showOriginal) {
    if (!sentence) return { main: null, original: "" };
    if (sentence.translation === void 0) return { main: sentence.text, original: "" };
    return { main: sentence.translation, original: showOriginal ? sentence.text : "" };
  }
  function activeIndex(sentences, timeMs) {
    let lo = 0;
    let hi = sentences.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = lo + hi >> 1;
      if (sentences[mid].startMs <= timeMs) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found >= 0 && timeMs < sentences[found].endMs ? found : -1;
  }

  // scripts/youtube-timed-translation/src/translate.ts
  var GOOGLE_URL = "https://translate.googleapis.com/translate_a/single";
  function parseGoogleAnswer(json) {
    const answer = JSON.parse(json);
    if (!Array.isArray(answer) || !Array.isArray(answer[0])) throw new Error("Unexpected answer");
    const text = answer[0].map((part) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join("");
    return text.replace(/\n$/, "").split("\n");
  }
  function googleTranslator(postForm) {
    return {
      async translate(lines, target) {
        const url = `${GOOGLE_URL}?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t`;
        return parseGoogleAnswer(await postForm(url, { q: lines.join("\n") }));
      }
    };
  }
  var BATCH_LINES = 100;
  var BATCH_CHARS = 6e3;
  function batches(lines) {
    const out = [];
    let current = [];
    let chars = 0;
    let start2 = 0;
    lines.forEach((line, i) => {
      if (current.length > 0 && (current.length >= BATCH_LINES || chars + line.length > BATCH_CHARS)) {
        out.push({ start: start2, lines: current });
        current = [];
        chars = 0;
        start2 = i;
      }
      current.push(line);
      chars += line.length + 1;
    });
    if (current.length > 0) out.push({ start: start2, lines: current });
    return out;
  }
  async function withRetry(call) {
    try {
      return await call();
    } catch {
      return await call();
    }
  }
  async function translateBatch(lines, target, translator) {
    let result;
    try {
      result = await withRetry(() => translator.translate(lines, target));
    } catch {
      return lines.slice();
    }
    if (result.length === lines.length) return result.map((t) => t.trim());
    if (lines.length === 1) return [result.join(" ").trim()];
    const half = Math.ceil(lines.length / 2);
    const head = await translateBatch(lines.slice(0, half), target, translator);
    const tail = await translateBatch(lines.slice(half), target, translator);
    return [...head, ...tail];
  }
  async function translateAll(lines, target, translator, onBatch, cancelled = () => false) {
    for (const batch of batches(lines)) {
      if (cancelled()) return;
      const translated = await translateBatch(batch.lines, target, translator);
      if (cancelled()) return;
      onBatch(batch.start, translated);
    }
  }

  // scripts/youtube-timed-translation/src/main.ts
  var CAPTION_WAIT_MS = 3e3;
  var TimedTranslation = class {
    constructor(doc, settings, translator, save) {
      this.doc = doc;
      this.settings = settings;
      this.translator = translator;
      this.save = save;
      this.videoId = null;
      this.track = null;
      /** The original track URL of the last caption request for this video, so that turning the script on can load it. */
      this.lastTrackUrl = null;
      /** Changes on every new video or track, so that a late track answer is dropped. */
      this.loadToken = 0;
      /** Changes on every new video, track, or target language, so that late translations are dropped. */
      this.translateToken = 0;
      this.overlay = null;
      this.panel = null;
      this.player = null;
      /** Translations for each video, track, and target language, for the life of the page. */
      this.cache = /* @__PURE__ */ new Map();
    }
    start() {
      observeCaptionRequests((url) => this.onCaptionRequest(url));
      this.doc.addEventListener("yt-navigate-finish", () => this.onNavigate());
      this.onNavigate();
      const frame = () => {
        this.tick();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
    /** Open the configuration panel of the current player. */
    openPanel() {
      this.panel?.toggle(true);
    }
    /** Apply and save a change from the configuration panel. */
    change(patch) {
      const previousTarget = this.settings.target;
      Object.assign(this.settings, patch);
      this.save(this.settings);
      if (!("enabled" in patch) && !("target" in patch)) return;
      if (!this.settings.enabled) {
        this.overlay?.setActive(false);
        return;
      }
      if (!this.track) {
        if (this.lastTrackUrl) this.loadTrack(this.lastTrackUrl);
        else this.waitForCaptions();
        return;
      }
      if (this.track.sentences.length === 0) return;
      this.overlay?.setActive(true);
      if (this.settings.target !== previousTarget) this.translate(this.track);
    }
    onNavigate() {
      const id = videoIdFromUrl(this.doc.location.href);
      if (id === this.videoId) return;
      this.videoId = id;
      this.track = null;
      this.lastTrackUrl = null;
      this.loadToken += 1;
      this.translateToken += 1;
      this.overlay?.setActive(false);
      if (id && this.settings.enabled) this.waitForCaptions();
    }
    /** If the player loads no captions by itself, press its CC button so that it does. */
    waitForCaptions() {
      clearTimeout(this.captionTimer);
      const id = this.videoId;
      this.captionTimer = setTimeout(() => {
        if (!this.settings.enabled || this.track || id !== this.videoId) return;
        const button = this.doc.querySelector("#movie_player .ytp-subtitles-button");
        if (button && button.offsetParent !== null && button.getAttribute("aria-pressed") === "false") button.click();
      }, CAPTION_WAIT_MS);
    }
    onCaptionRequest(requestUrl) {
      if (!this.videoId) return;
      const url = originalTrackUrl(requestUrl, this.videoId);
      if (!url) return;
      this.lastTrackUrl = url;
      if (this.settings.enabled) this.loadTrack(url);
    }
    loadTrack(url) {
      const key = trackKey(url);
      if (this.track?.key === key) return;
      const track = { key, sentences: [] };
      this.track = track;
      this.translateToken += 1;
      void this.load(url, track, ++this.loadToken);
    }
    async load(url, track, token) {
      try {
        const response = await fetch(url, { credentials: "include" });
        const body = await response.text();
        if (token !== this.loadToken) return;
        if (!response.ok || !body) throw new Error(`HTTP ${response.status}, ${body.length} bytes`);
        track.sentences = toSentences(parseWords(JSON.parse(body)));
      } catch (e) {
        console.warn("[youtube-timed-translation] caption track failed:", e);
        if (this.track === track) this.track = null;
        return;
      }
      if (track.sentences.length === 0) return;
      this.overlay?.setActive(this.settings.enabled);
      this.translate(track);
    }
    translate(track) {
      const token = ++this.translateToken;
      const target = this.settings.target;
      const cacheKey = `${track.key}|${target}`;
      for (const s of track.sentences) s.translation = void 0;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        cached.forEach((t, i) => track.sentences[i].translation = t);
        return;
      }
      const result = [];
      let done = 0;
      void translateAll(
        track.sentences.map((s) => s.text),
        target,
        this.translator,
        (start2, lines) => {
          lines.forEach((t, i) => {
            track.sentences[start2 + i].translation = t;
            result[start2 + i] = t;
          });
          done += lines.length;
          if (done === track.sentences.length) this.cache.set(cacheKey, result);
        },
        () => token !== this.translateToken
      );
    }
    tick() {
      this.syncPlayer();
      if (this.player && this.overlay) this.render(this.player, this.overlay);
    }
    /** Mount the box and the panel on a new player, and keep the panel button in the control bar. */
    syncPlayer() {
      const player = this.doc.getElementById("movie_player");
      if (player !== this.player) {
        this.overlay?.destroy();
        this.panel?.destroy();
        this.overlay = null;
        this.panel = null;
        this.player = player;
        if (player) {
          this.overlay = mountOverlay(this.doc, player);
          this.panel = mountPanel(this.doc, player, this.settings, (patch) => this.change(patch));
          this.overlay.setActive(this.settings.enabled && this.track !== null && this.track.sentences.length > 0);
        }
      }
      this.panel?.ensureButton();
    }
    /** Show the sentence at the current video time. */
    render(player, overlay) {
      overlay.setFont(this.settings.fontFamily, this.settings.fontScale);
      const video = player.querySelector("video.html5-main-video");
      const track = this.track;
      if (!this.settings.enabled || !track || !video || player.classList.contains("ad-showing")) {
        overlay.show(null, "");
        return;
      }
      overlay.layout();
      const { main, original } = linesFor(track.sentences[activeIndex(track.sentences, video.currentTime * 1e3)], this.settings.showOriginal);
      overlay.show(main, original);
    }
  };
  function start() {
    const store = { get: (key, fallback) => GM_getValue(key, fallback), set: (key, value) => GM_setValue(key, value) };
    const settings = loadSettings(store);
    const translator = googleTranslator((url, form) => gmPostForm(url, form, GM_xmlhttpRequest));
    const app = new TimedTranslation(document, settings, translator, (s) => saveSettings(store, s));
    installMenu({ register: GM_registerMenuCommand }, () => app.openPanel());
    app.start();
  }
  if (typeof window !== "undefined" && typeof document !== "undefined" && window.location.hostname === "www.youtube.com" && window.top === window) {
    start();
  }
})();
