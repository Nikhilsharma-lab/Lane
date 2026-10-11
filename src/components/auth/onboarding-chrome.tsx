import type { ReactNode } from "react";
import { AuthShell } from "./auth-shell";

export function OnboardingChrome({ current, total, children }: { current?: number; total?: number; children: ReactNode; wide?: boolean }) {
  return <AuthShell headerAction={<span className="text-xs text-muted-foreground" role="status">
    {typeof current === "number" && typeof total === "number" ? `Step ${current} of ${total}` : "Preparing setup…"}
  </span>}>{children}</AuthShell>;
}
