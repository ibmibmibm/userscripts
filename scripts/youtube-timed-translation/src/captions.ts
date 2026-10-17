/** The path of the player's caption requests. */
const TIMEDTEXT_PATH = "/api/timedtext";

/** The video ID of a watch page URL or a live page URL (/live/ID, which also plays live archives), or null on other pages. */
export function videoIdFromUrl(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.pathname === "/watch") return url.searchParams.get("v");
    return /^\/live\/([\w-]+)$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The URL that fetches the original track of a caption request that the player made, or null when
 * the request is not a timedtext request for videoId (an ad loads its own captions, for example).
 * The player's own URL carries the proof token (pot) that YouTube requires. Without tlang it
 * answers with the original language, also when the user chose a YouTube translation.
 */
export function originalTrackUrl(requestUrl: string, videoId: string): string | null {
  let url: URL;
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

/** What makes two caption requests load the same track: the video, the language, the kind, and the track name. */
export function trackKey(trackUrl: string): string {
  const p = new URL(trackUrl).searchParams;
  return [p.get("v"), p.get("lang"), p.get("kind") ?? "", p.get("name") ?? ""].join("|");
}

/**
 * Report the URL of every timedtext request the page makes, also the ones before the call.
 * The player loads captions with XMLHttpRequest in the page context, which a userscript cannot
 * patch, and YouTube clears the resource timing buffer often, so this uses an observer.
 */
export function observeCaptionRequests(onUrl: (url: string) => void): void {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes(TIMEDTEXT_PATH)) onUrl(entry.name);
    }
  });
  observer.observe({ type: "resource", buffered: true });
}
