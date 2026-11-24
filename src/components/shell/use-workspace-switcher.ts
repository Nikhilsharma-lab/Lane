"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { switchWorkspace } from "@/app/(app)/workspace-actions";
import { useServerRefresh } from "@/components/requests/use-optimistic-action";
import { callAction } from "@/lib/action-call";
import { assertWorkspaceCanSwitch } from "@/lib/workspace-switch-guard";
import { isOffline } from "@/lib/connection-status";
import type { OwnWorkspace } from "@/lib/data/workspaces";
import { OfflineError } from "@/lib/offline-error";

export type WorkspaceSwitcher = {
  items: OwnWorkspace[];
  currentId: string;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  pendingId: string | null;
  onRetry: () => Promise<void>;
  onLoadMore: () => void;
  onSelect: (id: string) => Promise<void>;
};

const noWorkspaces: OwnWorkspace[] = [];

/**
 * The account menu's workspace switcher. #389: the layout reads the list, all of it, and `currentOrgId` is the
 * session's workspace; null when the list couldn't be read, and Try again reads the page's server data again.
 */
export function useWorkspaceSwitcher(currentOrgId: string, workspaces: OwnWorkspace[] | null, options: { beforeSwitch?: () => void | Promise<void> } = {}): WorkspaceSwitcher {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const refresh = useServerRefresh();
  const items = workspaces ?? noWorkspaces;
  const latest = useRef({ snapshot: { currentId: currentOrgId, items }, beforeSwitch: options.beforeSwitch });
  useEffect(() => {
    latest.current = { snapshot: { currentId: currentOrgId, items }, beforeSwitch: options.beforeSwitch };
  }, [currentOrgId, items, options.beforeSwitch]);
  const selectWorkspace = useRef<((id: string) => Promise<void>) | null>(null);
  const onSelect = useCallback(async (id: string) => {
    // #269: the switch's own code loads when someone switches, not with every page. Offline it can't load, and says so.
    const { createWorkspaceSwitch } = await import("./workspace-switcher").catch((cause: unknown) => { throw isOffline() ? new OfflineError() : cause; });
    selectWorkspace.current ??= createWorkspaceSwitch({
      getSnapshot: () => latest.current.snapshot,
      switchTo: workspaceId => callAction(() => switchWorkspace(workspaceId)),
      beforeSwitch: async () => {
        assertWorkspaceCanSwitch();
        await latest.current.beforeSwitch?.();
        // The optional callback can wait for another action. Recheck any files
        // or mutations created while it was pending before changing tenancy.
        assertWorkspaceCanSwitch();
      },
      onPendingChange: setPendingId,
      replace: href => window.location.replace(href),
      isOffline,
      watchOffline: onOffline => { addEventListener("offline", onOffline); return () => removeEventListener("offline", onOffline); },
    });
    // #269 (A111): what it throws is for the menu, which says the switch failed, with Try again for the same workspace.
    await selectWorkspace.current(id);
  }, []);

  return {
    items, currentId: currentOrgId, pendingId, onSelect,
    loading: false, loadingMore: false, hasMore: false,
    onRetry: async () => refresh(),
    onLoadMore: () => {},
    error: workspaces ? null : "Couldn’t load workspaces. Try again.",
  };
}
