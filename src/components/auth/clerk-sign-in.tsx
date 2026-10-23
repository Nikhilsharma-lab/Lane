"use client";

import {
  ClerkFailed,
  ClerkLoading,
  SignIn,
  TaskChooseOrganization,
  TaskResetPassword,
  useSession,
} from "@clerk/nextjs";
import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { clerkEmbeddedAppearance } from "./clerk-appearance";
import { AuthCardSkeleton } from "./auth-card-skeleton";
import { ClerkUnavailable } from "./clerk-unavailable";
export { clerkEmbeddedAppearance } from "./clerk-appearance";

export function ClerkHashSignIn() {
  return <Suspense fallback={<AuthCardSkeleton label="Loading sign in" />}><HashSignInWithReturn /></Suspense>;
}

function HashSignInWithReturn() {
  // Server redirects use the outer query; Clerk's hash router reads its fragment.
  // Pass the outer destination through Clerk's validated fallback URL as well.
  const returnUrl = useSearchParams().get("redirect_url") || "/";
  return (
    <SignIn
      routing="hash"
      signUpUrl="/signup"
      fallbackRedirectUrl={returnUrl}
      appearance={clerkEmbeddedAppearance}
      fallback={<><ClerkLoading><AuthCardSkeleton label="Loading sign in" /></ClerkLoading><ClerkFailed><ClerkUnavailable title="Sign in is unavailable right now" href="/login" /></ClerkFailed></>}
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
