"use client";

import { useEffect, useRef } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { syncAccountName } from "@/app/(app)/settings/profile/actions";
import { accountNameOf } from "@/lib/account-name";
import { callAction } from "@/lib/action-call";
import { AccountDetails } from "./account-details";
import { Button } from "@/components/arc/button/button";
import { clerkAccountAppearance } from "@/components/auth/clerk-appearance";
import { SettingsBlock, SettingsGroup, SettingsRow } from "./settings-group";

/** #261: the sign-in account's name, which Lane shows everywhere. `fallbackName` is Lane's saved copy of it. */
export function AccountProfile({ orgId, fallbackName, fallbackEmail }: { orgId: string; fallbackName: string; fallbackEmail: string }) {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const name = user ? accountNameOf(user) : null;
  // A rename under "Manage account", or one made before Lane kept names in step: Lane's copy catches up once per new name.
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!name || name === fallbackName || asked.current === name) return;
    asked.current = name;
    callAction(() => syncAccountName({ orgId })).catch(() => { asked.current = null; });
  }, [name, fallbackName, orgId]);
  return <AccountDetails name={name || fallbackName} email={user?.primaryEmailAddress?.emailAddress || fallbackEmail} image={user?.imageUrl}
    loading={!isLoaded} onManage={() => clerk.openUserProfile({ appearance: clerkAccountAppearance })} />;
}

/** Settings → Security & access: Clerk's security page, and what the Request AI check sends. */
export function AccountSecurity() {
  const clerk = useClerk();
  return <>
    <SettingsGroup label="Sign-in" labelId="account-security-sign-in">
      <SettingsRow label="Account security" hint="Manage sign-in methods, passwords, and active sessions. Available options depend on your sign-in method."
        control={<Button variant="secondary" size="sm" onClick={() => clerk.openUserProfile({ appearance: clerkAccountAppearance, __experimental_startPath: "/security" })}>Manage security</Button>} />
    </SettingsGroup>
    <SettingsGroup id="ai-data" tabIndex={-1} label="AI data use" labelId="ai-data-label" description="How the Request AI check uses your content.">
      <SettingsBlock>
        <p>When you run the AI check while creating a Request or editing its title or description, Lane sends that title and description to Anthropic (Claude Haiku 4.5) to classify the Request and, where needed, suggest a problem statement.</p>
        <p>Attachments, comments, and structured impact fields are not included in this call. Any personal or sensitive information you type into the title or description is included.</p>
        <p>This describes the current check. It does not change your account or enable additional data sharing.</p>
      </SettingsBlock>
    </SettingsGroup>
  </>;
}
