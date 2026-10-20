"use client";

import { useClerk, useSession } from "@clerk/nextjs";
import type { ReactNode } from "react";

import { AuthHeaderSlot } from "./auth-header-slot";

/**
 * Plan item 2.11: hides its children while a Clerk session task is open (choose
 * a workspace, reset the password), and until Clerk has loaded and can say
 * whether one is. If Clerk fails to load, there is no task to protect and the
 * children show. They are rendered by the caller, so this client boundary
 * carries no more than the session check.
 */
export function HiddenDuringSessionTask({ children }: { children: ReactNode }) {
  const { status } = useClerk();
  const { isLoaded, session } = useSession();
  const concealed = status !== "error" && (!isLoaded || Boolean(session?.currentTask));
  return <AuthHeaderSlot concealed={concealed}>{children}</AuthHeaderSlot>;
}
