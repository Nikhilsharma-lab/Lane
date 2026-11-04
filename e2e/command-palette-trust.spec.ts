import { expect, test, type Locator, type Page } from "@playwright/test";
import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";
import { commandPalette as palette, paletteOption as option, runPaletteCommand as run } from "./helpers/command-palette";

// #268 (Build 4 of #256): ⌘K you can trust, the Jump to… bar, key hints and the shortcuts dialog. Walk findings
// A11 (broken), A12, A13, A14, A124 and A125 from docs/walks/2026-10-26-screen-walk/A1-app-frame.md, driven as a
// person would: real clicks and keys, never a palette action called directly. Run against a production build
// (LANE_E2E_START=1): `next dev` never reads a page ahead, so the load-ahead step needs what ships.

const field = (page: Page) => palette(page).getByRole("combobox", { name: "Find an action or place" });
const jumpBar = (page: Page) => page.getByRole("button", { name: "Jump to…", exact: true });
const messages = (page: Page) => page.getByRole("region", { name: "Messages (Alt+T)" });

/** React has hydrated the shell, so the page's own keys are listening. */
async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const main = document.querySelector("#lane-main");
    return Boolean(main && Object.keys(main).some(key => key.startsWith("__reactFiber")));
  }, undefined, { timeout: 60_000 });
}

async function inViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  return Boolean(box && box.y >= 0 && box.x >= 0 && box.y + box.height <= viewport.height + 0.5 && box.x + box.width <= viewport.width + 0.5);
}

/** The shortcuts dialog's list: its scrolling body, how far it scrolls and the fade at its bottom edge, in px. */
async function shortcutsBody(dialog: Locator) {
  return dialog.evaluate(node => {
    const body = node.lastElementChild as HTMLElement;
    const fade = parseFloat(getComputedStyle(body).getPropertyValue("--shortcuts-fade")) || 0;
    return { overflow: body.scrollHeight - body.clientHeight, fade, mask: getComputedStyle(body).maskImage };
  });
}

/** Space between each label and the next one in the same list, in px: equal whether a label takes one line or two (A125). */
async function rowGaps(dialog: Locator) {
  return dialog.locator("dl").evaluateAll(lists => lists.flatMap(list => {
    const labels = [...list.querySelectorAll("dt")].map(label => label.getBoundingClientRect());
    return labels.slice(1).map((label, index) => Math.round(label.top - labels[index].bottom));
  }));
}

test("⌘K stays open through a page change, keeps what is typed, finds Impact, confirms copies, and the frame shows its keys", async ({ page, context }, testInfo) => {
  test.setTimeout(900_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const owner = await createTestUser("palette-trust-owner");
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await provisionAndSignIn(page, owner, { name: "Palette Trust", workspaceName: "Palette trust" });
    const request = await seedTestRequest(owner.id, "Palette trust request");

    await test.step("A12: letters typed while the palette's code is still loading are kept, and C, / and J fire nothing", async () => {
      // Every script asked for after the page is drawn arrives late, the palette's own included (it is never in the first load).
      let slow = false;
      await page.route("**/_next/static/chunks/**", async route => {
        if (slow) await new Promise(resolve => setTimeout(resolve, 1_500));
        await route.continue().catch(() => undefined);
      });
      await page.goto("/");
      await expect(page.getByText("Palette trust request").first()).toBeVisible();
      await hydrated(page);
      slow = true;
      await page.locator("#lane-main").focus();
      await page.keyboard.press("Meta+k");
      await page.keyboard.type("closed/j", { delay: 30 });
      await expect(field(page)).toBeFocused();
      await expect(field(page)).toHaveValue("closed/j");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await expect(field(page)).toHaveValue("closed");
      await expect(option(page, "Closed", "Requests")).toBeVisible();
      // C (New Request), / (search) and J (next row) went to the field, not the page.
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("dialog", { name: "New Request" })).toHaveCount(0);
      await expect(page.locator('#lane-main input[type="search"]')).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(palette(page)).toBeHidden();
      slow = false;
      await page.unroute("**/_next/static/chunks/**");
    });

    await test.step("A11: ⌘K pressed while a page is on its way stays open when it lands, focused, with the text", async () => {
      // Impact's page, read-ahead included, waits until released, so the click below starts a page change that hasn't landed.
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const impact = (url: URL) => url.pathname === "/impact";
      await page.route(impact, async route => { await held; await route.continue().catch(() => undefined); });
      await page.goto("/");
      await expect(page.getByText("Palette trust request").first()).toBeVisible();
      await hydrated(page);
      await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Impact", exact: true }).click();
      await page.keyboard.press("Meta+k");
      await expect(field(page)).toBeFocused();
      await page.keyboard.type("inb");
      await expect(field(page)).toHaveValue("inb");
      await expect(page).toHaveURL(/\/$/);
      release();
      await expect(page).toHaveURL(/\/impact$/);
      await expect(page.getByRole("heading", { level: 1, name: "Impact", includeHidden: true })).toBeAttached();
      await page.waitForTimeout(500);
      await expect(palette(page)).toBeVisible();
      await expect(field(page)).toBeFocused();
      await expect(field(page)).toHaveValue("inb");
      // The caret sits after the text, so the next letter adds to it.
      await page.keyboard.type("o");
      await expect(field(page)).toHaveValue("inbo");
      await page.unroute(impact);
      // Back, pressed after it opened, is a navigation it didn't start: it closes.
      await page.goBack();
      await expect(palette(page)).toBeHidden();
      await expect(page).toHaveURL(/\/$/);
    });

    await test.step("A11: a page change that starts after ⌘K closes it", async () => {
      await page.locator("#lane-main").focus();
      await page.keyboard.press("Meta+k");
      await expect(field(page)).toBeFocused();
      await page.keyboard.type("imp");
      // Something other than the palette moves the page on (a push, as a redirect after an action makes).
      await page.evaluate(() => { (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push("/inbox"); });
      await expect(palette(page)).toBeHidden();
      await expect(page).toHaveURL(/\/inbox$/);
      await expect(page.getByRole("heading", { level: 1, name: "Inbox", includeHidden: true })).toBeAttached();
      await page.waitForTimeout(500);
      await expect(palette(page)).toBeHidden();
    });

    await test.step("A13: Impact has its own entry, next to Inbox", async () => {
      await page.goto("/");
      await expect(page.getByText("Palette trust request").first()).toBeVisible();
      await run(page, "Impact");
      await expect(page).toHaveURL(/\/impact$/);
      await expect(page.getByRole("heading", { level: 1, name: "Impact" })).toBeVisible();
    });

    await test.step("feel idea 11: highlighting an entry that opens another page starts loading it", async () => {
      await page.goto("/");
      await expect(page.getByText("Palette trust request").first()).toBeVisible();
      await hydrated(page);
      await page.waitForLoadState("networkidle");
      const loads: string[] = [];
      page.on("request", ahead => { const url = new URL(ahead.url()); if (url.pathname === "/settings/profile" && url.searchParams.get("section") === "members") loads.push(ahead.url()); });
      await page.locator("#lane-main").focus();
      await page.keyboard.press("Meta+k");
      await expect(field(page)).toBeFocused();
      // Opening alone loads nothing: only a highlight the person makes does.
      await page.waitForTimeout(500);
      expect(loads).toEqual([]);
      await field(page).fill("members");
      await expect(option(page, "Members", "Settings")).toHaveAttribute("aria-selected", "true");
      await expect.poll(() => loads.length, { timeout: 5_000 }).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
    });

    await test.step("A14: Copy link and Copy code show a message on screen as well as saying it", async () => {
      await page.goto(`/requests/${request.id}`);
      await expect(page.getByRole("button", { name: "Pick up", exact: true })).toBeVisible();
      await run(page, "Copy link");
      await expect(messages(page).getByText("Link copied", { exact: true })).toBeVisible();
      await expect(page.getByText("Link copied.", { exact: true }).first()).toBeAttached();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(`/requests/${request.id}`, page.url()).href);
      await run(page, "Copy code");
      await expect(messages(page).getByText("Code copied", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^[A-Z]+-\d+$/);
    });

    await test.step("the palette keeps Change priority…, the current Request's entries and several keys per entry", async () => {
      await page.locator("#lane-main").focus();
      await page.keyboard.press("Meta+k");
      for (const name of ["Pick up", "Change priority…", "Copy link", "Copy code"]) await expect(option(page, name)).toBeAttached();
      await expect(option(page, "New Request").locator("kbd")).toHaveText(["C"]);
      await expect(option(page, "Keyboard shortcuts").locator("kbd")).toHaveText(["?"]);
      await page.keyboard.press("Escape");
      await expect(palette(page)).toBeHidden();
    });

    await test.step("the Jump to… bar opens the palette on desktop with the sidebar expanded, and hides otherwise", async () => {
      await page.goto("/");
      await expect(page.getByText("Palette trust request").first()).toBeVisible();
      await hydrated(page);
      const bar = jumpBar(page);
      await expect(bar).toBeVisible();
      await expect(bar.locator("kbd")).toHaveText([/^(⌘|Ctrl)$/, "K"]);
      await testInfo.attach("jump-bar-1440", { body: await page.locator("#lane-sidebar").screenshot(), contentType: "image/png" });
      await bar.click();
      await expect(field(page)).toBeFocused();
      await page.keyboard.type("imp");
      await expect(option(page, "Impact")).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Escape");
      await expect(palette(page)).toBeHidden();
      await expect(bar).toBeFocused();

      // The Search (/) and New Request (C) icons stay in the account row, their tips showing the key.
      const sidebar = page.getByRole("navigation", { name: "Primary navigation" });
      await sidebar.getByRole("button", { name: "Search workspace" }).hover();
      await expect(page.getByRole("tooltip").locator("kbd")).toHaveText("/");
      await page.mouse.move(900, 600, { steps: 8 });
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await sidebar.getByRole("link", { name: "New Request" }).hover();
      await expect(page.getByRole("tooltip").locator("kbd")).toHaveText("C");

      // Collapsed (the [ key), the bar goes with the sidebar; ⌘K still opens the palette.
      await page.locator("#lane-main").focus();
      await page.keyboard.press("[");
      await expect(page.locator("#lane-sidebar")).toHaveAttribute("data-collapsed", "true");
      await expect(bar).toBeHidden();
      // The pointer still rests on the collapsed rail, so its tip may be showing behind the palette. Escape closes
      // the palette all the same, every time (the tip was Radix's top layer and took the key, 18 times in 30).
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.keyboard.press("Meta+k");
        await expect(field(page)).toBeFocused();
        await page.keyboard.press("Escape");
        // [ waits while a dialog is on screen, the palette's exit included.
        await expect(palette(page)).toHaveCount(0, { timeout: 3_000 });
      }
      await page.locator("#lane-main").focus();
      await page.keyboard.press("[");
      await expect(page.locator("#lane-sidebar")).not.toHaveAttribute("data-collapsed");
      await expect(bar).toBeVisible();

      for (const width of [768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(bar, `no bar at ${width}px`).toBeHidden();
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await test.step("with a sidebar tip showing behind it, Escape goes to the popup on top: C, ?, and Change priority's step back", async () => {
      // A tip under a resting pointer was Radix's top layer and took the popup's Escape; a popup taking focus closes it.
      const tipShowing = async () => {
        // From off the sidebar, so the pointer arrives on New Request afresh and its tip opens.
        await page.mouse.move(900, 600);
        await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "New Request" }).hover();
        await expect(page.getByRole("tooltip")).toHaveCount(1);
        await page.locator("#lane-main").focus();
      };
      await page.goto("/");
      await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 60_000 });
      for (let attempt = 0; attempt < 3; attempt++) {
        await tipShowing();
        await page.keyboard.press("c");
        const composer = page.getByRole("dialog", { name: "New Request", exact: true });
        await expect(page.locator("#intake-title")).toBeFocused();
        await expect(page.getByRole("tooltip")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(composer).toHaveCount(0, { timeout: 3_000 });
        await tipShowing();
        await page.keyboard.press("?");
        const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
        await expect(shortcuts).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(shortcuts).toHaveCount(0, { timeout: 3_000 });
      }
      await page.goto(`/requests/${request.id}`);
      await hydrated(page);
      await tipShowing();
      await page.keyboard.press("Meta+k");
      await field(page).fill("Change priority");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog", { name: "Change priority" })).toBeVisible();
      await page.keyboard.press("Escape");
      // Its Escape still steps back to the entries rather than closing.
      await expect(palette(page)).toBeVisible({ timeout: 3_000 });
      await page.keyboard.press("Escape");
      await expect(palette(page)).toHaveCount(0);
      await page.mouse.move(900, 600);
    });

    await test.step("A125 and A122: the shortcuts dialog spaces rows evenly and appears at once under reduced motion", async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const width of [1440, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await expect(page.getByText("Palette trust request").first()).toBeVisible();
        await hydrated(page);
        await page.evaluate(() => {
          const w = window as unknown as { __shortcutsFirstFrame?: Promise<string[]> };
          w.__shortcutsFirstFrame = new Promise(resolve => {
            const check = () => {
              const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(node => node.textContent?.includes("Keyboard shortcuts"));
              if (!dialog) { requestAnimationFrame(check); return; }
              const overlay = dialog.previousElementSibling as HTMLElement | null;
              resolve([getComputedStyle(dialog).opacity, overlay ? getComputedStyle(overlay).opacity : "1"]);
            };
            requestAnimationFrame(check);
          });
        });
        await page.locator("#lane-main").focus();
        await page.keyboard.press("?");
        const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
        await expect(dialog).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { __shortcutsFirstFrame: Promise<string[]> }).__shortcutsFirstFrame)).toEqual(["1", "1"]);
        const gaps = await rowGaps(dialog);
        expect(Math.max(...gaps) - Math.min(...gaps), `row gaps at ${width}px: ${gaps.join(", ")}`).toBeLessThanOrEqual(1);
        // A 900px-tall desktop window holds the whole list, as before Build 4: nothing scrolls, nothing is cut.
        const body = await shortcutsBody(dialog);
        expect(body.overflow, `the list fits at ${width}x900`).toBeLessThanOrEqual(0);
        expect(body.fade, "no fade when nothing is below").toBe(0);
        expect(await inViewport(page, dialog.getByText("Request actions", { exact: true })), "the last row in view").toBe(true);
        await testInfo.attach(`shortcuts-${width}`, { body: await page.screenshot(), contentType: "image/png" });
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
      }
      await page.emulateMedia({ reducedMotion: "no-preference" });
    });

    await test.step("A desktop window too short for the list scrolls it, and the cut edge fades until the end", async () => {
      await page.setViewportSize({ width: 1440, height: 640 });
      await page.goto("/");
      await expect(page.getByText("Palette trust request").first()).toBeVisible();
      await hydrated(page);
      await page.locator("#lane-main").focus();
      await page.keyboard.press("?");
      const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(500);
      const top = await shortcutsBody(dialog);
      expect(top.overflow, "the list scrolls at 640px tall").toBeGreaterThan(0);
      expect(top.mask, "the bottom edge is masked").toContain("gradient");
      expect(top.fade, "rows fade out at the cut edge").toBeGreaterThan(16);
      await testInfo.attach("shortcuts-1440x640-top", { body: await page.screenshot(), contentType: "image/png" });
      await dialog.evaluate(node => { const body = node.lastElementChild as HTMLElement; body.scrollTop = body.scrollHeight; });
      await expect.poll(async () => (await shortcutsBody(dialog)).fade, { message: "the fade goes once the end is reached" }).toBe(0);
      await expect(dialog.getByText("Request actions", { exact: true })).toBeInViewport({ ratio: 1 });
      await testInfo.attach("shortcuts-1440x640-end", { body: await page.screenshot(), contentType: "image/png" });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await test.step("A124: on a phone the shortcuts dialog's title and close stay in place while the list scrolls", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await expect(page.getByText("Palette trust request").first()).toBeVisible();
      await hydrated(page);
      await page.waitForLoadState("networkidle");
      await page.locator("#lane-main").focus();
      await page.keyboard.press("?");
      const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(800);
      const title = dialog.getByRole("heading", { name: "Keyboard shortcuts" });
      const close = dialog.getByRole("button", { name: /^Close/ });
      const scrolled = await dialog.evaluate(node => {
        let moved = false;
        for (const element of [node, ...node.querySelectorAll<HTMLElement>("*")]) {
          if (element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY)) {
            element.scrollTop = element.scrollHeight;
            moved ||= element.scrollTop > 0;
          }
        }
        return moved;
      });
      expect(scrolled, "the list scrolls").toBe(true);
      await page.waitForTimeout(300);
      expect(await inViewport(page, title), "title in view after scrolling").toBe(true);
      expect(await inViewport(page, close), "close in view after scrolling").toBe(true);
      await expect(dialog.getByText("Submit", { exact: true })).toBeInViewport();
      const gaps = await rowGaps(dialog);
      expect(Math.max(...gaps) - Math.min(...gaps), `row gaps at 390px: ${gaps.join(", ")}`).toBeLessThanOrEqual(1);
      await testInfo.attach("shortcuts-390-scrolled", { body: await page.screenshot(), contentType: "image/png" });
      await close.click();
      await expect(dialog).toBeHidden();
    });
  } finally {
    await cleanupTestWorkspace(owner.id);
    await deleteTestUser(owner.id);
  }
});
