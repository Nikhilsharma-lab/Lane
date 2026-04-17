"use client";

import { useState } from "react";
import type { OnboardingVariant } from "@/lib/onboarding/detect-persona";

interface OnboardingFlowProps {
  variant: OnboardingVariant;
  userId: string;
  workspaceId: string;
  firstName: string;
  workspaceName: string;
}

/**
 * Stub flow — Phase D fills in the Design Head flow (4 screens),
 * Phase E the Designer flow (2 screens), Phase F the PM flow (2 screens
 * + intake check beat).
 */
export function OnboardingFlow({
  variant,
  firstName,
  workspaceName,
}: OnboardingFlowProps) {
  const [step] = useState(0);

  return (
    <div className="space-y-6 text-center">
      <p className="text-sm text-muted-foreground">
        Onboarding flow: {variant}, step {step}
      </p>
      <p className="text-lg font-semibold">
        Welcome, {firstName}. You&apos;re in.
      </p>
      <p className="text-xs text-muted-foreground">
        Workspace: {workspaceName}
      </p>
    </div>
  );
}
