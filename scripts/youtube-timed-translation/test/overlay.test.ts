import { JSDOM } from "jsdom";
import { MARKER } from "../src/dom";
import { bottomFor, fontFamilyCss, fontSizeFor, mountOverlay } from "../src/overlay";

describe("overlay layout", () => {
  it("scales the text with the player and keeps it readable", () => {
    expect(fontSizeFor(665)).toBe(30);
    expect(fontSizeFor(200)).toBe(14);
    expect(fontSizeFor(2160)).toBe(44);
  });

  it("scales the text size by the configured factor", () => {
    expect(fontSizeFor(665, 1.5)).toBe(45);
    expect(fontSizeFor(200, 0.5)).toBe(7);
  });

  it("sits above the control bar while it shows and lower when it hides", () => {
    expect(bottomFor(665, 59, false)).toBe(72);
    expect(bottomFor(665, 59, true)).toBe(27);
  });
});

describe("fontFamilyCss", () => {
  it("quotes a font name and falls back to the default fonts", () => {
    expect(fontFamilyCss("")).toContain("Roboto");
    expect(fontFamilyCss("Serif")).toBe("serif");
    expect(fontFamilyCss("Noto Serif TC")).toMatch(/^"Noto Serif TC", "YouTube Noto"/);
  });
});

describe("mountOverlay", () => {
  it("hides the original line when it is empty and the box for null", () => {
    const doc = new JSDOM(`<!doctype html><div id="movie_player"></div>`).window.document;
    const player = doc.getElementById("movie_player")!;
    const overlay = mountOverlay(doc, player);
    const box = player.querySelector<HTMLElement>(`.${MARKER}-box`)!;
    const original = player.querySelector<HTMLElement>(`.${MARKER}-original`)!;
    overlay.show("那怎麼樣？", "So how?");
    expect(box.hidden).toBe(false);
    expect(original.hidden).toBe(false);
    overlay.show("那怎麼樣？", "");
    expect(original.hidden).toBe(true);
    overlay.show(null, "");
    expect(box.hidden).toBe(true);
    overlay.setActive(true);
    expect(player.classList.contains(`${MARKER}-active`)).toBe(true);
    overlay.destroy();
    expect(player.querySelector(`.${MARKER}-box`)).toBeNull();
    expect(player.classList.contains(`${MARKER}-active`)).toBe(false);
  });
});
