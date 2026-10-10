"use client";

import { Suspense, use, useState, useEffect, useCallback, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { NotificationBellView, type NotificationItem } from "./notification-bell-view";
import {
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
} from "@/app/(app)/notifications/actions";

const noop = () => {};

type NotificationRow = Omit<NotificationItem, "readAt" | "createdAt"> & { readAt: string | null; createdAt: string };

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
    <Suspense fallback={<NotificationBellView compact={compact} open={false} unread={0} items={[]} loaded={false} isPending={false} onOpenChange={noop} onSelect={noop} onMarkAllRead={noop} onToggleRead={noop} onRetry={noop} />}>
      <LoadedNotificationBell orgId={orgId} unreadCount={unreadCount} compact={compact} />
    </Suspense>
  );
}

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
  // GET /api/notifications/unread when the bell opens or a read state changes.
  const [initialCount] = useState(unreadCount);
  const serverUnread = initialCount ? use(initialCount) : undefined;
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(serverUnread ?? 0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryUpdate = useRef<(() => void) | null>(null);
  const countRequest = useRef<AbortController | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshCount = useCallback(async () => {
    const controller = replace(countRequest);
    try {
      const response = await readRoute("/api/notifications/unread", orgId, controller);
      const body = response.ok ? await response.json() : null;
      if (!controller.signal.aborted && typeof body?.count === "number") setUnread(body.count);
    } catch {
      // Keep the last known count; a failed or aborted refresh must not imply zero unread.
    }
  }, [orgId]);

  const refreshList = useCallback(async (isActive: () => boolean = () => true) => {
    const controller = replace(listRequest);
    const live = () => isActive() && !controller.signal.aborted;
    try {
      const response = await readRoute("/api/notifications", orgId, controller);
      const body = response.ok ? await response.json() : null;
      if (!live()) return;
      if (!Array.isArray(body?.notifications)) throw new Error("Notification load failed");
      setItems((body.notifications as NotificationRow[]).map((row) => ({ ...row, readAt: row.readAt ? new Date(row.readAt) : null, createdAt: new Date(row.createdAt) })));
      setError(null);
    } catch {
      if (!live()) return;
      retryUpdate.current = null;
      setError("Notifications could not be loaded. Try again.");
    } finally {
      if (live()) setLoaded(true);
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
    if (!open || loaded) return;
    let active = true;
    // Opening refreshes the count with the list, so the badge matches what is shown.
    void Promise.resolve().then(() => Promise.all([refreshList(() => active), refreshCount()]));
    return () => {
      active = false;
    };
  }, [open, loaded, refreshList, refreshCount]);

  const runUpdate = (operation: () => Promise<void>, retry: () => void) => {
    if (isPending) return;
    setError(null);
    retryUpdate.current = null;
    startTransition(async () => {
      try {
        await operation();
      } catch {
        retryUpdate.current = retry;
        setError("That update could not be saved. Try again.");
      }
    });
  };

  const handleClickNotification = (item: NotificationItem) => {
    // Read-state bookkeeping must not prevent opening the underlying Request.
    setOpen(false);
    setLoaded(false);
    if (item.type === "invite_accepted") {
      router.push("/settings/members");
    } else if (item.requestId) {
      router.push(`/requests/${item.requestId}`);
    }
    runUpdate(async () => {
      if (!item.readAt) {
        const result = await markNotificationRead(item.id, { orgId });
        if ("error" in result) throw new Error("Notification update failed");
      }
      await refreshCount();
    }, () => handleClickNotification(item));
  };

  const handleMarkAllRead = () => {
    runUpdate(async () => {
      const result = await markAllNotificationsRead({ orgId });
      if ("error" in result) throw new Error("Notification update failed");
      await Promise.all([refreshCount(), refreshList()]);
    }, handleMarkAllRead);
  };

  const handleToggleRead = (item: NotificationItem) => {
    runUpdate(async () => {
      const result = item.readAt
        ? await markNotificationUnread(item.id, { orgId })
        : await markNotificationRead(item.id, { orgId });
      if ("error" in result) throw new Error("Notification update failed");
      await Promise.all([refreshCount(), refreshList()]);
    }, () => handleToggleRead(item));
  };

  return <NotificationBellView
    compact={compact}
    open={open}
    unread={unread}
    items={items}
    loaded={loaded}
    isPending={isPending}
    error={error}
    onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) { listRequest.current?.abort(); setLoaded(false); setError(null); retryUpdate.current = null; }
    }}
    onSelect={handleClickNotification}
    onMarkAllRead={handleMarkAllRead}
    onToggleRead={handleToggleRead}
    onRetry={() => {
      if (retryUpdate.current) retryUpdate.current();
      else { setError(null); setLoaded(false); }
    }}
  />;
}
