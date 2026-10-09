"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { NotificationBellView, type NotificationItem } from "./notification-bell-view";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
} from "@/app/(app)/notifications/actions";

export function NotificationBell({
  orgId,
  compact = false,
}: {
  orgId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
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
    let active = true;
    void getUnreadCount({ orgId }).then((result) => {
      if (active && "count" in result) setUnread(result.count ?? 0);
    }).catch(() => { /* The list remains available to retry when opened. */ });
    return () => {
      active = false;
    };
  }, [orgId]);

  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    void Promise.resolve().then(() => refreshList(() => active));
    return () => {
      active = false;
    };
  }, [open, loaded, refreshList]);

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
