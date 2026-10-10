import type { useClerk } from "@clerk/nextjs";

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
};

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
export function createWorkspaceSwitch({ getSnapshot, beforeSwitch, onPendingChange, replace }: WorkspaceSwitchDependencies): (id: string) => Promise<void> {
  let pending = false;
  return async id => {
    if (pending) return;
    const initial = getSnapshot();
    if (id === initial.currentId) return;
    requireCurrentMembership(initial, id);
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
      await setActive({
        organization: id,
        navigate: async ({ decorateUrl }) => {
          // A document navigation removes old workspace providers and cached UI.
          // Clerk's decoration also preserves its Safari session-refresh flow.
          replace(decorateUrl("/"));
        },
      });
      // Keep the old workspace blocked until document navigation completes.
    } catch (error) {
      pending = false;
      onPendingChange(null);
      if (activationStarted) throw new Error("Could not switch workspaces. Try again.");
      throw error;
    }
  };
}
