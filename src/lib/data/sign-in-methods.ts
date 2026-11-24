import "server-only"

import { and, eq, inArray, sql } from "drizzle-orm"
import { account, db } from "@/db"

/** The ways a person signs in besides an emailed code: the account rows Better Auth keeps for them. */
export type SignInMethods = { password: boolean; google: boolean }

/** #394: the person's sign-in methods, for Settings → Profile. Whether each is there, never what it holds. */
export async function loadSignInMethods(userId: string): Promise<SignInMethods> {
  const rows = await db
    .select({ provider: account.providerId, hasPassword: sql<boolean>`${account.password} is not null` })
    .from(account)
    .where(and(eq(account.userId, userId), inArray(account.providerId, ["credential", "google"])))
  return {
    password: rows.some(({ provider, hasPassword }) => provider === "credential" && hasPassword),
    google: rows.some(({ provider }) => provider === "google"),
  }
}
