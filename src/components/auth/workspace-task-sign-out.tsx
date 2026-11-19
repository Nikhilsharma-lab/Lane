"use client";

import { useSession } from "@clerk/nextjs";

import { OnboardingSignOut } from "./onboarding-sign-out";

/**
 * #289 D8: on /login's create-workspace step the person is already signed in, so the auth header offers
 * "Wrong account? Sign out", as the role step after it does. Clerk's own "Signed in as … Sign out" inside the
 * card is hidden (clerkWorkspaceTaskAppearance). Nothing shows before Clerk has loaded or on any other step.
 */
export function WorkspaceTaskSignOut() {
  const { session } = useSession();
  return session?.currentTask?.key === "choose-organization" ? <OnboardingSignOut /> : null;
}
