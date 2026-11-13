import type { Page } from "@playwright/test";

/**
 * What axe's "aria-hidden-focus" rule finds: controls hidden from screen readers that Tab could still reach. Each is
 * named by its text or label.
 */
export const hiddenButFocusable = (page: Page) => page.evaluate(() => {
  const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  return [...document.querySelectorAll('[aria-hidden="true"]')]
    .flatMap(hidden => [hidden, ...hidden.querySelectorAll(focusable)])
    // Radix's focus guards are the menu's own: empty, and they hand focus straight back into it.
    .filter(element => element.matches(focusable) && !element.closest("[inert]") && !element.hasAttribute("data-radix-focus-guard") && element.getClientRects().length > 0)
    .map(element => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName);
});

/** Whether focus is inside the open menu, list or popup with this role. */
export const focusInside = (page: Page, role: "menu" | "listbox" | "dialog") => page.evaluate(role => Boolean(document.activeElement?.closest(`[role="${role}"]`)), role);
