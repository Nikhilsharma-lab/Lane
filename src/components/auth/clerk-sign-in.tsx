"use client";

import {
  SignIn,
  TaskChooseOrganization,
  TaskResetPassword,
  useSession,
} from "@clerk/nextjs";
import type { ReactNode } from "react";

import { clerkEmbeddedAppearance } from "./clerk-appearance";
import { AuthCardSkeleton, AuthLoading } from "./auth-loading";
import { AuthHeaderLink } from "./auth-shell";
export { clerkEmbeddedAppearance } from "./clerk-appearance";

export function ClerkHashSignIn() {
  return (
    <SignIn
      routing="hash"
      signUpUrl="/signup"
      fallbackRedirectUrl="/"
      appearance={clerkEmbeddedAppearance}
      fallback={<AuthCardSkeleton label="Loading sign in" />}
    />
  );
}

/**
 * Plan item 2.11: the reset link is for people signing in. While a session task
 * is open (choose a workspace, reset the password) it has nothing to offer, and
 * until Clerk loads it cannot be known, so it keeps its place but stays hidden.
 */
export function SignInResetLink() {
  const { isLoaded, session } = useSession();
  return (
    <AuthHeaderLink
      prompt="Forgot your password?"
      href="/forgot-password"
      label="Reset it"
      concealed={!isLoaded || Boolean(session?.currentTask)}
    />
  );
}

export function ClerkSessionTasks({
  fallback,
}: {
  fallback: ReactNode;
}) {
  const { session } = useSession();

  if (session?.currentTask?.key === "choose-organization") {
    return (
      <TaskChooseOrganization
        redirectUrlComplete="/onboarding"
        appearance={clerkEmbeddedAppearance}
        fallback={<AuthLoading label="Loading workspaces" />}
      />
    );
  }

  if (session?.currentTask?.key === "reset-password") {
    return (
      <TaskResetPassword
        redirectUrlComplete="/"
        appearance={clerkEmbeddedAppearance}
        fallback={<AuthCardSkeleton label="Loading password reset" fields={2} social={false} />}
      />
    );
  }

  return fallback;
}
