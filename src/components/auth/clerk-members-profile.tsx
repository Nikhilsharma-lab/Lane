"use client";

import { useClerk, useOrganization } from "@clerk/nextjs";
import { Button } from "@/components/arc/button/button";
import { clerkOrganizationAppearance } from "./clerk-appearance";
import { SettingsCard } from "@/components/settings/settings-card";

/** Clerk retains the membership list, invitations and all authorization. Lane's own Members cards invite people
 * and change roles (#210); removing someone from the workspace stays in Clerk's members page, for Admins. */
export function ClerkMembersProfile() {
  const clerk = useClerk();
  const { isLoaded, organization } = useOrganization();
  return <SettingsCard title="Remove someone" description="Removing a person from this workspace happens in Clerk, which keeps every membership."
      footer="Their Requests, comments and results stay in Lane."
      action={<Button variant="secondary" size="sm" disabled={!isLoaded || !organization} onClick={() => clerk.openOrganizationProfile({ appearance: clerkOrganizationAppearance, __experimental_startPath: "/organization-members" })}>Manage members in Clerk</Button>} />;
}

export function ClerkWorkspaceProfile() {
  const clerk = useClerk();
  const { isLoaded, organization, membership } = useOrganization();
  return <div id="workspace-management" tabIndex={-1}><SettingsCard title="Workspace settings" description="Manage your workspace profile or leave the workspace through Clerk."
      footer={membership?.role === "org:admin" ? "As a workspace admin, you can update the workspace profile. To leave, open Manage workspace and choose Leave organization. Clerk checks which actions are available." : "Only workspace admins can update the workspace profile. To leave, open Manage workspace and choose Leave organization. Clerk handles the confirmation and eligibility."}
      action={<Button variant="secondary" size="sm" disabled={!isLoaded || !organization} onClick={() => clerk.openOrganizationProfile({ appearance: clerkOrganizationAppearance })}>Manage workspace</Button>} /></div>;
}
