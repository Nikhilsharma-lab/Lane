"use client";

// Arc notification-center presentation with Lane's controlled server state and recovery actions.
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Bell, CheckCheck, Mail, MailOpen, RotateCw, X } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import notificationStyles from "@/components/arc/notification-center/notification-center.module.css";
import shellStyles from "@/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css";
import { LocalTime, localLabel } from "@/components/requests/local-time";
import { useIntentPrefetch } from "@/components/requests/use-intent-prefetch";
import { isTypingTarget } from "@/lib/keyboard-guards";
import { requestDetailHref } from "@/lib/request-workspace";
import { notificationRow } from "./notification-copy";
import { nextNotificationId, notificationCommand } from "./notification-keys";
import styles from "./notification-bell.module.css";

/** A row as GET /api/notifications serialises it: dates are ISO strings (plan item 2.7). */
export type NotificationItem = {
  id: string;
  type: string;
  requestId: string | null;
  actorId: string;
  readAt: string | null;
  createdAt: string;
  actorName: string | null;
  requestTitle: string | null;
  requestNumber: number | null;
  reframedProblem: string | null;
};

export type NotificationBellViewProps = {
  compact?: boolean;
  open: boolean;
  unread: number;
  items: NotificationItem[];
  /** False until the first list read has answered: that first open shows skeleton rows. */
  loaded: boolean;
  /** A list read is in flight. Marks an empty list busy and holds Try again; kept rows stay live. */
  reading?: boolean;
  /** Rows whose own mark read or unread is unconfirmed; only their toggle is disabled. */
  pendingIds?: ReadonlySet<string>;
  /** A mark all read is unconfirmed; only its button is disabled. */
  allReadPending?: boolean;
  error?: string | null;
  /** The error is an expired or changed session: a retry cannot work, so the line offers Refresh instead of Try again. */
  sessionExpired?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
  onToggleRead: (item: NotificationItem) => void;
  onRetry: () => void;
  /** Reloads the page for a new session; defaults to a full reload. */
  onRefresh?: () => void;
};

const reloadPage = () => window.location.reload();

const NARROW = "(max-width: 880px)";
const subscribeNarrow = (change: () => void) => {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const noPending: ReadonlySet<string> = new Set();
const rowButton = (id: string) => `[data-notification-row="${CSS.escape(id)}"] [data-notification-open]`;

/**
 * One 44px two-line row (plan item 2.7): the unread dot, the Request ("LAN-12 ·
 * reframed problem") over the event and its local time, and the read toggle.
 * The open button is the row's tab stop; focus resting on it prefetches the
 * Request's detail on intent, as a list row does (plan item 2.4).
 */
function NotificationRow({ item, active, pending, onSelect, onToggleRead }: {
  item: NotificationItem; active: boolean; pending: boolean;
  onSelect: (item: NotificationItem) => void; onToggleRead: (item: NotificationItem) => void;
}) {
  const unread = item.readAt === null;
  // The popover only renders in the browser after hydration, so the local label is the one LocalTime shows.
  const copy = notificationRow(item, localLabel(item.createdAt));
  const href = item.requestId ? requestDetailHref(item.requestId, "all") : "";
  const prefetch = useIntentPrefetch(href);
  return <li className={styles.row} data-notification-row={item.id} data-unread={unread || undefined}>
    <span className={styles.lead} aria-hidden="true">{unread && <span className={notificationStyles.unreadDot} />}</span>
    <button type="button" className={`${notificationStyles.itemToggle} ${styles.open}`} data-notification-open tabIndex={active ? 0 : -1} aria-label={copy.name}
      onClick={() => onSelect(item)} onFocus={() => { if (href) prefetch.schedule(); }} onBlur={() => prefetch.cancel()}>
      <span className={styles.primary}>{copy.primary}</span>
      <span className={styles.secondary}>{copy.secondary && `${copy.secondary} · `}<LocalTime iso={item.createdAt} /></span>
    </button>
    {/* aria-disabled, not disabled, while the row's own action is pending: a disabled button would drop the keyboard focus that just pressed it.
        The name says which Request; the tooltip says what the glyph does. */}
    <Tooltip morph="plain" content={unread ? "Mark read" : "Mark unread"}>
      <button type="button" className={notificationStyles.close} tabIndex={active ? 0 : -1} aria-label={copy.toggle} aria-disabled={pending || undefined} onClick={() => { if (!pending) onToggleRead(item); }}>
        {unread ? <MailOpen aria-hidden="true" /> : <Mail aria-hidden="true" />}
      </button>
    </Tooltip>
  </li>;
}

export function NotificationBellView({
  compact = false, open, unread, items, loaded, reading = false, pendingIds = noPending, allReadPending = false, error, sessionExpired = false,
  onOpenChange, onSelect, onMarkAllRead, onToggleRead, onRetry, onRefresh = reloadPage,
}: NotificationBellViewProps) {
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  const count = unread > 99 ? "99+" : unread;
  // Below the shell's auto-collapse width the sidebar is a peek or drawer, so there is no room beside it.
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Plan item 2.7 (decision 8.10): a roving tab stop over the rows' open buttons, the 2.4 pattern.
  // Exactly one row has tabIndex 0; a move re-renders two rows and focuses after the commit, so
  // the shared Arc ring (which skips tabindex="-1") always draws. The active id resets on close.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (!open) setActiveId(null); }
  const [focusTick, setFocusTick] = useState(0);
  const pendingFocus = useRef<string | null>(null);
  const tabbable = activeId !== null && items.some(item => item.id === activeId) ? activeId : items[0]?.id ?? null;
  const focusRow = (id: string) => {
    setActiveId(id);
    pendingFocus.current = id;
    setFocusTick(tick => tick + 1);
  };
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    // One try, in the commit that made the row the tab stop.
    pendingFocus.current = null;
    const element = contentRef.current?.querySelector<HTMLElement>(rowButton(id));
    if (!element || element.getClientRects().length === 0) return;
    element.focus({ preventScroll: true });
    // Instant, never smooth: a held J must not queue scroll animations.
    element.scrollIntoView({ block: "nearest" });
  }, [focusTick, items]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const command = notificationCommand(event, isTypingTarget(target));
    if (!command) return;
    const from = target.closest<HTMLElement>("[data-notification-row]")?.dataset.notificationRow ?? null;
    // From the header or toolbar, J and K come back to the tab stop; at an edge nothing moves and nothing is said.
    const next = from === null && (command === "next" || command === "previous") ? tabbable : nextNotificationId(items.map(item => item.id), from, command);
    event.preventDefault();
    if (next) focusRow(next);
  };

  /** The tab stop's button, or the panel itself when there are no rows. */
  const focusTarget = (container: HTMLElement | null) => (tabbable ? container?.querySelector<HTMLElement>(rowButton(tabbable)) : null) ?? container;

  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <button type="button" className={`${shellStyles.row} ${styles.trigger} ${compact ? styles.compact : ""}`} aria-label={label}>
        <span className={shellStyles.lead}><Bell aria-hidden="true" /></span>
        {!compact && <span className={shellStyles.name}>Notifications</span>}
        {unread > 0 && <span className={compact ? styles.compactCount : notificationStyles.count} aria-hidden="true">{count}</span>}
      </button>
    </PopoverTrigger>
    <PopoverContent ref={contentRef} tabIndex={-1} className={`${notificationStyles.panel} ${styles.panel}`} side={compact || narrow ? "bottom" : "right"} align="start" sideOffset={8} aria-label="Notifications"
      onKeyDown={onKeyDown}
      // Decision D1: focus lands on the first row (the remembered tab stop while open), not the close button; with no rows, on the panel.
      onOpenAutoFocus={event => {
        event.preventDefault();
        focusTarget(event.currentTarget instanceof HTMLElement ? event.currentTarget : contentRef.current)?.focus({ preventScroll: true });
      }}>
      <div className={notificationStyles.header}>
        <div className={notificationStyles.heading}><h2>Notifications</h2>{unread > 0 && <span className={notificationStyles.count}>{count}</span>}</div>
        <PopoverClose className={notificationStyles.close} aria-label="Close notifications"><X aria-hidden="true" /></PopoverClose>
      </div>
      {unread > 0 && <div className={notificationStyles.toolbar}>
        <button type="button" className={notificationStyles.markAll} disabled={allReadPending}
          // The toolbar hides once unread reaches 0, so focus moves to the active row before the button goes (the Arc block does the same).
          onClick={() => { focusTarget(contentRef.current)?.focus({ preventScroll: true }); onMarkAllRead(); }}>
          <CheckCheck aria-hidden="true" /><span>Mark all read</span>
        </button>
      </div>}
      <div className={notificationStyles.list} aria-busy={items.length === 0 && reading ? true : undefined}>
        {error && <div className={styles.error}><p role="alert">{error}</p>{sessionExpired
          ? <Button variant="secondary" size="sm" onClick={onRefresh}><RotateCw aria-hidden="true" />Refresh</Button>
          : <Button variant="secondary" size="sm" disabled={reading}
            // The status line goes while the retry reads, so focus moves to the tab stop (or the panel) first, as Mark all read does.
            onClick={() => { focusTarget(contentRef.current)?.focus({ preventScroll: true }); onRetry(); }}>Try again</Button>}</div>}
        {!loaded && items.length === 0
          ? <>
            {/* Skeleton rows the height of real rows, so the swap does not shift; one hidden status speaks for them. */}
            <ul className={styles.items} aria-hidden="true">
              {[0, 1, 2].map(index => <li key={index} className={`${styles.row} ${styles.skeletonRow}`}><span className={styles.lead} /><Skeleton lines={2} label="Loading notifications" /></li>)}
            </ul>
            <p className="sr-only" role="status" aria-label="Loading notifications…">Loading notifications…</p>
          </>
          : items.length === 0 ? !error && <div className={notificationStyles.empty}><Bell data-icon-size="2xl" aria-hidden="true" /><strong>No notifications</strong></div>
            : <ul className={styles.items} role="list" data-notification-list onFocus={event => { const id = (event.target as HTMLElement).closest<HTMLElement>("[data-notification-row]")?.dataset.notificationRow; if (id) setActiveId(id); }}>
              {items.map(item => <NotificationRow key={item.id} item={item} active={item.id === tabbable} pending={pendingIds.has(item.id)} onSelect={onSelect} onToggleRead={onToggleRead} />)}
            </ul>}
      </div>
    </PopoverContent>
  </Popover>;
}
