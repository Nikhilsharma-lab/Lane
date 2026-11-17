"use client";

import { useClerk, useOrganization } from "@clerk/nextjs";
import { Button } from "@/components/arc/button/button";
import { clerkOrganizationAppearance } from "./clerk-appearance";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-group";

/** Clerk retains the membership list, invitations and all authorization. Lane's own Members cards invite people
 * and change roles (#210); removing someone from the workspace stays in Clerk's members page, for Admins. */
export function ClerkMembersProfile() {
  const clerk = useClerk();
  const { isLoaded, organization } = useOrganization();
  return <SettingsGroup>
    <SettingsRow label="Remove someone" hint="Removing a person from this workspace happens in Clerk, which keeps every membership. Their Requests, comments and results stay in Lane."
      control={<Button variant="secondary" size="sm" disabled={!isLoaded || !organization} onClick={() => clerk.openOrganizationProfile({ appearance: clerkOrganizationAppearance, __experimental_startPath: "/organization-members" })}>Manage members in Clerk</Button>} />
  </SettingsGroup>;
}

export function ClerkWorkspaceProfile() {
  const clerk = useClerk();
  const { isLoaded, organization, membership } = useOrganization();
  // #287: the last row of Workspace details' group, and the "Leave workspace" search target.
  return <SettingsRow id="workspace-management" label="Workspace settings"
    hint={membership?.role === "org:admin" ? "As a workspace admin, you can update the workspace profile. To leave, open Manage workspace and choose Leave workspace. Clerk checks which actions are available." : "Only workspace admins can update the workspace profile. To leave, open Manage workspace and choose Leave workspace. Clerk handles the confirmation and eligibility."}
    control={<Button variant="secondary" size="sm" disabled={!isLoaded || !organization} onClick={() => clerk.openOrganizationProfile({ appearance: clerkOrganizationAppearance })}>Manage workspace</Button>} />;
}
