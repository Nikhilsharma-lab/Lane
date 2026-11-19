"use client";

import { useClerk, useOrganization } from "@clerk/nextjs";
import { Button } from "@/components/arc/button/button";
import { clerkOrganizationAppearance } from "./clerk-appearance";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-group";

/** #288: its own module, so it loads with the Members section rather than with every Settings page. Clerk retains the membership list, invitations and all authorization. Lane's Members section invites people
 * and changes roles (#210); removing someone from the workspace stays in Clerk's members page, for Admins. */
export function ClerkMembersRemove() {
  const clerk = useClerk();
  const { isLoaded, organization } = useOrganization();
  return <SettingsGroup>
    <SettingsRow label="Remove someone" hint="Removing a person from this workspace happens in Clerk, which keeps every membership. Their Requests, comments and results stay in Lane."
      control={<Button variant="secondary" size="sm" disabled={!isLoaded || !organization} onClick={() => clerk.openOrganizationProfile({ appearance: clerkOrganizationAppearance, __experimental_startPath: "/organization-members" })}>Manage members in Clerk</Button>} />
  </SettingsGroup>;
}
