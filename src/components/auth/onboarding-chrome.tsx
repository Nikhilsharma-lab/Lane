import type { ReactNode } from "react";
import { AuthHeading, AuthShell } from "./auth-shell";

/** Plan item 2.2: no step counter. Clerk's workspace step never numbers itself,
 * and invitees skip it, so "Step 2 of 2" described a flow most people never saw. */
export function OnboardingChrome({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}

export function StepHeading({ title, description }: { title: string; description: ReactNode }) {
  return <AuthHeading title={title} description={description} />;
}
