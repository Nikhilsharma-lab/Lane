"use client";

import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assertWorkspaceCanSwitch } from "@/lib/workspace-switch-guard";
import { createWorkspaceSwitch, type WorkspaceSwitchItem, type WorkspaceSwitchSnapshot } from "./workspace-switcher";

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
  const selectWorkspace = useRef<ReturnType<typeof createWorkspaceSwitch> | null>(null);
  const onSelect = useCallback(async (id: string) => {
    setError(null);
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
    });
    try { await selectWorkspace.current(id); }
    catch (cause) {
      const failure = cause instanceof Error ? cause : new Error("Could not switch workspaces. Try again.");
      setError(failure.message);
      throw failure;
    }
  }, []);
  const onRetry = useCallback(async () => {
    if (!isLoaded || !userMemberships.revalidate || pendingId) return;
    setError(null);
    try { await userMemberships.revalidate(); }
    catch { setError("Could not load workspaces. Try again."); }
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
    error: error ?? (userMemberships.error ? "Could not load workspaces. Try again." : null),
  };
}
