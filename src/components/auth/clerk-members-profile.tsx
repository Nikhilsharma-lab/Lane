"use client";

import { useClerk, useOrganization } from "@clerk/nextjs";
import { Button } from "@/components/arc/button/button";
import { clerkOrganizationAppearance } from "./clerk-appearance";
import { SettingsRow } from "@/components/settings/settings-group";

/** Clerk retains every membership and invitation; Lane's Members section invites and changes roles (#210), and the
 * Clerk removal row lives in clerk-members-remove.tsx, loaded with Members (#288). */
export function ClerkWorkspaceProfile() {
  const clerk = useClerk();
  const { isLoaded, organization, membership } = useOrganization();
  // #287: the last row of Workspace details' group, and the "Leave workspace" search target.
  return <SettingsRow id="workspace-management" label="Workspace settings"
    hint={membership?.role === "org:admin" ? "As an Admin, you can update the workspace profile. To leave, open Manage workspace and choose Leave workspace. Clerk checks which actions are available." : "Only Admins can update the workspace profile. To leave, open Manage workspace and choose Leave workspace. Clerk handles the confirmation and eligibility."}
    control={<Button variant="secondary" size="sm" disabled={!isLoaded || !organization} onClick={() => clerk.openOrganizationProfile({ appearance: clerkOrganizationAppearance })}>Manage workspace</Button>} />;
}
