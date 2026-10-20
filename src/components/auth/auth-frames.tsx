import { LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AuthHeaderLink, AuthShell, AuthTrust } from "./auth-shell";

// Plan item 2.11: each auth page, its loading state and Clerk's own fallback
// render inside one frame, so only the card changes while Clerk loads.

/** The header action is passed in, so the frame stays free of Clerk: the routes pass `SignInResetLink`. */
export function LoginFrame({ headerAction, children }: { headerAction: ReactNode; children: ReactNode }) {
  return <AuthShell headerAction={headerAction} footer={
    <AuthTrust icon={LockKeyholeIcon} className="justify-center sm:justify-start">Sign in to access your Lane workspace.</AuthTrust>
  }>{children}</AuthShell>;
}

export function SignupFrame({ children }: { children: ReactNode }) {
  return <AuthShell footer={
    <AuthTrust icon={ShieldCheckIcon} className="justify-center sm:justify-start">Create or join a workspace after signing up.</AuthTrust>
  }>{children}</AuthShell>;
}

/** Forgot and reset share one frame. */
export function RecoveryFrame({ children }: { children: ReactNode }) {
  return <AuthShell headerAction={<AuthHeaderLink prompt="Remembered it?" href="/login" label="Sign in" />} footer={
    <AuthTrust icon={LockKeyholeIcon} className="justify-center sm:justify-start">Reset the password for your Lane account.</AuthTrust>
  }>{children}</AuthShell>;
}
