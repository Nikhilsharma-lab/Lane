"use client";

import { useEffect, useEffectEvent } from "react";
import { updateFirstRun } from "@/app/(app)/first-run-actions";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { callAction } from "@/lib/action-call";

/**
 * #217: help finds the first run again. "First-run guide" in the account menu links to `/#first-run`; the
 * Requests list hears the hash on arrival or when it changes. A guide on screen takes focus; a skipped or finished
 * one is reopened, and the page's revalidated render brings it back, focused.
 */
export const FIRST_RUN_HASH = "#first-run";

let focusRequested = false;
/** Whether a reopened guide should take focus when it mounts (asked once). */
export function consumeFocusRequest(): boolean {
  const asked = focusRequested;
  focusRequested = false;
  return asked;
}

/** Drops `#first-run` from the address, keeping the path and query, so a reload doesn't reopen it again. */
export function clearHelpHash() {
  if (window.location.hash === FIRST_RUN_HASH) window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
}

/** Calls `onHelp` when the page is reached through help, and each time help is used again on it. */
export function useFirstRunHelp(onHelp: () => void) {
  const heard = useEffectEvent(() => { if (window.location.hash === FIRST_RUN_HASH) onHelp(); });
  useEffect(() => {
    heard();
    const listener = () => heard();
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
}

/** Rendered in place of a skipped or finished first run: it reopens the guide when help asks for it. */
export function FirstRunReopen({ orgId }: { orgId: string }) {
  const { toast } = useToastStack();
  useFirstRunHelp(() => {
    clearHelpHash();
    focusRequested = true;
    void callAction(() => updateFirstRun({ change: "reopen" }, { orgId })).then(
      answer => { if ("error" in answer) { focusRequested = false; toast({ type: "error", title: answer.error }); } },
      () => { focusRequested = false; toast({ type: "error", title: "Couldn’t open the first-run guide. Try again." }); },
    );
  });
  return null;
}
