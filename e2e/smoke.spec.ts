// A2a smoke test: proves the Playwright harness can reach the dev
// server and render Lane's pages. Unauthenticated — does not exercise
// any user flow yet (those land in Phase D once auth fixtures + Lane
// public schema are in place).
//
// Two assertions:
//   1. Homepage responds with status < 500 (server is up, middleware ran)
//   2. /login renders with the distinctive "Sign in to your workspace"
//      copy (proves the login-page route + components are wired)

import { test, expect } from "@playwright/test";

test("homepage responds without server error", async ({ page }) => {
  const response = await page.goto("/");
  expect(response, "page.goto returned no response").not.toBeNull();
  expect(response!.status(), "homepage server-side response").toBeLessThan(500);
});

test("/login renders the sign-in card", async ({ page }) => {
  await page.goto("/login");

  // Distinctive copy on the login page (card description). Tied to a
  // specific UX element, not the page title (which is just "Lane" on
  // every route). If this string changes, the test should fail and we
  // update it intentionally.
  await expect(
    page.getByText("Sign in to your workspace"),
    "login page card description"
  ).toBeVisible();

  // Sanity: the email input exists. Cheaper signal than rendering
  // the full form, but catches a totally-broken page.
  await expect(
    page.locator("input#email"),
    "login form email input"
  ).toBeVisible();
});
