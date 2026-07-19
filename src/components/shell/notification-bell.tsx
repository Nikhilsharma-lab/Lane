"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { IdentityMark } from "@/components/ui/identity-mark";
import {
  Row,
  RowActions,
  RowContent,
  RowDescription,
  RowGroup,
  RowLeading,
  RowTitle,
} from "@/components/ui/row";
import { Typography } from "@/components/ui/typography";
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
      return `${actorName} picked up your Request “${requestTitle}”`;
    case "comment_added":
      return `${actorName} commented on “${requestTitle}”`;
    case "request_done":
      return `${actorName} marked “${requestTitle}” done`;
    case "invite_accepted":
      return `${actorName} accepted your invite`;
    default:
      return `${actorName} performed an action`;
  }
}

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
    let active = true;
    void getUnreadCount({ orgId }).then((result) => {
      if (active && "count" in result) setUnread(result.count ?? 0);
    });
    return () => {
      active = false;
    };
  }, [orgId]);

  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    void getNotifications({ orgId }).then((result) => {
      if (!active) return;
      if ("notifications" in result) setItems(result.notifications ?? []);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [open, loaded, orgId]);

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
        aria-label={compact ? "Notifications" : undefined}
        className={cn(
          "flex items-center rounded-md text-type-control transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          compact
            ? "relative size-11 justify-center"
            : "w-full gap-2.5 px-2.5 py-1.5",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          open && "bg-accent text-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        <span className={compact ? "sr-only" : "flex-1 text-left"}>
          Notifications
        </span>
        {unread > 0 && (
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full bg-primary font-mono text-type-micro text-primary-foreground",
              compact && "absolute top-1 right-1"
            )}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        side={compact ? "bottom" : "right"}
        sideOffset={compact ? 8 : 12}
        align={compact ? "end" : "start"}
        className="w-[calc(100vw-2rem)] p-0 sm:w-[380px]"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <Typography as="h3" role="sectionTitle">Notifications</Typography>
          {unread > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="text-muted-foreground"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {!loaded ? (
            <div className="flex items-center justify-center py-8 text-type-ui text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="mb-2 size-8 text-muted-foreground/40" />
              <p className="text-type-ui text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <RowGroup className="border-0">
              {items.map((item) => {
                const sentence = notificationSentence(
                  item.type,
                  item.actorName || "Someone",
                  item.requestTitle
                );

                return (
                  <Row
                    key={item.id}
                    interactive
                    className={cn(
                      "min-h-[72px] px-3 py-3 has-[button[data-notification-link]:focus-visible]:ring-3 has-[button[data-notification-link]:focus-visible]:ring-ring/50 has-[button[data-notification-link]:focus-visible]:ring-inset",
                      !item.readAt && "bg-brand-soft/50 hover:bg-brand-soft/70"
                    )}
                  >
                    <button
                      type="button"
                      data-notification-link=""
                      onClick={() => handleClickNotification(item)}
                      className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none"
                      aria-label={`${sentence}. ${relativeTime(item.createdAt)}`}
                    />
                    <RowLeading className="pointer-events-none relative z-10">
                      <IdentityMark
                        label={item.actorName}
                        kind={item.actorName ? "person" : "unknown"}
                        unread={!item.readAt}
                      />
                    </RowLeading>
                    <RowContent className="pointer-events-none relative z-10">
                      <RowTitle className="font-medium">
                        {sentence}
                      </RowTitle>
                      <RowDescription>
                        {relativeTime(item.createdAt)}
                      </RowDescription>
                    </RowContent>
                    <RowActions className="relative z-20 w-8">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => handleToggleRead(e, item)}
                        aria-label={item.readAt ? "Mark notification as unread" : "Mark notification as read"}
                        title={item.readAt ? "Mark unread" : "Mark read"}
                      >
                        {item.readAt ? <EyeOff /> : <Eye />}
                      </Button>
                    </RowActions>
                  </Row>
                );
              })}
            </RowGroup>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
