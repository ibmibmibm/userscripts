import { observeCaptionRequests, originalTrackUrl, trackKey, videoIdFromUrl } from "./captions";
import { gmPostForm, type GmDetails } from "./fetch";
import { parseWords, type Json3 } from "./json3";
import { mountOverlay, type Overlay } from "./overlay";
import { mountPanel, type Panel } from "./panel";
import { activeIndex, linesFor, toSentences, type Sentence } from "./sentences";
import { installMenu, loadSettings, saveSettings, type Settings, type Store } from "./settings";
import { googleTranslator, translateAll, type Translator } from "./translate";

declare function GM_xmlhttpRequest(details: GmDetails): void;
declare function GM_getValue<T>(key: string, fallback: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_registerMenuCommand(label: string, onClick: () => void): unknown;

/** Without a caption request this long after a video opens, the script turns on the player's captions. */
const CAPTION_WAIT_MS = 3000;

interface Track {
  key: string;
  sentences: Sentence[];
}

export class TimedTranslation {
  private videoId: string | null = null;
  private track: Track | null = null;
  /** The original track URL of the last caption request for this video, so that turning the script on can load it. */
  private lastTrackUrl: string | null = null;
  /** Changes on every new video or track, so that a late track answer is dropped. */
  private loadToken = 0;
  /** Changes on every new video, track, or target language, so that late translations are dropped. */
  private translateToken = 0;
  private overlay: Overlay | null = null;
  private panel: Panel | null = null;
  private player: HTMLElement | null = null;
  private captionTimer: ReturnType<typeof setTimeout> | undefined;
  /** Translations for each video, track, and target language, for the life of the page. */
  private readonly cache = new Map<string, string[]>();

  constructor(
    private readonly doc: Document,
    private readonly settings: Settings,
    private readonly translator: Translator,
    private readonly save: (settings: Settings) => void,
  ) {}

  start(): void {
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
  openPanel(): void {
    this.panel?.toggle(true);
  }

  /** Apply and save a change from the configuration panel. */
  change(patch: Partial<Settings>): void {
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
    // A track that is still loading starts its translation when it arrives.
    if (this.track.sentences.length === 0) return;
    this.overlay?.setActive(true);
    if (this.settings.target !== previousTarget) this.translate(this.track);
  }

  private onNavigate(): void {
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
  private waitForCaptions(): void {
    clearTimeout(this.captionTimer);
    const id = this.videoId;
    this.captionTimer = setTimeout(() => {
      if (!this.settings.enabled || this.track || id !== this.videoId) return;
      const button = this.doc.querySelector<HTMLElement>("#movie_player .ytp-subtitles-button");
      if (button && button.offsetParent !== null && button.getAttribute("aria-pressed") === "false") button.click();
    }, CAPTION_WAIT_MS);
  }

  private onCaptionRequest(requestUrl: string): void {
    if (!this.videoId) return;
    const url = originalTrackUrl(requestUrl, this.videoId);
    if (!url) return;
    this.lastTrackUrl = url;
    if (this.settings.enabled) this.loadTrack(url);
  }

  private loadTrack(url: string): void {
    const key = trackKey(url);
    if (this.track?.key === key) return;
    const track: Track = { key, sentences: [] };
    this.track = track;
    this.translateToken += 1;
    void this.load(url, track, ++this.loadToken);
  }

  private async load(url: string, track: Track, token: number): Promise<void> {
    try {
      const response = await fetch(url, { credentials: "include" });
      const body = await response.text();
      if (token !== this.loadToken) return;
      if (!response.ok || !body) throw new Error(`HTTP ${response.status}, ${body.length} bytes`);
      track.sentences = toSentences(parseWords(JSON.parse(body) as Json3));
    } catch (e) {
      console.warn("[youtube-timed-translation] caption track failed:", e);
      if (this.track === track) this.track = null;
      return;
    }
    if (track.sentences.length === 0) return;
    this.overlay?.setActive(this.settings.enabled);
    this.translate(track);
  }

  private translate(track: Track): void {
    const token = ++this.translateToken;
    const target = this.settings.target;
    const cacheKey = `${track.key}|${target}`;
    for (const s of track.sentences) s.translation = undefined;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.forEach((t, i) => (track.sentences[i].translation = t));
      return;
    }
    const result: string[] = [];
    let done = 0;
    void translateAll(
      track.sentences.map((s) => s.text),
      target,
      this.translator,
      (start, lines) => {
        lines.forEach((t, i) => {
          track.sentences[start + i].translation = t;
          result[start + i] = t;
        });
        done += lines.length;
        if (done === track.sentences.length) this.cache.set(cacheKey, result);
      },
      () => token !== this.translateToken,
    );
  }

  private tick(): void {
    this.syncPlayer();
    if (this.player && this.overlay) this.render(this.player, this.overlay);
  }

  /** Mount the box and the panel on a new player, and keep the panel button in the control bar. */
  private syncPlayer(): void {
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
  private render(player: HTMLElement, overlay: Overlay): void {
    overlay.setFont(this.settings.fontFamily, this.settings.fontScale);
    const video = player.querySelector<HTMLVideoElement>("video.html5-main-video");
    const track = this.track;
    if (!this.settings.enabled || !track || !video || player.classList.contains("ad-showing")) {
      overlay.show(null, "");
      return;
    }
    overlay.layout();
    const { main, original } = linesFor(track.sentences[activeIndex(track.sentences, video.currentTime * 1000)], this.settings.showOriginal);
    overlay.show(main, original);
  }
}

function start(): void {
  const store: Store = { get: (key, fallback) => GM_getValue(key, fallback), set: (key, value) => GM_setValue(key, value) };
  const settings = loadSettings(store);
  const translator = googleTranslator((url, form) => gmPostForm(url, form, GM_xmlhttpRequest));
  const app = new TimedTranslation(document, settings, translator, (s) => saveSettings(store, s));
  installMenu({ register: GM_registerMenuCommand }, () => app.openPanel());
  app.start();
}

if (typeof window !== "undefined" && typeof document !== "undefined" && window.location.hostname === "www.youtube.com" && window.top === window) {
  start();
}
