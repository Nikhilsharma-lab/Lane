/**
 * Clerk's side of specs not ported to Better Auth yet (#399). They typecheck and don't run. Whichever ticket ports or
 * deletes an export's last user deletes the export, and this file with its last one.
 */
import { clerkClient } from "@clerk/nextjs/server";
import type {} from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import * as fixtures from "./fixtures";
import { assertE2ETarget } from "./safety";

const CLERK_INSTANCE = "ins_3JlFEUdZ5q4X4z6DI7c8i7k0tYZ";

export async function safeClerkClient() {
  assertE2ETarget();
  const client = await clerkClient();
  // Prefixes cannot prove which instance the secret key belongs to.
  const instance = await client.instance.get();
  if (instance.id !== CLERK_INSTANCE || instance.environmentType !== "development") {
    throw new Error("[e2e] Clerk secret key does not belong to the pinned development instance.");
  }
  return client;
}

export async function assertOwnedUser(id: string) {
  await fixtures.assertOwnedUser(id);
  return safeClerkClient();
}

export async function assertOwnedOrganization(id: string) {
  await fixtures.assertOwnedOrganization(id);
  return safeClerkClient();
}

/** Better Auth reads the role from the member row on every request, so a ported spec needs no renewal. */
export async function renewSessionToken(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.session), undefined, { timeout: 30_000 });
  await page.evaluate(async () => { await window.Clerk!.session!.getToken({ skipCache: true }); });
}
