"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import * as z from "zod";

import { rememberLastUsed } from "@/app/(app)/workspace-actions";
import { db, profiles, workspaces } from "@/db";
import type { DoorAnswer } from "@/lib/auth-answer";
import { activeMemberOf } from "@/lib/auth-guard";
import { askAuthServer } from "@/lib/auth-server";
import { decideFreeRequests } from "@/lib/billing";
import { readSession } from "@/lib/session";

const onboardingRoleSchema = z.object({
  role: z.enum(["pm", "designer", "developer"]),
});
const workspaceNameSchema = z.string().trim().min(1);

/**
 * #391 (spec #383 "Onboarding"): creates a workspace with the session's person as its Admin and creator, and opens it.
 * Its slug is generated and nobody sees it (workspaces aren't routed by slug), so two may have one name. `first` says
 * it's the person's first workspace, which the role step follows.
 */
export async function createWorkspace(name: string): Promise<DoorAnswer<{ first: boolean }>> {
  const parsed = workspaceNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false };
  const session = await readSession();
  if (!session) return { ok: false, code: "UNAUTHORIZED" };

  const created = await askAuthServer((api, asCaller) => api.createOrganization({ ...asCaller, body: { name: parsed.data, slug: randomUUID() } }));
  if (!created.ok) return created;
  const orgId = created.data.id;
  await db.update(workspaces).set({ ownerUserId: session.userId }).where(eq(workspaces.id, orgId));
  await decideFreeRequests({ orgId });
  const remembered = await rememberLastUsed();
  return { ok: true, data: { first: remembered.ok && remembered.data.first } };
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
