import type { useClerk } from "@clerk/nextjs";
import { OfflineError } from "@/lib/offline-error";

type SetActive = ReturnType<typeof useClerk>["setActive"];

export type WorkspaceSwitchItem = { id: string; name: string };

export type WorkspaceSwitchSnapshot = {
  loaded: boolean;
  userId: string | null | undefined;
  currentId: string;
  activeId: string | null | undefined;
  items: WorkspaceSwitchItem[];
  setActive: SetActive | undefined;
};

type WorkspaceSwitchDependencies = {
  getSnapshot: () => WorkspaceSwitchSnapshot;
  beforeSwitch: () => void | Promise<void>;
  onPendingChange: (id: string | null) => void;
  replace: (href: string) => void;
  /** #269 (A111): whether the browser is offline now (src/lib/connection-status.ts). */
  isOffline?: () => boolean;
  /** #269 (A111): calls back when the browser goes offline; returns the unsubscribe. */
  watchOffline?: (onOffline: () => void) => () => void;
  /** #269 (A111): how long Clerk gets to answer before the switch gives up. */
  timeoutMs?: number;
};

/** The switch reached Clerk and didn't get through (refused, or no answer in time). Its words are the menu's own. */
export class SwitchFailed extends Error {
  constructor() { super("Couldn't switch workspaces. Try again."); }
}

/** #269 (A111): long enough for a slow connection, short enough that nobody waits on a switch that won't come. */
export const SWITCH_TIMEOUT_MS = 15_000;

function requireCurrentMembership(snapshot: WorkspaceSwitchSnapshot, id: string) {
  if (!snapshot.loaded || !snapshot.userId || !snapshot.setActive || snapshot.activeId !== snapshot.currentId) {
    throw new Error("Your workspace is still loading. Reload the page and try again.");
  }
  if (!snapshot.items.some(item => item.id === id)) {
    throw new Error("This workspace is no longer available. Refresh the workspace list and try again.");
  }
  return snapshot.setActive;
}

/** Clerk is the membership authority; this adapter only protects the transition. */
export function createWorkspaceSwitch({ getSnapshot, beforeSwitch, onPendingChange, replace, isOffline = () => false, watchOffline = () => () => {}, timeoutMs = SWITCH_TIMEOUT_MS }: WorkspaceSwitchDependencies): (id: string) => Promise<void> {
  let pending = false;
  return async id => {
    if (pending) return;
    const initial = getSnapshot();
    if (id === initial.currentId) return;
    requireCurrentMembership(initial, id);
    // #269 (A111): offline, Clerk can't change the workspace; say so instead of starting a switch that hangs.
    if (isOffline()) throw new OfflineError();
    pending = true;
    onPendingChange(id);
    let activationStarted = false;
    try {
      await beforeSwitch();
      const latest = getSnapshot();
      if (latest.userId !== initial.userId || latest.currentId !== initial.currentId || latest.activeId !== initial.activeId) {
        throw new Error("Your workspace changed. Reload the page and try again.");
      }
      const setActive = requireCurrentMembership(latest, id);
      activationStarted = true;
      let abandoned = false;
      const activation = setActive({
        organization: id,
        navigate: async ({ decorateUrl }) => {
          // A switch that gave up never moves the tab later.
          if (abandoned) return;
          // A document navigation removes old workspace providers and cached UI.
          // Clerk's decoration also preserves its Safari session-refresh flow.
          replace(decorateUrl("/"));
        },
      });
      // #269 (A111): the switch ends if the connection drops or Clerk doesn't answer in time, so the app is never left waiting.
      let stopWaiting = () => {};
      const outcome = await Promise.race([
        activation.then(() => "done" as const),
        new Promise<"offline" | "late">(resolve => {
          const timer = setTimeout(() => resolve("late"), timeoutMs);
          const unwatch = watchOffline(() => resolve("offline"));
          stopWaiting = () => { clearTimeout(timer); unwatch(); };
        }),
      ]).finally(() => stopWaiting());
      if (outcome !== "done") {
        abandoned = true;
        // Should Clerk finish that switch after all, its session goes back to the workspace still on screen.
        activation.then(() => setActive({ organization: initial.currentId }), () => {}).catch(() => {});
        throw outcome === "offline" ? new OfflineError() : new SwitchFailed();
      }
      // Keep the old workspace blocked until document navigation completes.
    } catch (error) {
      pending = false;
      onPendingChange(null);
      if (error instanceof OfflineError) throw error;
      if (activationStarted) throw new SwitchFailed();
      throw error;
    }
  };
}
