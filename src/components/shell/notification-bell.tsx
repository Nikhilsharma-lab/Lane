"use client";

import { Suspense, use, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { useListAnnouncer } from "@/components/requests/list-announcer";
import { useOptimisticAction } from "@/components/requests/use-optimistic-action";
import { requestDetailHref } from "@/lib/request-workspace";
import { NotificationBellView, type NotificationItem } from "./notification-bell-view";
import { begin, beginAllRead, confirm, initialReadState, isAllReadPending, isPending, pendingIds, receiveCount, receiveList, rollback, shownItems, shownUnread, type ReadState } from "./notification-read-state";
import {
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
} from "@/app/(app)/notifications/actions";

const noop = () => {};
const LOAD_FAILED = "Notifications could not be loaded. Try again.";
const FAILURE_TITLE = "Could not update notifications";
// The actions answer { error: "Not found" } when the session no longer matches the workspace; the read routes' copy says what to do.
const SESSION_CHANGED = "Your workspace session changed. Refresh the page to continue.";

/**
 * Plan item 1.16 (decision 8.15): the list and the unread count are read from
 * GET route handlers, so opening the bell never queues behind a pending
 * mutation. Each read replaces the previous one in flight through its
 * AbortController. Mutations (mark read, mark all read) stay server actions.
 */
function readRoute(path: string, orgId: string, controller: AbortController) {
  return fetch(`${path}?${new URLSearchParams({ org: orgId })}`, { signal: controller.signal, headers: { accept: "application/json" }, credentials: "same-origin" });
}

function replace(slot: { current: AbortController | null }) {
  slot.current?.abort();
  const controller = new AbortController();
  slot.current = controller;
  return controller;
}

/**
 * Plan item 1.8: the (app) layout streams the unread count as a promise. The
 * bell suspends on it inside its own boundary, so the shell paints at once
 * with a plain bell and the badge arrives with the count. Without a promise
 * (fixtures, previews) the bell reads the count after it mounts, as before.
 */
export function NotificationBell({
  orgId,
  unreadCount,
  compact = false,
}: {
  orgId: string;
  unreadCount?: Promise<number>;
  compact?: boolean;
}) {
  return (
    <Suspense fallback={<NotificationBellView compact={compact} open={false} unread={0} items={[]} loaded={false} onOpenChange={noop} onSelect={noop} onMarkAllRead={noop} onToggleRead={noop} onRetry={noop} />}>
      <LoadedNotificationBell orgId={orgId} unreadCount={unreadCount} compact={compact} />
    </Suspense>
  );
}

/**
 * Plan item 2.7: the adapter owns the read-state machine (notification-read-state.ts),
 * the two abortable reads stamped with their start times, the focus and
 * visibility listeners, and the three actions through useOptimisticAction. A
 * mark read, unread or all read shows in the same frame on the rows, the
 * header chip and the badge, and never visibly reverts on success; a failure
 * rolls back with a toast. Rows and count stay through a close and a failed
 * refresh, so a reopen paints them in the next frame.
 */
function LoadedNotificationBell({
  orgId,
  unreadCount,
  compact,
}: {
  orgId: string;
  unreadCount?: Promise<number>;
  compact: boolean;
}) {
  const router = useRouter();
  // Only the first promise is read: a later server render hands over a new one
  // and the bell must not suspend again for it. Later counts come from
  // GET /api/notifications/unread when the bell opens, after an action, and on focus.
  const [initialCount] = useState(unreadCount);
  const serverUnread = initialCount ? use(initialCount) : undefined;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ReadState<NotificationItem>>(() => initialReadState(serverUnread));
  const [loaded, setLoaded] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The committed state and open flag, for handlers that run after a promise settles.
  const latest = useRef({ state, open });
  useLayoutEffect(() => { latest.current = { state, open }; });
  const tokens = useRef(0);
  const countRequest = useRef<AbortController | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const optimistic = useOptimisticAction();
  const { toast } = useToastStack();
  const announce = useListAnnouncer();

  const refreshCount = useCallback(async () => {
    const controller = replace(countRequest);
    const startedAt = performance.now();
    try {
      const response = await readRoute("/api/notifications/unread", orgId, controller);
      const body = response.ok ? await response.json() : null;
      // An aborted read never lands: a later one replaced it.
      if (!controller.signal.aborted && typeof body?.count === "number") setState(current => receiveCount(current, body.count, startedAt));
    } catch {
      // Keep the last known count; a failed or aborted refresh must not imply zero unread.
    }
  }, [orgId]);

  const refreshList = useCallback(async () => {
    const controller = replace(listRequest);
    const startedAt = performance.now();
    setReading(true);
    try {
      const response = await readRoute("/api/notifications", orgId, controller);
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok || !Array.isArray(body?.notifications)) {
        // An expired or changed session reads the route's own message; anything else the generic one. Rows stay as they are.
        setError((response.status === 401 || response.status === 403) && typeof body?.error === "string" ? body.error : LOAD_FAILED);
        return;
      }
      setState(current => receiveList(current, body.notifications as NotificationItem[], startedAt));
      setError(null);
    } catch {
      if (!controller.signal.aborted) setError(LOAD_FAILED);
    } finally {
      if (!controller.signal.aborted) { setLoaded(true); setReading(false); }
    }
  }, [orgId]);

  useEffect(() => {
    // The layout supplied the count; the next read happens when the bell opens.
    if (initialCount) return;
    void refreshCount();
  }, [refreshCount, initialCount]);

  useEffect(() => () => {
    countRequest.current?.abort();
    listRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    // Keep the last list visible on reopen while both list and count refresh; the open commit paints first.
    void Promise.resolve().then(() => { void refreshList(); void refreshCount(); });
  }, [open, refreshList, refreshCount]);

  // Decision 8.15: a window focus or a tab becoming visible re-reads the count, and the list while the popover is open.
  // Each read replaces the previous one of its kind, so a burst costs at most one in-flight request per kind.
  const onWindowFocus = useEffectEvent(() => {
    void refreshCount();
    if (open) void refreshList();
  });
  useEffect(() => {
    const onFocus = () => onWindowFocus();
    const onVisibility = () => { if (document.visibilityState === "visible") onWindowFocus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /** Closing, by the person or by a click-through: the list read stops and no load error outlives the panel. */
  const close = useCallback(() => {
    setOpen(false);
    listRequest.current?.abort();
    setReading(false);
    setError(null);
  }, []);

  const failed = useCallback((message: string) => {
    toast({ type: "error", title: FAILURE_TITLE, description: message === "Not found" ? SESSION_CHANGED : message });
  }, [toast]);

  /** Adds the row's patch, or null while an earlier one on the row is unconfirmed (its toggle is disabled; this is the guard). */
  const beginRead = (item: NotificationItem, readAt: string | null) => {
    if (isPending(latest.current.state, item.id)) return null;
    const token = ++tokens.current;
    setState(current => begin(current, item.id, readAt, token) ?? current);
    return token;
  };

  /** Runs the action behind a patch; success confirms it and reconciles the count, failure rolls it back with the toast. */
  const runRead = (item: NotificationItem, readAt: string | null, token: number) => {
    void optimistic({
      id: item.id,
      run: () => (readAt ? markNotificationRead : markNotificationUnread)(item.id, { orgId }),
      refreshOnError: false,
      onError: failed,
    }).then(outcome => {
      if (outcome.status === "success") {
        // Stamped before the reconciling read starts: an updater runs later, during the next render.
        const at = performance.now();
        setState(current => confirm(current, token, at));
        void refreshCount();
      } else {
        setState(current => rollback(current, token));
        // Count reads that landed while the action was in flight were set aside (they may or may not hold its write).
        void refreshCount();
      }
    });
  };

  const handleToggleRead = (item: NotificationItem) => {
    const readAt = item.readAt ? null : new Date().toISOString();
    const token = beginRead(item, readAt);
    if (token === null) return;
    announce(readAt ? "Marked read." : "Marked unread.", { key: "notification" });
    runRead(item, readAt, token);
  };

  const handleSelect = (item: NotificationItem) => {
    // Decision D4: a click-through marks the row read. Read-state bookkeeping must not prevent opening
    // the underlying Request: the patch, the close and the navigation happen now; the action follows.
    const readAt = new Date().toISOString();
    const token = item.readAt === null ? beginRead(item, readAt) : null;
    close();
    if (item.type === "invite_accepted") router.push("/settings/members");
    else if (item.requestId) router.push(requestDetailHref(item.requestId, "all"));
    if (token !== null) runRead(item, readAt, token);
  };

  const handleMarkAllRead = () => {
    if (isAllReadPending(latest.current.state)) return;
    const token = ++tokens.current;
    setState(current => beginAllRead(current, new Date().toISOString(), token) ?? current);
    announce("All notifications marked read.", { key: "notification" });
    void optimistic({
      id: "notifications:all",
      run: () => markAllNotificationsRead({ orgId }),
      refreshOnError: false,
      onError: failed,
    }).then(outcome => {
      if (outcome.status === "success") {
        const at = performance.now();
        setState(current => confirm(current, token, at));
        void refreshCount();
        // Rows beyond the 30 shown were affected too, so the open list re-reads.
        if (latest.current.open) void refreshList();
      } else {
        setState(current => rollback(current, token));
        void refreshCount();
      }
    });
  };

  const items = useMemo(() => shownItems(state), [state]);
  const pending = useMemo(() => pendingIds(state), [state]);

  return <NotificationBellView
    compact={compact}
    open={open}
    unread={shownUnread(state)}
    items={items}
    loaded={loaded}
    reading={reading}
    pendingIds={pending}
    allReadPending={isAllReadPending(state)}
    error={error}
    onOpenChange={nextOpen => { if (nextOpen) setOpen(true); else close(); }}
    onSelect={handleSelect}
    onMarkAllRead={handleMarkAllRead}
    onToggleRead={handleToggleRead}
    onRetry={() => { setError(null); void refreshList(); }}
  />;
}
