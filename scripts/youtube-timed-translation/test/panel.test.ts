import { JSDOM } from "jsdom";
import { MARKER } from "../src/dom";
import { mountPanel, OTHER } from "../src/panel";
import { DEFAULTS, type Settings } from "../src/settings";

function setup(init: Partial<Settings> = {}) {
  const { window } = new JSDOM(
    `<!doctype html><div id="movie_player"><div class="ytp-chrome-bottom"><div class="ytp-right-controls"><button class="ytp-settings-button"></button></div></div></div>`,
  );
  const doc = window.document;
  const player = doc.getElementById("movie_player")!;
  const settings = { ...DEFAULTS, ...init };
  const changes: Partial<Settings>[] = [];
  const panel = mountPanel(doc, player, settings, (patch) => {
    changes.push(patch);
    Object.assign(settings, patch);
  });
  panel.ensureButton();
  const el = player.querySelector<HTMLElement>(`.${MARKER}-panel`)!;
  const button = player.querySelector<HTMLButtonElement>(`.${MARKER}-button`)!;
  const rowOf = (label: string) => Array.from(el.querySelectorAll<HTMLElement>(`.${MARKER}-row`)).find((r) => r.querySelector("span")!.textContent === label)!;
  const fire = (target: Element, type: string) => target.dispatchEvent(new window.Event(type, { bubbles: true }));
  const select = (label: string) => rowOf(label).querySelector("select")!;
  const field = (label: string) => rowOf(label).querySelector<HTMLInputElement>("input")!;
  const choose = (label: string, value: string) => {
    select(label).value = value;
    fire(select(label), "change");
  };
  const type = (label: string, text: string) => {
    field(label).value = text;
    fire(field(label), "change");
  };
  return { window, doc, player, settings, changes, panel, el, button, rowOf, fire, select, field, choose, type };
}

describe("configuration panel", () => {
  it("adds a button before the settings button that opens and closes the panel", () => {
    const { player, panel, el, button } = setup();
    expect(player.querySelector(".ytp-right-controls")!.firstElementChild).toBe(button);
    expect(el.hidden).toBe(true);
    button.click();
    expect(panel.open).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    button.click();
    expect(panel.open).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("puts the button back after YouTube builds the control bar again", () => {
    const { player, panel } = setup();
    player.querySelector(".ytp-chrome-bottom")!.replaceChildren(player.ownerDocument.createElement("div"));
    player.querySelector(".ytp-chrome-bottom > div")!.className = "ytp-right-controls";
    panel.ensureButton();
    expect(player.querySelector(`.ytp-right-controls .${MARKER}-button`)).not.toBeNull();
  });

  it("turns the translation and the original line on and off, and dims the button while off", () => {
    const { changes, rowOf, fire, panel, button } = setup();
    const translation = rowOf("Translation").querySelector("input")!;
    const original = rowOf("Original line").querySelector("input")!;
    translation.checked = false;
    fire(translation, "change");
    original.checked = false;
    fire(original, "change");
    expect(changes).toEqual([{ enabled: false }, { showOriginal: false }]);
    panel.ensureButton();
    expect(button.classList.contains(`${MARKER}-off`)).toBe(true);
  });

  it("takes a listed language", () => {
    const { changes, select, field, choose } = setup();
    expect(select("Language").value).toBe("zh-TW");
    expect(field("Language").hidden).toBe(true);
    choose("Language", "ja");
    expect(changes).toEqual([{ target: "ja" }]);
  });

  it("takes a valid code from the Other field and marks a code it refuses", () => {
    const { changes, field, choose, type } = setup();
    choose("Language", OTHER);
    expect(field("Language").hidden).toBe(false);
    type("Language", "not a code");
    expect(field("Language").getAttribute("aria-invalid")).toBe("true");
    type("Language", "fil");
    expect(field("Language").getAttribute("aria-invalid")).toBe("false");
    expect(changes).toEqual([{ target: "fil" }]);
  });

  it("checks the Other field again when the user chooses Other once more", () => {
    const { changes, field, choose, type } = setup();
    choose("Language", OTHER);
    type("Language", "bad code");
    choose("Language", "ja");
    expect(field("Language").hasAttribute("aria-invalid")).toBe(false);
    choose("Language", OTHER);
    expect(field("Language").getAttribute("aria-invalid")).toBe("true");
    expect(changes).toEqual([{ target: "ja" }]);
  });

  it("shows a stored code that is not listed in the Other field", () => {
    const { select, field } = setup({ target: "uk" });
    expect(select("Language").value).toBe(OTHER);
    expect(field("Language").hidden).toBe(false);
    expect(field("Language").value).toBe("uk");
  });

  it("changes the font and the text size, and resets them", () => {
    const { el, changes, rowOf, fire, select, choose } = setup();
    choose("Font", "serif");
    const size = rowOf("Text size").querySelector<HTMLInputElement>("input")!;
    size.value = "1.5";
    fire(size, "input");
    expect(rowOf("Text size").querySelector("output")!.textContent).toBe("150%");
    el.querySelector<HTMLButtonElement>(`.${MARKER}-reset`)!.click();
    expect(changes).toEqual([{ fontFamily: "serif" }, { fontScale: 1.5 }, { fontFamily: "", fontScale: 1 }]);
    expect(select("Font").value).toBe("");
    expect(size.value).toBe("1");
    expect(rowOf("Text size").querySelector("output")!.textContent).toBe("100%");
  });

  it("keeps keys from the player hotkeys and closes on Escape or a press outside", () => {
    const { window, doc, player, panel, el } = setup();
    let keys = 0;
    doc.addEventListener("keydown", () => keys++);
    panel.toggle(true);
    el.querySelector("select")!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(keys).toBe(0);
    el.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.open).toBe(false);
    panel.toggle(true);
    el.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
    expect(panel.open).toBe(true);
    player.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
    expect(panel.open).toBe(false);
  });

  it("removes the panel and the button", () => {
    const { player, panel } = setup();
    panel.destroy();
    expect(player.querySelector(`.${MARKER}-panel`)).toBeNull();
    expect(player.querySelector(`.${MARKER}-button`)).toBeNull();
  });
});
