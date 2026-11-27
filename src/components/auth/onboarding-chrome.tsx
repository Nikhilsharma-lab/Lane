import type { ReactNode } from "react";
import { AuthShell } from "./auth-shell";

/** Plan item 2.2: no step counter. Invitees skip the workspace step,
 * so "Step 2 of 2" described a flow most people never saw. */
export function OnboardingChrome({ children, headerAction }: { children: ReactNode; headerAction?: ReactNode }) {
  return <AuthShell headerAction={headerAction}>{children}</AuthShell>;
}
