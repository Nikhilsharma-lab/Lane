import { randomInt } from "node:crypto";
import { expect, test as base, type Page } from "@playwright/test";

/**
 * #401: for suites that use Lane's signed-out forms. Every context a test opens calls from an address of the test's
 * own, in the range kept for benchmarks, because Better Auth limits sign-in calls by address and local browsers have
 * none to tell them apart by. A deployment's own proxy overwrites the header.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => provide({ "x-vercel-forwarded-for": `198.18.${randomInt(256)}.${randomInt(1, 255)}` }),
});

/** Opens a page and waits until its form answers a press. */
export async function openForm(page: Page, address: string) {
  await page.goto(address);
  await formReady(page);
}

/** Waits until React has the page's form: a press before that would submit it as plain HTML. */
export async function formReady(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return form !== null && Object.keys(form).some((key) => key.startsWith("__reactProps"));
  });
}

/** Waits for Turnstile's token. Its test key always passes, but not at once, and each call that sends a token spends it. */
export async function passHumanCheck(page: Page) {
  await expect(page.locator('[data-turnstile] input[name="cf-turnstile-response"]')).not.toHaveValue("", { timeout: 30_000 });
}

/** Types a code into the code boxes. */
export async function typeCode(page: Page, label: "Sign-in code" | "Confirmation code" | "Reset code", code: string) {
  await page.getByRole("group", { name: label }).getByRole("textbox").first().pressSequentially(code);
}
