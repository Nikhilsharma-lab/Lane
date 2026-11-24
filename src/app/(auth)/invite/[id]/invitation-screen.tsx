"use client";

import { switchWorkspace } from "@/app/(app)/workspace-actions";
import { rememberJoined } from "@/components/auth/better-auth/arrival";
import { InvitationView, type InvitationViewProps } from "@/components/auth/better-auth/invitation-view";
import { callAction } from "@/lib/action-call";

/** A full page load, so the server reads the workspace the session is now in. */
async function goOn() {
  window.location.assign(await rememberJoined());
}

/** #392: increment 4's invitation view with its calls, which a Server Component can't pass. */
export function InvitationScreen({ workspaceId, ...view }: Pick<InvitationViewProps, "invitation" | "viewer"> & { workspaceId: string }) {
  return <InvitationView {...view} openWorkspace={() => callAction(() => switchWorkspace(workspaceId))} onJoined={() => void goOn()} />;
}
