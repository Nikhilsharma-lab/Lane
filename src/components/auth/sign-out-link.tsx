"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./auth.module.css";

/**
 * Decision 2026-10-21 (critique 2.2): onboarding's way out for a wrong account or workspace,
 * in AuthShell's header slot. Clerk-free so stories render it; `OnboardingSignOut` supplies Clerk.
 * aria-disabled, not disabled, while pending: a disabled button would drop the focus that pressed it.
 */
export function SignOutLink({ onSignOut }: { onSignOut: () => Promise<unknown> }) {
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
  async function signOut() {
    if (state === "pending") return;
    setState("pending");
    try {
      await onSignOut();
    } catch {
      setState("failed");
    }
  }
  return <div className={styles.headerLink}>
    <span role="status">{state === "failed" ? "Couldn’t sign out." : "Wrong account?"}</span>
    <button type="button" className={cn(styles.link, styles.textButton)} aria-disabled={state === "pending" || undefined} onClick={() => void signOut()}>
      {state === "pending" ? "Signing out…" : state === "failed" ? "Try again" : "Sign out"}
    </button>
  </div>;
}
