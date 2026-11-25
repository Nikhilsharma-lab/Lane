import type { Page } from "@playwright/test";

/**
 * Waits until what the page streamed is on screen. React puts each streamed part in a hidden holder and shows it on a
 * later frame; until then the page can hold two copies of it, one hidden, and a locator meets both.
 */
export async function streamedIn(page: Page): Promise<void> {
  await page.waitForFunction(() => document.readyState !== "loading" && !document.querySelector('div[hidden][id^="S:"]'));
}
