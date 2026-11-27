import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BetterAuthSignOut } from "@/components/auth/better-auth/sign-out";
import { loadInvitationsFor } from "@/lib/data/invitations";
import { getSession, getWorkspace } from "@/lib/ensure-workspace";
import { asksForRoleStep } from "@/lib/onboarding-address";
import { timePage, timed } from "@/lib/request-timings";
import { readWorkspaceLeft, sendToSignIn } from "@/lib/session";
import { RoleForm } from "./role-form";
import { WorkspaceStep } from "./workspace-step";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// #271 (A114): the role step's tab reads "Choose your role · Lane".
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const roleStep = asksForRoleStep(await searchParams) && (await getWorkspace());
  return { title: roleStep ? "Choose your role" : "Create or join a workspace" };
}

/**
 * #391 (spec #383 "Onboarding"): the workspace step for someone signed in with no workspace, whatever the address
 * says, so nothing that sends them here loops. With one, the role step when the address has its marker, else home.
 */
export default async function OnboardingPage({ searchParams }: Props) {
  void timePage("Onboarding");
  const session = await getSession();
  if (!session) return sendToSignIn();
  if (await getWorkspace()) {
    if (!asksForRoleStep(await searchParams)) redirect("/");
    return <RoleForm headerAction={<BetterAuthSignOut />} />;
  }

  const [{ email, invitations }, workspaceLeft] = await timed("data", () => Promise.all([loadInvitationsFor(session.userId), readWorkspaceLeft()]));
  return <WorkspaceStep email={email} invitations={invitations} removedFrom={workspaceLeft ?? undefined} />;
}
