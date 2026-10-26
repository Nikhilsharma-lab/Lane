"use client";

import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { Bell } from "lucide-react";
import notificationStyles from "@/components/arc/notification-center/notification-center.module.css";
import shellStyles from "@/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css";
import { inboxNeedsYou } from "./inbox-count";
import styles from "./inbox-bell.module.css";

/** The bell's name: the place, and how many Needs-you items wait there (#205: only those are counted). */
export function inboxBellLabel(needsYou: number) {
  return needsYou > 0 ? `Inbox, ${needsYou} need${needsYou === 1 ? "s" : ""} you` : "Inbox";
}

/**
 * #204: the bell stays in the sidebar and leads to the Inbox page; the popover it opened is gone.
 * Plan item 1.8: the (app) layout streams the Needs-you count as a promise, and the bell suspends on it inside
 * its own boundary, so the shell paints at once with a plain bell.
 */
export function InboxBell({ orgId, needsYouCount, current }: { orgId: string; needsYouCount?: Promise<number>; current: boolean }) {
  return <Suspense fallback={<InboxBellLink unread={0} current={current} />}>
    <LoadedInboxBell orgId={orgId} needsYouCount={needsYouCount} current={current} />
  </Suspense>;
}

function InboxBellLink({ unread, current }: { unread: number; current: boolean }) {
  const count = unread > 99 ? "99+" : unread;
  return <Link href="/inbox" className={`${shellStyles.row} ${styles.trigger}`} aria-label={inboxBellLabel(unread)} aria-current={current ? "page" : undefined} data-inbox-bell="">
    <span className={shellStyles.lead}><Bell aria-hidden="true" /></span>
    <span className={shellStyles.name}>Inbox</span>
    {unread > 0 && <span className={notificationStyles.count} aria-hidden="true">{count}</span>}
  </Link>;
}

/**
 * The count (Needs-you items) comes from the layout's promise, then from GET /api/notifications/unread on a window focus, a
 * tab becoming visible, and when the Inbox page closes. While the Inbox page is open, its own
 * count (with its pending marks) is the one shown.
 */
function LoadedInboxBell({ orgId, needsYouCount, current }: { orgId: string; needsYouCount?: Promise<number>; current: boolean }) {
  // Only the first promise is read: a later server render hands over a new one and the bell must not suspend again.
  const [initialCount] = useState(needsYouCount);
  const serverUnread = initialCount ? use(initialCount) : 0;
  const [count, setCount] = useState(serverUnread);
  const published = useSyncExternalStore(inboxNeedsYou.subscribe, inboxNeedsYou.get, () => null);
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(`/api/notifications/unread?${new URLSearchParams({ org: orgId })}`, { signal: controller.signal, headers: { accept: "application/json" }, credentials: "same-origin" });
      const body = response.ok ? await response.json() : null;
      if (!controller.signal.aborted && typeof body?.count === "number") setCount(body.count);
    } catch {
      // Keep the last known count; a failed or aborted refresh must not imply zero unread.
    }
  }, [orgId]);

  useEffect(() => () => request.current?.abort(), []);
  // Leaving the Inbox page (it stops publishing) reads the count again.
  useEffect(() => inboxNeedsYou.subscribe(() => { if (inboxNeedsYou.get() === null) void refresh(); }), [refresh]);

  const onFocus = useEffectEvent(() => { if (published === null) void refresh(); });
  useEffect(() => {
    const focus = () => onFocus();
    const visible = () => { if (document.visibilityState === "visible") onFocus(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visible); };
  }, []);

  return <InboxBellLink unread={published ?? count} current={current} />;
}
