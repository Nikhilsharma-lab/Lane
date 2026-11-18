import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsEarlySearch } from "./settings-early-search";
import { EARLY_SEARCH, takeEarlySearch } from "./settings-early-search-flag";

/** #288 (D20): "/" pressed before Settings' code has run is kept and opens search once it has. */
class FakeElement {
  constructor(private readonly typing = false, readonly isContentEditable = false) {}
  closest() { return this.typing ? this : null; }
}
const script = /<script>([\s\S]*)<\/script>/.exec(renderToStaticMarkup(createElement(SettingsEarlySearch)))?.[1] ?? "";

/** Runs the inline script against a stand-in window, as the browser would while the HTML arrives. */
function load() {
  const win: Record<string, unknown> = {};
  let listener: ((event: object) => void) | undefined;
  new Function("window", "addEventListener", "Element", script)(win, (type: string, handler: (event: object) => void) => { if (type === "keydown") listener = handler; }, FakeElement);
  const press = (key: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; target: FakeElement }> = {}) => {
    const event = { key, metaKey: false, ctrlKey: false, altKey: false, repeat: false, isComposing: false, target: new FakeElement(), preventDefault: vi.fn(), ...extra };
    listener?.(event);
    return event.preventDefault.mock.calls.length > 0;
  };
  return { win, press };
}

describe("Settings' early search key", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("notes \"/\" pressed on the page and keeps it from the page", () => {
    const { win, press } = load();
    expect(win[EARLY_SEARCH]).toBe(false);
    expect(press("/")).toBe(true);
    expect(win[EARLY_SEARCH]).toBe(true);
  });

  it("leaves other keys, modified keys and typing in a field alone", () => {
    const { win, press } = load();
    expect(press("a")).toBe(false);
    expect(press("/", { ctrlKey: true })).toBe(false);
    expect(press("/", { metaKey: true })).toBe(false);
    expect(press("/", { target: new FakeElement(true) })).toBe(false);
    expect(press("/", { target: new FakeElement(false, true) })).toBe(false);
    expect(win[EARLY_SEARCH]).toBe(false);
  });

  it("is taken once by Settings, which then listens itself", () => {
    const { win, press } = load();
    press("/");
    vi.stubGlobal("window", win);
    expect(takeEarlySearch()).toBe(true);
    expect(takeEarlySearch()).toBe(false);
    expect(press("/")).toBe(false);
  });

  it("listens once, however many copies the page carries", () => {
    const { win } = load();
    win[EARLY_SEARCH] = true;
    let added = 0;
    new Function("window", "addEventListener", "Element", script)(win, () => { added++; }, FakeElement);
    expect(added).toBe(0);
  });
});
