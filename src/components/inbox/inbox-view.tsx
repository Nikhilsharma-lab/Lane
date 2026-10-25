"use client";

// #204: the Inbox page. Arc rows, toolbar and empty state on Lane's controlled server state; the
// adapter (inbox-screen.tsx) owns reads, actions and the Request preview.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CheckCheck, Inbox as InboxIcon, Mail, MailOpen, RotateCw } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import notificationStyles from "@/components/arc/notification-center/notification-center.module.css";
import { LocalTime, localLabel, useInBrowser } from "@/components/requests/local-time";
import { useIntentPrefetch } from "@/components/requests/use-intent-prefetch";
import { PageStrip } from "@/components/shell/page-strip";
import { notificationRow } from "@/components/shell/notification-copy";
import { nextNotificationId, notificationCommand } from "@/components/shell/notification-keys";
import { isTypingTarget } from "@/lib/keyboard-guards";
import { requestDetailHref } from "@/lib/request-workspace";
import type { InboxItem } from "./inbox-item";
import styles from "./inbox.module.css";

export type InboxViewProps = {
  items: InboxItem[];
  /** Unread items, Mark all read's own count included; may exceed the rows shown. */
  unread: number;
  /** The item whose Request is open beside the list. */
  selectedId: string | null;
  /** The Request preview's mount (it animates in and out inside it). */
  preview: ReactNode;
  /** A Request is open in the preview; until then its column holds a short note (wide screens only). */
  previewOpen?: boolean;
  /** A re-read is in flight; holds Try again. */
  reading?: boolean;
  /** Items whose own mark read or unread is unconfirmed; only their toggle is held. */
  pendingIds?: ReadonlySet<string>;
  allReadPending?: boolean;
  error?: string | null;
  /** The error is an expired or changed session: a retry cannot work, so the line offers Refresh. */
  sessionExpired?: boolean;
  onSelect: (item: InboxItem) => void;
  onToggleRead: (item: InboxItem) => void;
  onMarkAllRead: () => void;
  onRetry: () => void;
  onRefresh?: () => void;
};

const noPending: ReadonlySet<string> = new Set();
const reloadPage = () => window.location.reload();
const HEADING_ID = "inbox-for-your-information";
export const inboxRowButton = (id: string) => `[data-inbox-item="${CSS.escape(id)}"] [data-inbox-open]`;

/**
 * One two-line row: the unread dot, the Request ("LAN-12 · reframed problem") over what happened and when,
 * and the read toggle. The open button is the row's tab stop; focus resting on it prefetches the Request.
 */
function InboxRow({ item, active, selected, pending, onSelect, onToggleRead }: {
  item: InboxItem; active: boolean; selected: boolean; pending: boolean;
  onSelect: (item: InboxItem) => void; onToggleRead: (item: InboxItem) => void;
}) {
  const unread = item.readAt === null;
  // The local time joins the name once in the browser, so the server and the first render agree.
  const live = useInBrowser();
  const copy = notificationRow(item, live ? localLabel(item.createdAt) : undefined);
  const href = item.requestId ? requestDetailHref(item.requestId, "all") : "";
  const prefetch = useIntentPrefetch(href);
  return <li className={styles.row} data-inbox-item={item.id} data-unread={unread || undefined} aria-current={selected || undefined}>
    <span className={styles.lead} aria-hidden="true">{unread && <span className={notificationStyles.unreadDot} />}</span>
    <button type="button" className={styles.open} data-inbox-open tabIndex={active ? 0 : -1} aria-label={copy.name}
      onClick={() => onSelect(item)} onFocus={() => { if (href) prefetch.schedule(); }} onBlur={() => prefetch.cancel()}>
      <span className={styles.primary}>{copy.primary}</span>
      <span className={styles.secondary}>{copy.secondary && `${copy.secondary} · `}<LocalTime iso={item.createdAt} />{copy.detail && ` · “${copy.detail}”`}</span>
    </button>
    {/* aria-disabled while the row's own action is pending: a disabled button would drop the focus that pressed it. */}
    <Tooltip morph="plain" content={unread ? "Mark read" : "Mark unread"}>
      <button type="button" className={styles.toggle} tabIndex={active ? 0 : -1} aria-label={copy.toggle} aria-disabled={pending || undefined} onClick={() => { if (!pending) onToggleRead(item); }}>
        {unread ? <MailOpen aria-hidden="true" /> : <Mail aria-hidden="true" />}
      </button>
    </Tooltip>
  </li>;
}

export function InboxView({
  items, unread, selectedId, preview, previewOpen = false, reading = false, pendingIds = noPending, allReadPending = false, error, sessionExpired = false,
  onSelect, onToggleRead, onMarkAllRead, onRetry, onRefresh = reloadPage,
}: InboxViewProps) {
  const listRef = useRef<HTMLElement>(null);
  // Plan item 2.7's roving tab stop: exactly one row's buttons are tabbable; J, K, Home and End move it.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const pendingFocus = useRef<string | null>(null);
  const tabbable = activeId !== null && items.some(item => item.id === activeId) ? activeId : selectedId !== null && items.some(item => item.id === selectedId) ? selectedId : items[0]?.id ?? null;
  const focusRow = (id: string) => {
    setActiveId(id);
    pendingFocus.current = id;
    setFocusTick(tick => tick + 1);
  };
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    const element = listRef.current?.querySelector<HTMLElement>(inboxRowButton(id));
    if (!element || element.getClientRects().length === 0) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest" });
  }, [focusTick, items]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const command = notificationCommand(event, isTypingTarget(target));
    if (!command) return;
    const from = target.closest<HTMLElement>("[data-inbox-item]")?.dataset.inboxItem ?? null;
    const next = from === null && (command === "next" || command === "previous") ? tabbable : nextNotificationId(items.map(item => item.id), from, command);
    event.preventDefault();
    if (next) focusRow(next);
  };
  /** The tab stop's button, or the list itself when there are no rows. */
  const focusTabStop = () => ((tabbable ? listRef.current?.querySelector<HTMLElement>(inboxRowButton(tabbable)) : null) ?? listRef.current)?.focus({ preventScroll: true });

  const count = unread > 99 ? "99+" : unread;
  return <>
    <PageStrip title="Inbox" heading tools={unread > 0 ? <Button variant="ghost" size="sm" disabled={allReadPending}
      // The button goes once nothing is unread, so focus moves to the list's tab stop first.
      onClick={() => { focusTabStop(); onMarkAllRead(); }}><CheckCheck aria-hidden="true" />Mark all read</Button> : undefined} />
    <div className={styles.body} data-inbox="">
      <section ref={listRef} className={styles.list} aria-labelledby={HEADING_ID} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className={styles.heading}>
          <h2 id={HEADING_ID}>For your information</h2>
          {unread > 0 && <span className={notificationStyles.count} aria-label={`${unread} unread`}>{count}</span>}
        </div>
        {error && <div className={styles.error}><p role="alert">{error}</p>{sessionExpired
          ? <Button variant="secondary" size="sm" onClick={onRefresh}><RotateCw aria-hidden="true" />Refresh</Button>
          : <Button variant="secondary" size="sm" disabled={reading} onClick={() => { focusTabStop(); onRetry(); }}>Try again</Button>}</div>}
        {items.length === 0
          ? !error && <EmptyState icon={<InboxIcon />} title="You’re all caught up" description="Pickups, Done, comments, Looks good and accepted invites about your work show here until you read them." />
          : <ul className={styles.items} role="list" onFocus={event => { const id = (event.target as HTMLElement).closest<HTMLElement>("[data-inbox-item]")?.dataset.inboxItem; if (id) setActiveId(id); }}>
            {items.map(item => <InboxRow key={item.id} item={item} active={item.id === tabbable} selected={item.id === selectedId} pending={pendingIds.has(item.id)} onSelect={onSelect} onToggleRead={onToggleRead} />)}
          </ul>}
      </section>
      <div className={styles.preview} data-inbox-preview="">
        {!previewOpen && <p className={styles.previewNote}>Select an item to see its Request here.</p>}
        {preview}
      </div>
    </div>
  </>;
}
