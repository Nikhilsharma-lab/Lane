"use client";

// Arc notification-center presentation with Lane's controlled server state and recovery actions.
import { useSyncExternalStore } from "react";
import { Bell, CheckCheck, Mail, MailOpen, X } from "lucide-react";
import { Avatar } from "@/components/arc/avatar/avatar";
import { Button } from "@/components/arc/button/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import notificationStyles from "@/components/arc/notification-center/notification-center.module.css";
import { relativeTime } from "@/lib/relative-time";
import styles from "./notification-bell.module.css";
import shellStyles from "@/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css";

export type NotificationItem = {
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
    case "review_requested":
      return `${actorName} asked for your feedback on “${requestTitle}”`;
    case "review_responded":
      return `${actorName} responded to your design review on “${requestTitle}”`;
    case "invite_accepted":
      return `${actorName} accepted your invite`;
    default:
      return `${actorName} performed an action`;
  }
}

export type NotificationBellViewProps = {
  compact?: boolean;
  open: boolean;
  unread: number;
  items: NotificationItem[];
  loaded: boolean;
  isPending: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
  onToggleRead: (item: NotificationItem) => void;
  onRetry: () => void;
};

const NARROW = "(max-width: 880px)";
const subscribeNarrow = (change: () => void) => {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};

export function NotificationBellView({
  compact = false, open, unread, items, loaded, isPending, error,
  onOpenChange, onSelect, onMarkAllRead, onToggleRead, onRetry,
}: NotificationBellViewProps) {
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  const count = unread > 99 ? "99+" : unread;
  // Below the shell's auto-collapse width the sidebar is a peek or drawer, so there is no room beside it.
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <button type="button" className={`${shellStyles.row} ${styles.trigger} ${compact ? styles.compact : ""}`} aria-label={label}>
        <span className={shellStyles.lead}><Bell size={16} aria-hidden="true" /></span>
        {!compact && <span className={shellStyles.name}>Notifications</span>}
        {unread > 0 && <span className={compact ? styles.compactCount : notificationStyles.count} aria-hidden="true">{count}</span>}
      </button>
    </PopoverTrigger>
    <PopoverContent className={`${notificationStyles.panel} ${styles.panel}`} side={compact || narrow ? "bottom" : "right"} align="start" sideOffset={8} aria-label="Notifications">
      <div className={notificationStyles.header}>
        <div className={notificationStyles.heading}><h2>Notifications</h2>{unread > 0 && <span className={notificationStyles.count}>{count}</span>}</div>
        <PopoverClose className={notificationStyles.close} aria-label="Close notifications"><X size={17} aria-hidden="true" /></PopoverClose>
      </div>
      {unread > 0 && <div className={notificationStyles.toolbar}>
        <button type="button" className={notificationStyles.markAll} onClick={onMarkAllRead} disabled={isPending || !loaded}><CheckCheck size={15} aria-hidden="true" /><span>Mark all read</span></button>
      </div>}
      <div className={notificationStyles.list} aria-busy={!loaded || isPending}>
        {error && <div className={styles.error}><p role="alert">{error}</p><Button variant="secondary" size="sm" onClick={onRetry} disabled={isPending}>Try again</Button></div>}
        {!loaded ? <div className={notificationStyles.empty} role="status" aria-label="Loading notifications…"><span className={styles.spinner} aria-hidden="true" /><p>Loading notifications…</p></div>
          : items.length === 0 ? !error && <div className={notificationStyles.empty}><Bell size={24} aria-hidden="true" /><strong>No notifications yet</strong></div>
          : <ul className={styles.items}>{items.map(item => <li key={item.id} className={`${notificationStyles.item} ${item.readAt ? notificationStyles.itemRead : ""}`}>
            <div className={notificationStyles.itemMain}>
              <Avatar name={item.actorName || "Someone"} size="sm" aria-hidden="true" />
              <button type="button" className={notificationStyles.itemToggle} onClick={() => onSelect(item)} disabled={isPending}>
                <span className={`${notificationStyles.itemTitle} ${styles.title}`}><strong>{notificationSentence(item.type, item.actorName || "Someone", item.requestTitle)}</strong></span>
                <span className={notificationStyles.itemPreview}>{relativeTime(item.createdAt)}{!item.readAt && " · Unread"}</span>
              </button>
              <button type="button" className={notificationStyles.close} aria-label={item.readAt ? "Mark notification as unread" : "Mark notification as read"} onClick={() => onToggleRead(item)} disabled={isPending}>{item.readAt ? <Mail size={16} aria-hidden="true" /> : <MailOpen size={16} aria-hidden="true" />}</button>
            </div>
          </li>)}</ul>}
      </div>
    </PopoverContent>
  </Popover>;
}
