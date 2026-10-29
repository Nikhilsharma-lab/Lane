"use client";

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { useListAnnouncer } from "@/components/requests/list-announcer";
import { RequestPeek, preloadRequestPeek, usePeekAvailable, type PeekViewer } from "@/components/requests/request-peek";
import { RequestPeekLoadAhead, useListLoadAhead } from "@/components/requests/request-peek-load-ahead";
import { failureToast, useOptimisticAction, type FailureDetail } from "@/components/requests/use-optimistic-action";
import { SESSION_CHANGED, SESSION_ENDED } from "@/lib/failure-messages";
import { inboxNeedsYou } from "@/components/shell/inbox-count";
import { begin, beginAllRead, confirm, initialReadState, isAllReadPending, isPending, pendingIds, receiveCount, receiveList, rollback, shownItems, shownUnread, type ReadState } from "@/components/shell/notification-read-state";
import { requestDetailHref } from "@/lib/request-workspace";
import { markAllNotificationsRead, markNotificationRead, markNotificationUnread } from "@/app/(app)/notifications/actions";
import type { InboxItem, NeedsYouInboxItem } from "./inbox-item";
import { refreshedItems } from "./inbox-list";
import { InboxView, inboxRowButton } from "./inbox-view";

const LOAD_FAILED = "Your Inbox couldn't be loaded. Try again.";

function read(path: string, orgId: string, controller: AbortController) {
  return fetch(`${path}?${new URLSearchParams({ org: orgId })}`, { signal: controller.signal, headers: { accept: "application/json" }, credentials: "same-origin" });
}
function replace(slot: { current: AbortController | null }) {
  slot.current?.abort();
  const controller = new AbortController();
  slot.current = controller;
  return controller;
}

export type InboxScreenProps = {
  orgId: string;
  /** The page's server read of what needs the person, newest first. */
  initialNeedsYou: NeedsYouInboxItem[];
  /** False for someone who is never asked to act (a Guest). */
  showNeedsYou: boolean;
  /** The page's server read: unread items, newest first. */
  initialItems: InboxItem[];
  /** Every unread For-your-information item, beyond the rows the page shows. */
  initialUnread: number;
  isGuest: boolean;
  viewer: PeekViewer;
};

/**
 * #204 / #205: the Inbox page's adapter. Needs-you items have no read state: a re-read replaces them, and they
 * leave once the thing is done. For your information keeps the bell's old read-state machine (notification-read-state.ts): a mark
 * read, unread or all read shows on the row, the count and the bell in the same frame and rolls back with a
 * toast on failure. Opening an item marks it read and shows its Request beside the list (where the preview is
 * available; elsewhere the Request's page opens). A window focus re-reads the list and the count; items read
 * on this visit stay in place until the next one (inbox-list.ts).
 */
export function InboxScreen({ orgId, initialNeedsYou, showNeedsYou, initialItems, initialUnread, isGuest, viewer }: InboxScreenProps) {
  const router = useRouter();
  const [state, setState] = useState<ReadState<InboxItem>>(() => receiveList(initialReadState<InboxItem>(initialUnread), initialItems, 0));
  const [needsYou, setNeedsYou] = useState(initialNeedsYou);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const latest = useRef(state);
  useLayoutEffect(() => { latest.current = state; });
  const tokens = useRef(0);
  const countRequest = useRef<AbortController | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const optimistic = useOptimisticAction();
  const { toast } = useToastStack();
  const announce = useListAnnouncer();
  const peekAvailable = usePeekAvailable();

  const items = useMemo(() => shownItems(state), [state]);
  const unread = shownUnread(state);
  const pending = useMemo(() => pendingIds(state), [state]);

  // The bell counts Needs-you items. It shows this page's while it is open, and reads its own again once the page closes.
  useEffect(() => { inboxNeedsYou.set(needsYou.length); }, [needsYou.length]);
  useEffect(() => () => inboxNeedsYou.set(null), []);
  useEffect(() => () => { countRequest.current?.abort(); listRequest.current?.abort(); }, []);
  useEffect(() => { if (peekAvailable) preloadRequestPeek(); }, [peekAvailable]);

  const refreshCount = useCallback(async () => {
    const controller = replace(countRequest);
    const startedAt = performance.now();
    try {
      const response = await read("/api/notifications/unread", orgId, controller);
      const body = response.ok ? await response.json() : null;
      if (!controller.signal.aborted && typeof body?.unread === "number") setState(current => receiveCount(current, body.unread, startedAt));
    } catch {
      // Keep the last known count; a failed refresh must not imply zero unread.
    }
  }, [orgId]);

  const refreshList = useCallback(async () => {
    const controller = replace(listRequest);
    const startedAt = performance.now();
    setReading(true);
    try {
      const response = await read("/api/notifications", orgId, controller);
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok || !Array.isArray(body?.forYourInformation) || !Array.isArray(body?.needsYou)) {
        const expired = (response.status === 401 || response.status === 403) && typeof body?.error === "string";
        // #260: Lane's own words, never the response's text.
        setError(expired ? (response.status === 401 ? SESSION_ENDED : SESSION_CHANGED) : LOAD_FAILED);
        setSessionExpired(expired);
        return;
      }
      setState(current => receiveList(current, refreshedItems(shownItems(current), body.forYourInformation as InboxItem[]), startedAt));
      setNeedsYou(body.needsYou as NeedsYouInboxItem[]);
      setError(null);
      setSessionExpired(false);
    } catch {
      if (!controller.signal.aborted) { setError(LOAD_FAILED); setSessionExpired(false); }
    } finally {
      if (!controller.signal.aborted) setReading(false);
    }
  }, [orgId]);

  // Decision 8.15: a window focus or a tab becoming visible re-reads the list and the count.
  const onWindowFocus = useEffectEvent(() => { void refreshList(); void refreshCount(); });
  useEffect(() => {
    const onFocus = () => onWindowFocus();
    const onVisibility = () => { if (document.visibilityState === "visible") onWindowFocus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  // #260: the shared failure toast with Try again, which runs `retry` (the same change from the start). A
  // refusal reads as the session changing: the actions answer { error: "Not found" } when it no longer matches.
  const failed = useCallback((retry: () => void) => (message: string, { thrown, offline }: FailureDetail) => {
    toast(failureToast(thrown ? message : SESSION_CHANGED, { offline, retry: async () => retry() }));
  }, [toast]);

  /** Adds the row's patch, or null while an earlier one on the row is unconfirmed. */
  const beginRead = (item: InboxItem, readAt: string | null) => {
    if (isPending(latest.current, item.id)) return null;
    const token = ++tokens.current;
    setState(current => begin(current, item.id, readAt, token) ?? current);
    return token;
  };
  const runRead = (item: InboxItem, readAt: string | null, token: number) => {
    void optimistic({
      id: item.id,
      run: () => (readAt ? markNotificationRead : markNotificationUnread)(item.id, { orgId }),
      refreshOnError: false,
      onError: failed(() => { const next = beginRead(item, readAt); if (next !== null) runRead(item, readAt, next); }),
    }).then(outcome => {
      if (outcome.status === "success") {
        const at = performance.now();
        setState(current => confirm(current, token, at));
      } else {
        setState(current => rollback(current, token));
      }
      void refreshCount();
    });
  };

  const handleToggleRead = (item: InboxItem) => {
    const readAt = item.readAt ? null : new Date().toISOString();
    const token = beginRead(item, readAt);
    if (token === null) return;
    announce(readAt ? "Marked read." : "Marked unread.", { key: "inbox" });
    runRead(item, readAt, token);
  };

  const handleSelect = (item: InboxItem) => {
    // Opening an item reads it. The patch and the opening happen now; the action follows.
    const readAt = new Date().toISOString();
    const token = item.readAt === null ? beginRead(item, readAt) : null;
    if (item.type === "invite_accepted") router.push("/settings/members");
    else if (item.requestId && peekAvailable) {
      if (!selectedId) announce("Preview open. Esc closes it.", { key: "preview" });
      setSelectedId(item.id);
    } else if (item.requestId) router.push(requestDetailHref(item.requestId, "all"));
    if (token !== null) runRead(item, readAt, token);
  };

  // A Needs-you item clears itself once the thing is done, so opening it changes nothing but the preview.
  const handleSelectNeedsYou = (item: NeedsYouInboxItem) => {
    if (peekAvailable) {
      if (!selectedId) announce("Preview open. Esc closes it.", { key: "preview" });
      setSelectedId(item.key);
    } else router.push(requestDetailHref(item.requestId, "all"));
  };

  const closePreview = () => {
    const id = selectedId;
    setSelectedId(null);
    if (!id) return;
    announce("Preview closed.", { key: "preview" });
    requestAnimationFrame(() => document.querySelector<HTMLElement>(inboxRowButton(id))?.focus({ preventScroll: true }));
  };

  const handleMarkAllRead = () => {
    if (isAllReadPending(latest.current)) return;
    const token = ++tokens.current;
    setState(current => beginAllRead(current, new Date().toISOString(), token) ?? current);
    announce("Everything in your Inbox is marked read.", { key: "inbox" });
    void optimistic({
      id: "inbox:all",
      run: () => markAllNotificationsRead({ orgId }),
      refreshOnError: false,
      onError: failed(() => handleMarkAllRead()),
    }).then(outcome => {
      if (outcome.status === "success") {
        const at = performance.now();
        setState(current => confirm(current, token, at));
      } else {
        setState(current => rollback(current, token));
      }
      void refreshCount();
    });
  };

  const selectedRequest = items.find(item => item.id === selectedId)?.requestId ?? needsYou.find(item => item.key === selectedId)?.requestId ?? null;
  const previewId = peekAvailable ? selectedRequest : null;

  // #258: resting on an item reads its Request into the preview's memory before it opens (not by focus while
  // the preview is open, as on the Requests list).
  const loadAhead = useListLoadAhead(orgId, viewer.id, { offered: peekAvailable, previewOpen: previewId !== null });

  return <RequestPeekLoadAhead value={loadAhead}><InboxView
    needsYou={needsYou}
    showNeedsYou={showNeedsYou}
    items={items}
    unread={unread}
    selectedId={previewId ? selectedId : null}
    preview={<AnimatePresence initial={false}>
      {previewId && <RequestPeek key="request-peek" requestId={previewId} serverRow={null} orgId={orgId} isGuest={isGuest} viewer={viewer} onClose={closePreview} onOpenFullPage={() => {}} />}
    </AnimatePresence>}
    previewOpen={previewId !== null}
    reading={reading}
    pendingIds={pending}
    allReadPending={isAllReadPending(state)}
    error={error}
    sessionExpired={sessionExpired}
    onSelect={handleSelect}
    onSelectNeedsYou={handleSelectNeedsYou}
    onToggleRead={handleToggleRead}
    onMarkAllRead={handleMarkAllRead}
    onRetry={() => { setError(null); void refreshList(); }}
  /></RequestPeekLoadAhead>;
}
