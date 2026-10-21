"use client";

import {
  SignIn,
  TaskChooseOrganization,
  TaskResetPassword,
  useSession,
} from "@clerk/nextjs";
import type { ReactNode } from "react";

import { clerkEmbeddedAppearance } from "./clerk-appearance";
import { AuthCardSkeleton } from "./auth-card-skeleton";
import { ClerkLoadFallback } from "./clerk-load-fallback";
export { clerkEmbeddedAppearance } from "./clerk-appearance";

export function ClerkHashSignIn() {
  return (
    <SignIn
      routing="hash"
      signUpUrl="/signup"
      fallbackRedirectUrl="/"
      appearance={clerkEmbeddedAppearance}
      fallback={<ClerkLoadFallback skeleton={<AuthCardSkeleton label="Loading sign in" />} unavailableTitle="Sign in is unavailable right now" />}
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
        fallback={<AuthCardSkeleton label="Loading workspaces" fields={0} social={false} />}
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
