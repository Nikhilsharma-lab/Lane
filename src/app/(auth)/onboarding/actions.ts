"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import * as z from "zod";

import { db, profiles, workspaces } from "@/db";
import type { DoorAnswer } from "@/lib/auth-answer";
import { activeMemberOf } from "@/lib/auth-guard";
import { askAuthServer } from "@/lib/auth-server";
import { decideFreeRequestsWithCreator } from "@/lib/billing";
import { saveLastUsed } from "@/lib/last-workspace";
import { readName } from "@/lib/name-rules";
import { readSession } from "@/lib/session";

const onboardingRoleSchema = z.object({
  role: z.enum(["pm", "designer", "developer"]),
});

/**
 * #391 (spec #383 "Onboarding"): creates a workspace with the session's person as its Admin and creator, and opens it.
 * Its slug is generated and nobody sees it (workspaces aren't routed by slug), so two may have one name. `first` says
 * it's the person's first workspace, which the role step follows. Its creator, Free Requests and last used are saved
 * together; when they can't be, the workspace goes again, so none is left without them.
 */
export async function createWorkspace(name: string): Promise<DoorAnswer<{ first: boolean }>> {
  const read = readName(name);
  if (!read.ok) return read;
  const session = await readSession();
  if (!session) return { ok: false, code: "UNAUTHORIZED" };

  const created = await askAuthServer((api, asCaller) => api.createOrganization({ ...asCaller, body: { name: read.name, slug: randomUUID() } }));
  if (!created.ok) return created;
  // The new workspace, which Better Auth made the session's.
  const orgId = created.data.id;
  const { userId } = session;
  try {
    const data = await db.transaction(async (tx) => {
      await tx.update(workspaces).set({ ownerUserId: userId }).where(eq(workspaces.id, orgId));
      await decideFreeRequestsWithCreator(tx, { orgId });
      return saveLastUsed(tx, { userId, orgId });
    });
    return { ok: true, data };
  } catch (error) {
    console.error("[onboarding] workspace not finished, removed:", error instanceof Error ? error.name : "unknown error");
    await db.delete(workspaces).where(eq(workspaces.id, orgId));
    return { ok: false };
  }
}

export async function saveOnboardingRole(data: { role: string }) {
  const parsed = onboardingRoleSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose a valid role." };

  const session = await readSession();
  if (!session) return { error: "Sign in to continue.", sessionExpired: true as const };
  if (!activeMemberOf(session)) {
    // #290: the role step links this message to the create-workspace step.
    return { error: "Create or join a workspace before choosing your role.", needsWorkspace: true as const };
  }

  await db.update(profiles).set({ role: parsed.data.role, updatedAt: new Date() }).where(eq(profiles.id, session.userId));

  // Plan item 2.2: the saved role and the welcome arrive in one response.
  // Signing in soft-navigates to /, whose layout redirects here, and with
  // staleTimes.dynamic at 30 s the client router keeps that redirect for /.
  // A client navigation to / inside those 30 s would replay it.
  // - The redirect makes this response carry a fresh render of /, so
  //   /onboarding is never rendered again and no second request is needed.
  // - The revalidation is what stops the cached segments winning: a navigation
  //   seeded by an action that did not revalidate still reads the client's
  //   cache before the seed (Next 16.2 ppr-navigations, FreshnessPolicy.Default).
  // RoleForm treats the redirect's rejection as the success.
  revalidatePath("/");
  redirect("/", RedirectType.replace);
}
