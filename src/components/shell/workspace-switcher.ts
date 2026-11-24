import type { AuthAnswer } from "@/lib/auth-answer";
import type { OwnWorkspace } from "@/lib/data/workspaces";
import { OfflineError } from "@/lib/offline-error";
import { ShownFailure } from "@/lib/failure-messages";

export type WorkspaceSwitchSnapshot = {
  currentId: string;
  items: readonly OwnWorkspace[];
};

type WorkspaceSwitchDependencies = {
  getSnapshot: () => WorkspaceSwitchSnapshot;
  /** The switch Server Action (#389). */
  switchTo: (id: string) => Promise<AuthAnswer>;
  beforeSwitch: () => void | Promise<void>;
  onPendingChange: (id: string | null) => void;
  replace: (href: string) => void;
  /** #269 (A111): whether the browser is offline now (src/lib/connection-status.ts). */
  isOffline?: () => boolean;
  /** #269 (A111): calls back when the browser goes offline; returns the unsubscribe. */
  watchOffline?: (onOffline: () => void) => () => void;
  /** #269 (A111): how long the server gets to answer before the switch gives up. */
  timeoutMs?: number;
};

/** #269 (A111): long enough for a slow connection, short enough that nobody waits on a switch that won't come. */
export const SWITCH_TIMEOUT_MS = 15_000;

function requireListed({ items }: WorkspaceSwitchSnapshot, id: string) {
  if (!items.some(item => item.id === id)) {
    throw new ShownFailure("This workspace is no longer available. Refresh the workspace list and try again.");
  }
}

/** The server decides who may open a workspace; this only protects the move between two. */
export function createWorkspaceSwitch({ getSnapshot, switchTo, beforeSwitch, onPendingChange, replace, isOffline = () => false, watchOffline = () => () => {}, timeoutMs = SWITCH_TIMEOUT_MS }: WorkspaceSwitchDependencies): (id: string) => Promise<void> {
  let pending = false;
  return async id => {
    if (pending) return;
    const initial = getSnapshot();
    if (id === initial.currentId) return;
    requireListed(initial, id);
    // #269 (A111): offline, the server can't change the workspace; say so instead of starting a switch that hangs.
    if (isOffline()) throw new OfflineError();
    pending = true;
    onPendingChange(id);
    let activationStarted = false;
    try {
      await beforeSwitch();
      const latest = getSnapshot();
      if (latest.currentId !== initial.currentId) {
        throw new ShownFailure("Your workspace changed. Reload the page and try again.");
      }
      requireListed(latest, id);
      activationStarted = true;
      const activation = switchTo(id);
      // #269 (A111): the switch ends if the connection drops or the server doesn't answer in time, so the app is never left waiting.
      let stopWaiting = () => {};
      const outcome = await Promise.race([
        activation,
        new Promise<"offline" | "late">(resolve => {
          const timer = setTimeout(() => resolve("late"), timeoutMs);
          const unwatch = watchOffline(() => resolve("offline"));
          stopWaiting = () => { clearTimeout(timer); unwatch(); };
        }),
      ]).finally(() => stopWaiting());
      if (outcome === "offline" || outcome === "late") {
        // Should that switch go through after all, the session goes back to the workspace still on screen, unless
        // another switch has started since: that one decides.
        activation.then(answer => { if (answer.ok && !pending) return switchTo(initial.currentId); }).catch(() => {});
        throw outcome === "offline" ? new OfflineError() : new Error("Couldn’t switch workspace. Try again.");
      }
      if (!outcome.ok) throw new Error("Couldn’t switch workspace. Try again.");
      // A full load of the new workspace: nothing of the old one's, on screen or cached, stays.
      replace("/");
      // Keep the old workspace blocked until document navigation completes.
    } catch (error) {
      pending = false;
      onPendingChange(null);
      if (error instanceof OfflineError) throw error;
      // #269 (A111): the switch's own failure (refused, or no answer in time) is said by the menu in Lane's words;
      // Lane's own reasons before it (a draft to finish, a workspace that's gone) are already words for people.
      if (activationStarted) throw new Error("Couldn’t switch workspace. Try again.");
      throw error instanceof Error ? new ShownFailure(error.message) : error;
    }
  };
}
