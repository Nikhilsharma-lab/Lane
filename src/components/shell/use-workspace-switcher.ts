"use client";

import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assertWorkspaceCanSwitch } from "@/lib/workspace-switch-guard";
import { isOffline } from "@/lib/connection-status";
import { OfflineError } from "@/lib/offline-error";
import type { WorkspaceSwitchItem, WorkspaceSwitchSnapshot } from "./workspace-switcher";

export type WorkspaceSwitcher = {
  items: WorkspaceSwitchItem[];
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

/** Existing Clerk memberships only. No local membership or workspace creation. */
export function useWorkspaceSwitcher(currentOrgId: string, options: { beforeSwitch?: () => void | Promise<void> } = {}): WorkspaceSwitcher {
  const auth = useAuth();
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true, pageSize: 20 },
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = isLoaded && auth.isLoaded;
  const items = useMemo(() => {
    if (!loaded) return [];
    return Array.from(new Map((userMemberships.data ?? []).map(({ organization }) => [organization.id, {
      id: organization.id, name: organization.name,
    }])).values());
  }, [loaded, userMemberships.data]);
  const snapshot: WorkspaceSwitchSnapshot = { loaded, userId: auth.userId, currentId: currentOrgId, activeId: auth.orgId, items, setActive };
  const latest = useRef({ snapshot, beforeSwitch: options.beforeSwitch });
  useEffect(() => {
    latest.current = { snapshot: { loaded, userId: auth.userId, currentId: currentOrgId, activeId: auth.orgId, items, setActive }, beforeSwitch: options.beforeSwitch };
  }, [loaded, auth.userId, currentOrgId, auth.orgId, items, setActive, options.beforeSwitch]);
  const selectWorkspace = useRef<((id: string) => Promise<void>) | null>(null);
  const onSelect = useCallback(async (id: string) => {
    setError(null);
    // #269: the switch's own code loads when someone switches, not with every page. Offline it can't load, and says so.
    const { createWorkspaceSwitch } = await import("./workspace-switcher").catch((cause: unknown) => { throw isOffline() ? new OfflineError() : cause; });
    selectWorkspace.current ??= createWorkspaceSwitch({
      getSnapshot: () => latest.current.snapshot,
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
  const onRetry = useCallback(async () => {
    if (!isLoaded || !userMemberships.revalidate || pendingId) return;
    setError(null);
    try { await userMemberships.revalidate(); }
    catch { setError("Couldn’t load workspaces. Try again."); }
  }, [isLoaded, userMemberships, pendingId]);
  const onLoadMore = useCallback(() => {
    if (!isLoaded || !userMemberships.hasNextPage || userMemberships.isFetching || pendingId) return;
    setError(null);
    userMemberships.fetchNext?.();
  }, [isLoaded, userMemberships, pendingId]);

  return {
    items, currentId: currentOrgId, pendingId, onSelect, onRetry, onLoadMore,
    loading: !loaded || Boolean(userMemberships.isLoading),
    loadingMore: Boolean(userMemberships.isFetching) && items.length > 0,
    hasMore: loaded && Boolean(userMemberships.hasNextPage),
    error: error ?? (userMemberships.error ? "Couldn’t load workspaces. Try again." : null),
  };
}
