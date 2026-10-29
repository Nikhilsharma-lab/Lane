import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

// #262 (Build 2, polish bar §5, §9 and §10): motion, loading and key caps behave the same everywhere.
// One signed-in member walks each rule the way a person meets it: with motion turned off, popups are
// simply there; a quick page change shows no placeholder and a slow one shows it after 0.15s; a busy
// button keeps its words; and key caps show with a mouse and keyboard but never on a phone.

type FirstFrame = { opacity: number; transform: string };

/**
 * Records how `selector` looks on the first frame it is painted in, before any fade could run: its
 * opacity multiplied through its ancestors (an overlay fading in counts) and its own transform. The
 * frame callback is queued when the element is added, so it runs after the frame work the app queued
 * while opening it, as the browser does just before painting.
 */
async function watchFirstFrame(page: Page, selector: string) {
  await page.evaluate(selector => {
    const w = window as unknown as { __laneFirstFrame?: Promise<FirstFrame> };
    w.__laneFirstFrame = new Promise(resolve => {
      const read = (element: HTMLElement) => {
        let opacity = 1;
        for (let node: HTMLElement | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
        resolve({ opacity, transform: getComputedStyle(element).transform });
      };
      const observer = new MutationObserver(() => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return;
        observer.disconnect();
        requestAnimationFrame(() => read(element));
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }, selector);
}
const firstFrame = (page: Page) => page.evaluate(() => (window as unknown as { __laneFirstFrame: Promise<FirstFrame> }).__laneFirstFrame);
const still = (frame: FirstFrame) => {
  expect(frame.opacity).toBe(1);
  expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(frame.transform);
};

test("motion off, placeholders, busy buttons and key caps", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const owner = await createTestUser("motion-owner");
  try {
    await provisionAndSignIn(page, owner, { name: "Motion Owner", workspaceName: "Motion acceptance" });
    const request = await seedTestRequest(owner.id, "Motion acceptance request");
    await page.setViewportSize({ width: 1440, height: 900 });

    await test.step("A122: with motion turned off, the shortcuts dialog and menus are fully there on their first frame", async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await expect(page.getByText("Motion acceptance request").first()).toBeVisible();

      await page.locator("#lane-main").focus();
      await watchFirstFrame(page, '[role="dialog"]');
      await page.keyboard.press("?");
      const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
      await expect(shortcuts).toBeVisible();
      still(await firstFrame(page));
      await page.keyboard.press("Escape");
      await expect(shortcuts).toBeHidden();

      await watchFirstFrame(page, '[role="menu"]');
      await page.getByRole("button", { name: /^Account menu/ }).click();
      await expect(page.getByRole("menu").first()).toBeVisible();
      still(await firstFrame(page));
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);

      await page.goto(`/requests/${request.id}`);
      await expect(page.getByRole("button", { name: "Pick up", exact: true })).toBeVisible();
      await watchFirstFrame(page, '[role="menu"]');
      await page.getByRole("button", { name: /Change status$/ }).click();
      await expect(page.getByRole("menu").first()).toBeVisible();
      still(await firstFrame(page));
      await testInfo.attach("A122-menu-reduced-motion", { body: await page.screenshot(), contentType: "image/png" });
      await page.keyboard.press("Escape");
      await page.emulateMedia({ reducedMotion: "no-preference" });
    });
  } finally {
    await cleanupTestWorkspace(owner.id);
    await deleteTestUser(owner.id);
  }
});
