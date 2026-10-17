/** The prefix of every class name and element ID that the script adds to the page. */
export const MARKER = "ytt";

/** Add a style element with this ID to the page head, once. */
export function ensureStyle(doc: Document, id: string, css: string): void {
  if (doc.getElementById(id)) return;
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = css;
  doc.head.appendChild(style);
}

/** The height of the player's control bar, or 0 before the player builds it. */
export function controlsHeight(player: HTMLElement): number {
  return player.querySelector<HTMLElement>(".ytp-chrome-bottom")?.offsetHeight ?? 0;
}
