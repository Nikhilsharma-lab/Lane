"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { AccountDetails } from "./account-details";
import { Button } from "@/components/arc/button/button";
import { clerkAccountAppearance } from "@/components/auth/clerk-appearance";
import { SettingsCard } from "./settings-card";

export function AccountProfile({ fallbackName, fallbackEmail }: { fallbackName: string; fallbackEmail: string }) {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  return <><AccountDetails name={user?.fullName || fallbackName} email={user?.primaryEmailAddress?.emailAddress || fallbackEmail} image={user?.imageUrl}
    loading={!isLoaded} onManage={() => clerk.openUserProfile({ appearance: clerkAccountAppearance })} />
    <div id="connected-accounts" tabIndex={-1}><SettingsCard title="Connected accounts" description="Accounts used to sign in to Lane." footer="Clerk manages your sign-in connections. External work-tool integrations are listed separately in Coming soon." action={<Button variant="secondary" size="sm" disabled={!isLoaded} onClick={() => clerk.openUserProfile({ appearance: clerkAccountAppearance })}>Manage connected accounts</Button>} /></div></>;
}

export function AccountSecurity() {
  const clerk = useClerk();
  return <><SettingsCard title="Account security" description="Manage sign-in methods, passwords, and active sessions."
    footer="Available options depend on your sign-in method."
    action={<Button variant="secondary" size="sm" onClick={() => clerk.openUserProfile({ appearance: clerkAccountAppearance, __experimental_startPath: "/security" })}>Manage security</Button>} />
    <div id="ai-data" tabIndex={-1}><SettingsCard title="AI data use" description="How the Request AI check uses your content." footer="This describes the current check. It does not change your account or enable additional data sharing.">
      <p>When you run the AI check while creating a Request or editing its title or description, Lane sends that title and description to Anthropic (Claude Haiku 4.5) to classify the Request and, where needed, suggest a problem statement.</p>
      <p>Attachments, comments, and structured impact fields are not included in this call. Any personal or sensitive information you type into the title or description is included.</p>
    </SettingsCard></div></>;
}
