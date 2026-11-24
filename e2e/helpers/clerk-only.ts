/**
 * Clerk's side of specs not ported to Better Auth yet (#399). They typecheck and don't run. Whichever ticket ports or
 * deletes an export's last user deletes the export, and this file with its last one.
 */
import { clerkClient } from "@clerk/nextjs/server";
import type {} from "@clerk/testing/playwright";
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

export async function assertOwnedOrganization(id: string) {
  await fixtures.assertOwnedOrganization(id);
  return safeClerkClient();
}
