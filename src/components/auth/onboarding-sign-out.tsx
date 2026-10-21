"use client";

import { useClerk } from "@clerk/nextjs";
import { SignOutLink } from "./sign-out-link";

/** Signs out through Clerk and returns to /login, as the workspace menu's Log out does. */
export function OnboardingSignOut() {
  const { signOut } = useClerk();
  return <SignOutLink onSignOut={() => signOut({ redirectUrl: "/login" })} />;
}
