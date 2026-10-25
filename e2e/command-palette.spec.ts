import { expect, test, type Locator, type Page } from "@playwright/test";
import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

// Issue #107 (spec #101, Testing Decisions): ⌘K and Ctrl+K on the list, a
// Request and Settings, for a member, at desktop 1440/light and phone
// 390/dark, each with and without reduced motion. What a guest is offered is
// covered by command-palette-entries.test.ts: Clerk's development instance has
// no org:guest role, so there is no guest session here (dropped 2026-10-23).
const SURFACES = [
  { width: 1440, height: 900, colorScheme: "light", reducedMotion: "no-preference" },
  { width: 1440, height: 900, colorScheme: "light", reducedMotion: "reduce" },
  { width: 390, height: 844, colorScheme: "dark", reducedMotion: "no-preference" },
  { width: 390, height: 844, colorScheme: "dark", reducedMotion: "reduce" },
] as const;
type Surface = (typeof SURFACES)[number];
const KEYS = ["Meta+k", "Control+k"] as const;
const surfaceName = (s: Surface) => `${s.width} ${s.colorScheme} ${s.reducedMotion}`;

async function applySurface(page: Page, surface: Surface) {
  await page.setViewportSize({ width: surface.width, height: surface.height });
  await page.emulateMedia({ colorScheme: surface.colorScheme, reducedMotion: surface.reducedMotion });
}

const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette", exact: true });
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** An entry by its label; places also carry their kind ("Requests", "Project", "Settings") in the name. */
const optionName = (name: string, detail?: string) => new RegExp(`^${escape(name)}${detail ? `\\s*${escape(detail)}` : ""}$`);
const option = (page: Page, name: string, detail?: string) => palette(page).getByRole("option", { name: optionName(name, detail) });

/** Records the dialog's and its overlay's opacity on the first frame they exist, before any fade could run. */
async function watchFirstFrame(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __paletteFirstFrame?: Promise<string[]> };
    w.__paletteFirstFrame = new Promise(resolve => {
      const check = () => {
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]:has(input[placeholder="Find an action or place"])');
        if (!dialog) { requestAnimationFrame(check); return; }
        const overlay = dialog.previousElementSibling as HTMLElement | null;
        resolve([getComputedStyle(dialog).opacity, overlay ? getComputedStyle(overlay).opacity : "1"]);
      };
      requestAnimationFrame(check);
    });
  });
}

async function expectInViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 0.5);
}

/** Opens with `key`, checks the palette, then closes with the same key and checks focus went back. */
async function openAndClose(page: Page, surface: Surface, key: (typeof KEYS)[number], check: () => Promise<void>) {
  const main = page.locator("#lane-main");
  await main.focus();
  await expect(main).toBeFocused();
  if (surface.reducedMotion === "reduce") await watchFirstFrame(page);
  await page.keyboard.press(key);
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByRole("combobox", { name: "Find an action or place" })).toBeFocused();
  if (surface.reducedMotion === "reduce") {
    // Spec #101 story 12: no animation under reduced motion. Fully opaque on its first frame.
    expect(await page.evaluate(() => (window as unknown as { __paletteFirstFrame: Promise<string[]> }).__paletteFirstFrame)).toEqual(["1", "1"]);
  }
  await expectInViewport(page, palette(page));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await check();
  await page.keyboard.press(key);
  await expect(palette(page)).toBeHidden();
  await expect(main).toBeFocused();
}

/** Opens the palette from the page, filters to `name`, moves to it with the arrows and runs it with Enter. */
async function run(page: Page, name: string, detail?: string) {
  await page.locator("#lane-main").focus();
  await page.keyboard.press("Meta+k");
  const field = palette(page).getByRole("combobox", { name: "Find an action or place" });
  await expect(field).toBeFocused();
  await field.fill(name);
  const target = option(page, name, detail);
  await expect(target).toHaveCount(1);
  const options = palette(page).getByRole("option");
  for (let step = 0; (await options.nth(step).getAttribute("id")) !== (await target.getAttribute("id")); step++) await page.keyboard.press("ArrowDown");
  await expect(target).toHaveAttribute("aria-selected", "true");
  await expect(field).toHaveAttribute("aria-activedescendant", (await target.getAttribute("id"))!);
  await page.keyboard.press("Enter");
  await expect(palette(page)).toBeHidden();
}

test("⌘K and Ctrl+K open the palette on the list, a Request and Settings, for a member", async ({ page, context }, testInfo) => {
  test.setTimeout(600_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const owner = await createTestUser("palette-owner");
  try {
    await provisionAndSignIn(page, owner, { name: "Palette Owner", workspaceName: "Palette acceptance" });
    const request = await seedTestRequest(owner.id, "Palette acceptance request");

    for (const surface of SURFACES) {
      await applySurface(page, surface);
      for (const key of KEYS) {
        await page.goto("/");
        await expect(page.getByText("Palette acceptance request").first()).toBeVisible();
        await openAndClose(page, surface, key, async () => {
          for (const name of ["New Request", "Search workspace", "Inbox", "Keyboard shortcuts"])
            await expect(option(page, name)).toBeAttached();
          await expect(option(page, "All Requests", "Requests")).toBeAttached();
          await expect(option(page, "Members", "Settings")).toBeAttached();
          // No current Request on the list without a highlighted row.
          await expect(option(page, "Copy link")).toHaveCount(0);
        });

        await page.goto(`/requests/${request.id}`);
        await expect(page.getByRole("button", { name: "Pick up", exact: true })).toBeVisible();
        await openAndClose(page, surface, key, async () => {
          for (const name of ["Pick up", "Change priority…", "Copy link"])
            await expect(option(page, name)).toBeAttached();
          await expect(option(page, "Mark Done")).toHaveCount(0);
        });

        await page.goto("/settings/profile");
        await expect(page.getByRole("button", { name: /Search settings/ })).toBeVisible();
        await openAndClose(page, surface, key, async () => {
          await expect(option(page, "Preferences", "Settings")).toBeAttached();
          // Settings has no search pane or ? overlay, so the palette leaves those out there; the Inbox is a page (#204).
          await expect(option(page, "Inbox")).toBeAttached();
          for (const name of ["Search workspace", "Keyboard shortcuts"])
            await expect(option(page, name)).toHaveCount(0);
        });
      }

      // The entries run as their own buttons and keys do, on every surface.
      await page.goto("/");
      await expect(page.getByText("Palette acceptance request").first()).toBeVisible();
      await run(page, "Search workspace");
      await expect(page.locator('#lane-main input[type="search"]')).toBeFocused();
      await page.keyboard.press("Escape");

      // #204: the bell's popover became the Inbox page.
      await run(page, "Inbox");
      await expect(page).toHaveURL(/\/inbox$/);
      await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
      await page.goto("/");
      await expect(page.getByText("Palette acceptance request").first()).toBeVisible();

      await run(page, "Keyboard shortcuts");
      const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
      await expect(shortcuts).toBeVisible();
      await expect(shortcuts.getByText("Open command palette", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#lane-main")).toBeFocused();

      await page.goto(`/requests/${request.id}`);
      await expect(page.getByRole("button", { name: "Pick up", exact: true })).toBeVisible();
      await run(page, "Copy link");
      await expect(page.getByText("Link copied.", { exact: true }).first()).toBeAttached();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(`/requests/${request.id}`, page.url()).href);

      await page.goto("/settings/profile");
      await expect(page.getByRole("button", { name: /Search settings/ })).toBeVisible();
      await run(page, "Preferences", "Settings");
      await expect(page).toHaveURL(/section=preferences/);
      await expect(page.locator("#settings-preferences")).toBeFocused();

      await testInfo.attach(`palette-${surfaceName(surface)}`, { body: await page.screenshot(), contentType: "image/png" });

    }
  } finally {
    await cleanupTestWorkspace(owner.id);
    await deleteTestUser(owner.id);
  }
});
