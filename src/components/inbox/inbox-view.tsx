"use client";

// #204 / #205: the Inbox page. Needs you above For your information: Arc rows, toolbar and empty state on
// Lane's controlled server state; the adapter (inbox-screen.tsx) owns reads, actions and the Request preview.
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
import type { InboxItem, NeedsYouInboxItem } from "./inbox-item";
import { needsYouRow } from "./needs-you-copy";
import styles from "./inbox.module.css";

export type InboxViewProps = {
  /** What needs the person, worked out from Request state; it clears itself, so it has no read state. */
  needsYou?: NeedsYouInboxItem[];
  /** False for someone who is never asked to act (a Guest): the Needs-you section is left out. */
  showNeedsYou?: boolean;
  items: InboxItem[];
  /** Unread items, Mark all read's own count included; may exceed the rows shown. */
  unread: number;
  /** The item (a Needs-you key or a For-your-information id) whose Request is open beside the list. */
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
  onSelectNeedsYou?: (item: NeedsYouInboxItem) => void;
  onToggleRead: (item: InboxItem) => void;
  onMarkAllRead: () => void;
  onRetry: () => void;
  onRefresh?: () => void;
};

const noPending: ReadonlySet<string> = new Set();
const reloadPage = () => window.location.reload();
const HEADING_ID = "inbox-for-your-information";
const NEEDS_YOU_HEADING_ID = "inbox-needs-you";
const noNeedsYou: NeedsYouInboxItem[] = [];
const ignore = () => {};
export const inboxRowButton = (id: string) => `[data-inbox-item="${CSS.escape(id)}"] [data-inbox-open]`;

/**
 * One two-line row: the unread dot, the Request ("LAN-12 · reframed problem") over what happened and when,
 * and the read toggle. The open button is the row's tab stop; focus resting on it prefetches the Request.
 */
function InboxRow({ item, active, selected, pending, onSelect, onToggleRead }: {
  item: InboxItem; active: boolean; selected: boolean; pending: boolean;
  onSelect: (item: InboxItem) => void;
  onSelectNeedsYou?: (item: NeedsYouInboxItem) => void; onToggleRead: (item: InboxItem) => void;
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

/** A Needs-you row: the Request over what is waiting on the person (and when, for an ask or a Concern). No read toggle. */
function NeedsYouRow({ item, active, selected, onSelect }: {
  item: NeedsYouInboxItem; active: boolean; selected: boolean; onSelect: (item: NeedsYouInboxItem) => void;
}) {
  const live = useInBrowser();
  const copy = needsYouRow(item, live ? localLabel(item.since) : undefined);
  const prefetch = useIntentPrefetch(requestDetailHref(item.requestId, "all"));
  return <li className={styles.row} data-inbox-item={item.key} aria-current={selected || undefined}>
    <span className={styles.lead} aria-hidden="true" />
    <button type="button" className={styles.open} data-inbox-open tabIndex={active ? 0 : -1} aria-label={copy.name}
      onClick={() => onSelect(item)} onFocus={() => prefetch.schedule()} onBlur={() => prefetch.cancel()}>
      <span className={styles.primary}>{copy.primary}</span>
      <span className={styles.secondary}>{copy.secondary}{copy.showsTime && <> · <LocalTime iso={item.since} /></>}{copy.detail && ` · “${copy.detail}”`}</span>
    </button>
  </li>;
}

export function InboxView({
  needsYou = noNeedsYou, showNeedsYou = true,
  items, unread, selectedId, preview, previewOpen = false, reading = false, pendingIds = noPending, allReadPending = false, error, sessionExpired = false,
  onSelect, onSelectNeedsYou = ignore, onToggleRead, onMarkAllRead, onRetry, onRefresh = reloadPage,
}: InboxViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // Plan item 2.7's roving tab stop: exactly one row's buttons are tabbable; J, K, Home and End move it.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const pendingFocus = useRef<string | null>(null);
  // One roving list across both sections, Needs you first.
  const rowIds = [...(showNeedsYou ? needsYou.map(item => item.key) : []), ...items.map(item => item.id)];
  const tabbable = activeId !== null && rowIds.includes(activeId) ? activeId : selectedId !== null && rowIds.includes(selectedId) ? selectedId : rowIds[0] ?? null;
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
  }, [focusTick, items, needsYou]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const command = notificationCommand(event, isTypingTarget(target));
    if (!command) return;
    const from = target.closest<HTMLElement>("[data-inbox-item]")?.dataset.inboxItem ?? null;
    const next = from === null && (command === "next" || command === "previous") ? tabbable : nextNotificationId(rowIds, from, command);
    event.preventDefault();
    if (next) focusRow(next);
  };
  /** The tab stop's button, or the list itself when there are no rows. */
  const focusTabStop = () => ((tabbable ? listRef.current?.querySelector<HTMLElement>(inboxRowButton(tabbable)) : null) ?? listRef.current)?.focus({ preventScroll: true });

  const count = unread > 99 ? "99+" : unread;
  const needsYouCount = needsYou.length > 99 ? "99+" : needsYou.length;
  const trackActive = (event: { target: EventTarget }) => { const id = (event.target as HTMLElement).closest<HTMLElement>("[data-inbox-item]")?.dataset.inboxItem; if (id) setActiveId(id); };
  return <>
    <PageStrip title="Inbox" heading tools={unread > 0 ? <Button variant="ghost" size="sm" disabled={allReadPending}
      // The button goes once nothing is unread, so focus moves to the list's tab stop first.
      onClick={() => { focusTabStop(); onMarkAllRead(); }}><CheckCheck aria-hidden="true" />Mark all read</Button> : undefined} />
    <div className={styles.body} data-inbox="">
      <div ref={listRef} className={styles.list} tabIndex={-1} onKeyDown={onKeyDown}>
        {/* A failed re-read keeps both lists as last read; the line says so above them. */}
        {error && <div className={styles.error}><p role="alert">{error}</p>{sessionExpired
          ? <Button variant="secondary" size="sm" onClick={onRefresh}><RotateCw aria-hidden="true" />Refresh</Button>
          : <Button variant="secondary" size="sm" disabled={reading} onClick={() => { focusTabStop(); onRetry(); }}>Try again</Button>}</div>}
        {showNeedsYou && <section className={styles.section} aria-labelledby={NEEDS_YOU_HEADING_ID}>
          <div className={styles.heading}>
            <h2 id={NEEDS_YOU_HEADING_ID}>Needs you</h2>
            {needsYou.length > 0 && <span className={notificationStyles.count} aria-label={`${needsYou.length} need${needsYou.length === 1 ? "s" : ""} you`}>{needsYouCount}</span>}
          </div>
          {needsYou.length === 0
            ? <p className={styles.quiet}>Nothing needs you right now.</p>
            : <ul className={styles.items} role="list" onFocus={trackActive}>
              {needsYou.map(item => <NeedsYouRow key={item.key} item={item} active={item.key === tabbable} selected={item.key === selectedId} onSelect={onSelectNeedsYou} />)}
            </ul>}
        </section>}
        <section className={styles.section} aria-labelledby={HEADING_ID}>
          <div className={styles.heading}>
            <h2 id={HEADING_ID}>For your information</h2>
            {unread > 0 && <span className={notificationStyles.count} aria-label={`${unread} unread`}>{count}</span>}
          </div>
          {items.length === 0
            ? !error && (showNeedsYou && needsYou.length > 0
              ? <p className={styles.quiet}>Nothing new to read.</p>
              : <EmptyState icon={<InboxIcon />} title="You’re all caught up" description="Pickups, Done, comments, Looks good and accepted invites about your work show here until you read them." />)
            : <ul className={styles.items} role="list" onFocus={trackActive}>
              {items.map(item => <InboxRow key={item.id} item={item} active={item.id === tabbable} selected={item.id === selectedId} pending={pendingIds.has(item.id)} onSelect={onSelect} onToggleRead={onToggleRead} />)}
            </ul>}
        </section>
      </div>
      <div className={styles.preview} data-inbox-preview="">
        {!previewOpen && <p className={styles.previewNote}>Select an item to see its Request here.</p>}
        {preview}
      </div>
    </div>
  </>;
}
