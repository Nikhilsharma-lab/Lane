"use client";

import { rememberJoined } from "@/components/auth/better-auth/arrival";
import { OnboardingWorkspaceStep, type OnboardingWorkspaceStepProps } from "@/components/auth/better-auth/onboarding-view";
import { BetterAuthSignOut } from "@/components/auth/better-auth/sign-out";
import { callAction } from "@/lib/action-call";
import type { AuthAnswer } from "@/lib/auth-answer";
import { acceptInvitation } from "@/lib/auth-client";
import { addressAfterArriving } from "@/lib/onboarding-address";
import { createWorkspace } from "./actions";

/** A full page load, so the server reads the workspace the session is now in. */
const load = (address: string) => window.location.assign(address);

/** Accepts the invitation, then goes to the role step or home. */
export async function joinThenGo(invitationId: string, go = load): Promise<AuthAnswer> {
  const joined = await acceptInvitation(invitationId);
  if (joined.ok) go(await rememberJoined());
  return joined;
}

/** Creates the workspace, then goes to the role step or home. */
export async function createThenGo(name: string, go = load): Promise<AuthAnswer> {
  const created = await callAction(() => createWorkspace(name));
  if (created.ok) go(addressAfterArriving(created));
  return created;
}

/** #391: increment 4's workspace step with its calls, which a Server Component can't pass. */
export function WorkspaceStep(props: Pick<OnboardingWorkspaceStepProps, "email" | "invitations" | "removedFrom">) {
  return <OnboardingWorkspaceStep {...props} signOut={<BetterAuthSignOut />} onJoin={(id) => joinThenGo(id)} onCreate={(name) => createThenGo(name)} />;
}
