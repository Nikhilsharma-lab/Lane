"use client";

import { Suspense, use, useState, useEffect, useCallback, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { NotificationBellView, type NotificationItem } from "./notification-bell-view";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
} from "@/app/(app)/notifications/actions";

const noop = () => {};

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
  // and the bell must not suspend again for it. Later counts come from the
  // action when the bell opens or a read state changes.
  const [initialCount] = useState(unreadCount);
  const serverUnread = initialCount ? use(initialCount) : undefined;
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(serverUnread ?? 0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryUpdate = useRef<(() => void) | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshCount = useCallback(async () => {
    try {
      const result = await getUnreadCount({ orgId });
      if ("count" in result) setUnread(result.count ?? 0);
    } catch {
      // Keep the last known count; a failed refresh must not imply zero unread.
    }
  }, [orgId]);

  const refreshList = useCallback(async (isActive: () => boolean = () => true) => {
    try {
      const result = await getNotifications({ orgId });
      if (!isActive()) return;
      if ("error" in result) throw new Error("Notification load failed");
      setItems(result.notifications);
      setError(null);
    } catch {
      if (!isActive()) return;
      retryUpdate.current = null;
      setError("Notifications could not be loaded. Try again.");
    } finally {
      if (isActive()) setLoaded(true);
    }
  }, [orgId]);

  useEffect(() => {
    // The layout supplied the count; the next read happens when the bell opens.
    if (initialCount) return;
    let active = true;
    void getUnreadCount({ orgId }).then((result) => {
      if (active && "count" in result) setUnread(result.count ?? 0);
    }).catch(() => { /* The list remains available to retry when opened. */ });
    return () => {
      active = false;
    };
  }, [orgId, initialCount]);

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
      if (!nextOpen) { setLoaded(false); setError(null); retryUpdate.current = null; }
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
