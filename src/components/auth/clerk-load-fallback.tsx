"use client";

import { useClerk } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { ClerkUnavailable } from "./clerk-unavailable";

/** Clerk's `fallback` for its sign-in and sign-up cards: the card skeleton while Clerk loads, the unavailable
 * message once Clerk's status is "error". No timer: a slow load keeps its skeleton. */
export function ClerkLoadFallback({ skeleton, unavailableTitle }: { skeleton: ReactNode; unavailableTitle: string }) {
  const { status } = useClerk();
  if (status === "error") return <ClerkUnavailable title={unavailableTitle} onReload={() => window.location.reload()} />;
  return skeleton;
}
