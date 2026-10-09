"use client";

import {
  SignIn,
  TaskChooseOrganization,
  TaskResetPassword,
  useSession,
} from "@clerk/nextjs";
import type { ReactNode } from "react";

import { clerkEmbeddedAppearance } from "./clerk-appearance";
export { clerkEmbeddedAppearance } from "./clerk-appearance";

export function ClerkHashSignIn() {
  return (
    <SignIn
      routing="hash"
      signUpUrl="/signup"
      fallbackRedirectUrl="/"
      appearance={clerkEmbeddedAppearance}
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
      />
    );
  }

  if (session?.currentTask?.key === "reset-password") {
    return (
      <TaskResetPassword
        redirectUrlComplete="/"
        appearance={clerkEmbeddedAppearance}
      />
    );
  }

  return fallback;
}
