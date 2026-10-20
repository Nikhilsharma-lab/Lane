"use client";

import { useClerk, useOrganization } from "@clerk/nextjs";
import { Button } from "@/components/arc/button/button";
import { clerkOrganizationAppearance } from "./clerk-appearance";
import { SettingsCard } from "@/components/settings/settings-card";

/** Clerk retains the membership list, invitations and all authorization. */
export function ClerkMembersProfile() {
  const clerk = useClerk();
  const { isLoaded, organization, membership } = useOrganization();
  return <SettingsCard title="Members and invitations" description="View the people in your workspace and their access."
      footer={membership?.role === "org:admin" ? "As a workspace admin, you can invite teammates and manage their access. PM, Designer, and Developer are profile labels, not access permissions." : "You can view members. Only workspace admins can invite teammates or change access. PM, Designer, and Developer are profile labels, not access permissions."}
      action={<Button variant="secondary" size="sm" disabled={!isLoaded || !organization} onClick={() => clerk.openOrganizationProfile({ appearance: clerkOrganizationAppearance, __experimental_startPath: "/organization-members" })}>Manage members</Button>} />;
}

export function ClerkWorkspaceProfile() {
  const clerk = useClerk();
  const { isLoaded, organization, membership } = useOrganization();
  return <div id="workspace-management" tabIndex={-1}><SettingsCard title="Workspace settings" description="Manage your workspace profile or leave the workspace through Clerk."
      footer={membership?.role === "org:admin" ? "As a workspace admin, you can update the workspace profile. To leave, open Manage workspace and choose Leave organization. Clerk checks which actions are available." : "Only workspace admins can update the workspace profile. To leave, open Manage workspace and choose Leave organization. Clerk handles the confirmation and eligibility."}
      action={<Button variant="secondary" size="sm" disabled={!isLoaded || !organization} onClick={() => clerk.openOrganizationProfile({ appearance: clerkOrganizationAppearance })}>Manage workspace</Button>} /></div>;
}
