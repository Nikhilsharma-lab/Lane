"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";
import { initials } from "./sidebar-utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
} from "@/app/(app)/notifications/actions";

type Notification = {
  id: string;
  type: string;
  requestId: string | null;
  actorId: string;
  readAt: Date | null;
  createdAt: Date;
  actorName: string | null;
  requestTitle: string | null;
};

function notificationSentence(type: string, actorName: string, requestTitle: string | null): string {
  switch (type) {
    case "request_picked_up":
      return `${actorName} picked up your request '${requestTitle}'`;
    case "comment_added":
      return `${actorName} commented on '${requestTitle}'`;
    case "request_done":
      return `${actorName} marked '${requestTitle}' done`;
    case "invite_accepted":
      return `${actorName} accepted your invite`;
    default:
      return `${actorName} performed an action`;
  }
}

export function NotificationBell({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refreshCount = useCallback(async () => {
    const result = await getUnreadCount({ orgId });
    if ("count" in result) setUnread(result.count ?? 0);
  }, [orgId]);

  const refreshList = useCallback(async () => {
    const result = await getNotifications({ orgId });
    if ("notifications" in result) {
      setItems(result.notifications ?? []);
    }
    setLoaded(true);
  }, [orgId]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (open && !loaded) {
      refreshList();
    }
  }, [open, loaded, refreshList]);

  const handleClickNotification = (item: Notification) => {
    startTransition(async () => {
      if (!item.readAt) {
        await markNotificationRead(item.id, { orgId });
      }
      setOpen(false);
      if (item.type === "invite_accepted") {
        router.push("/settings/members");
      } else if (item.requestId) {
        router.push(`/requests/${item.requestId}`);
      }
      setLoaded(false);
      refreshCount();
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllNotificationsRead({ orgId });
      setLoaded(false);
      refreshCount();
      refreshList();
    });
  };

  const handleToggleRead = (e: React.MouseEvent, item: Notification) => {
    e.stopPropagation();
    startTransition(async () => {
      if (item.readAt) {
        await markNotificationUnread(item.id, { orgId });
      } else {
        await markNotificationRead(item.id, { orgId });
      }
      setLoaded(false);
      refreshCount();
      refreshList();
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setLoaded(false);
      }}
    >
      <PopoverTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          open && "bg-accent text-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        <span className="flex-1 text-left">Notifications</span>
        {unread > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        side="right"
        sideOffset={12}
        align="start"
        className="w-[380px] p-0"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unread > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {!loaded ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="mb-2 size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => handleClickNotification(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClickNotification(item);
                  }
                }}
                className={cn(
                  "group relative flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/50",
                  !item.readAt && "bg-primary/[0.03]"
                )}
              >
                {!item.readAt && (
                  <div className="absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full bg-primary" />
                )}

                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {initials(item.actorName || "?")}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">
                    {notificationSentence(item.type, item.actorName || "Someone", item.requestTitle)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {relativeTime(item.createdAt)}
                  </p>
                </div>

                <button
                  onClick={(e) => handleToggleRead(e, item)}
                  className="shrink-0 self-center rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                  aria-label={item.readAt ? "Mark notification as unread" : "Mark notification as read"}
                  title={item.readAt ? "Mark unread" : "Mark read"}
                >
                  {item.readAt ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
