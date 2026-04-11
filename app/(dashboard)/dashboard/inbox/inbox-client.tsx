"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  UserPlus,
  UserMinus,
  MessageSquare,
  AtSign,
  ArrowRight,
  Shield,
  CheckCircle2,
  XCircle,
  FileWarning,
  ThumbsUp,
  Sparkles,
  Bell,
  FolderOpen,
  Check,
  Clock,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { InboxActionPanel } from "./inbox-action-panel";

// ── Types ──────────────────────────────────────────────────────────────────

interface InboxNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string;
  readAt: string | null;
  archivedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  requestId: string | null;
  actorName: string | null;
}

interface InboxClientProps {
  activeNotifications: InboxNotification[];
  archivedNotifications: InboxNotification[];
  unreadCount: number;
}

// ── Config ─────────────────────────────────────────────────────────────────

const typeIconMap: Record<string, typeof Bell> = {
  assigned: UserPlus,
  unassigned: UserMinus,
  comment: MessageSquare,
  mention: AtSign,
  stage_change: ArrowRight,
  signoff_requested: Shield,
  signoff_submitted: CheckCircle2,
  request_approved: CheckCircle2,
  request_rejected: XCircle,
  figma_update: FileWarning,
  idea_vote: ThumbsUp,
  idea_approved: Sparkles,
  nudge: Bell,
  project_update: FolderOpen,
};

const typeColorMap: Record<string, string> = {
  assigned: "var(--notif-assigned)",
  unassigned: "var(--notif-project-update)",
  comment: "var(--notif-comment)",
  mention: "var(--notif-mention)",
  stage_change: "var(--notif-stage-change)",
  signoff_requested: "var(--notif-signoff-requested)",
  signoff_submitted: "var(--notif-signoff-submitted)",
  request_approved: "var(--notif-request-approved)",
  request_rejected: "var(--notif-request-rejected)",
  figma_update: "var(--notif-figma-update)",
  idea_vote: "var(--notif-idea-vote)",
  idea_approved: "var(--notif-idea-approved)",
  nudge: "var(--notif-nudge)",
  project_update: "var(--notif-project-update)",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function getInitials(name: string | null): string {
  if (!name) return "S"; // System
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface TimeGroup {
  label: string;
  items: InboxNotification[];
}

function groupByTime(items: InboxNotification[], dateKey: "createdAt" | "archivedAt" = "createdAt"): TimeGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

  const groups: Record<string, InboxNotification[]> = {
    Today: [],
    Yesterday: [],
    "Last 7 days": [],
    Older: [],
  };

  for (const item of items) {
    const dateVal = dateKey === "archivedAt" ? item.archivedAt : item.createdAt;
    const d = new Date(dateVal || item.createdAt);
    if (d >= todayStart) groups["Today"].push(item);
    else if (d >= yesterdayStart) groups["Yesterday"].push(item);
    else if (d >= weekStart) groups["Last 7 days"].push(item);
    else groups["Older"].push(item);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

// ── Snooze Options ─────────────────────────────────────────────────────────

function getSnoozeOptions(): { label: string; until: Date }[] {
  const now = new Date();

  const inOneHour = new Date(now.getTime() + 3600000);
  const inThreeHours = new Date(now.getTime() + 3 * 3600000);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const nextMonday = new Date(now);
  const day = nextMonday.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);

  return [
    { label: "1 hour", until: inOneHour },
    { label: "3 hours", until: inThreeHours },
    { label: "Tomorrow 9am", until: tomorrow },
    { label: "Next Monday 9am", until: nextMonday },
  ];
}

// ── Main Component ─────────────────────────────────────────────────────────

export function InboxClient({
  activeNotifications: initialActive,
  archivedNotifications: initialArchived,
  unreadCount: initialUnread,
}: InboxClientProps) {
  const [tab, setTab] = useState<"inbox" | "done">("inbox");
  const [active, setActive] = useState(initialActive);
  const [archived, setArchived] = useState(initialArchived);
  const [unreadCount, setUnreadCount] = useState(initialUnread);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null);
  const [selectedNotifId, setSelectedNotifId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentList = tab === "inbox" ? active : archived;
  const selectedNotif = selectedNotifId
    ? currentList.find((n) => n.id === selectedNotifId) || null
    : null;

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= currentList.length) {
      setSelectedIndex(Math.max(0, currentList.length - 1));
    }
  }, [currentList.length, selectedIndex]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // ── API Calls ──────────────────────────────────────────────────────────

  const archiveNotif = useCallback(async (id: string) => {
    const item = active.find((n) => n.id === id);
    setActive((prev) => prev.filter((n) => n.id !== id));
    if (item) {
      const archivedItem = { ...item, archivedAt: new Date().toISOString() };
      setArchived((prev) => [archivedItem, ...prev]);
    }
    if (item && !item.readAt) setUnreadCount((c) => Math.max(0, c - 1));

    const res = await fetch(`/api/inbox/${id}/archive`, { method: "POST" });
    if (!res.ok && item) {
      // Rollback
      setActive((prev) => [...prev, item].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setArchived((prev) => prev.filter((n) => n.id !== id));
      if (!item.readAt) setUnreadCount((c) => c + 1);
    }
  }, [active]);

  const toggleRead = useCallback(async (id: string) => {
    const item = currentList.find((n) => n.id === id);
    if (!item) return;
    const wasUnread = !item.readAt;
    const updater = (list: InboxNotification[]) =>
      list.map((n) =>
        n.id === id ? { ...n, readAt: wasUnread ? new Date().toISOString() : null } : n
      );

    if (tab === "inbox") setActive(updater);
    else setArchived(updater);
    setUnreadCount((c) => wasUnread ? Math.max(0, c - 1) : c + 1);

    const res = await fetch(`/api/inbox/${id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unread: wasUnread ? false : true }),
    });
    if (!res.ok) {
      // Rollback
      const rollback = (list: InboxNotification[]) =>
        list.map((n) =>
          n.id === id ? { ...n, readAt: wasUnread ? null : new Date().toISOString() } : n
        );
      if (tab === "inbox") setActive(rollback);
      else setArchived(rollback);
      setUnreadCount((c) => wasUnread ? c + 1 : Math.max(0, c - 1));
    }
  }, [currentList, tab]);

  const snoozeNotif = useCallback(async (id: string, until: Date) => {
    const item = active.find((n) => n.id === id);
    setActive((prev) => prev.filter((n) => n.id !== id));
    if (item && !item.readAt) setUnreadCount((c) => Math.max(0, c - 1));
    setSnoozeOpenId(null);

    const res = await fetch(`/api/inbox/${id}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ until: until.toISOString() }),
    });
    if (!res.ok && item) {
      setActive((prev) => [...prev, item].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      if (!item.readAt) setUnreadCount((c) => c + 1);
    }
  }, [active]);

  const archiveAll = useCallback(async () => {
    const prev = active;
    const prevUnread = unreadCount;
    setArchived((a) => [...active.map((n) => ({ ...n, archivedAt: new Date().toISOString() })), ...a]);
    setActive([]);
    setUnreadCount(0);

    const res = await fetch("/api/inbox/archive-all", { method: "POST" });
    if (!res.ok) {
      setActive(prev);
      setUnreadCount(prevUnread);
      setArchived((a) => a.filter((n) => !prev.some((p) => p.id === n.id)));
    }
  }, [active, unreadCount]);

  const selectNotification = useCallback((notif: InboxNotification) => {
    setSelectedNotifId(notif.id);
    if (!notif.readAt) {
      // Optimistic read
      const updater = (list: InboxNotification[]) =>
        list.map((n) => n.id === notif.id ? { ...n, readAt: new Date().toISOString() } : n);
      if (tab === "inbox") setActive(updater);
      else setArchived(updater);
      setUnreadCount((c) => Math.max(0, c - 1));
      fetch(`/api/inbox/${notif.id}/read`, { method: "POST" });
    }
  }, [tab]);

  // ── Keyboard Navigation ────────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;

      switch (e.key.toLowerCase()) {
        case "j":
        case "arrowdown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, currentList.length - 1));
          break;
        case "k":
        case "arrowup":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "e":
          e.preventDefault();
          if (tab === "inbox" && currentList[selectedIndex]) {
            archiveNotif(currentList[selectedIndex].id);
          }
          break;
        case "u":
          e.preventDefault();
          if (currentList[selectedIndex]) {
            toggleRead(currentList[selectedIndex].id);
          }
          break;
        case "h":
          e.preventDefault();
          if (tab === "inbox" && currentList[selectedIndex]) {
            setSnoozeOpenId(
              snoozeOpenId === currentList[selectedIndex].id
                ? null
                : currentList[selectedIndex].id
            );
          }
          break;
        case "enter":
          e.preventDefault();
          if (currentList[selectedIndex]) {
            selectNotification(currentList[selectedIndex]);
          }
          break;
        case "escape":
          e.preventDefault();
          setSelectedNotifId(null);
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentList, selectedIndex, tab, snoozeOpenId, archiveNotif, toggleRead, selectNotification]);

  // ── Render ─────────────────────────────────────────────────────────────

  const groups = groupByTime(currentList, tab === "done" ? "archivedAt" : "createdAt");

  // Build a flat index map for keyboard nav
  let flatIndex = 0;
  const indexedGroups = groups.map((g) => ({
    ...g,
    items: g.items.map((item) => ({ ...item, _flatIndex: flatIndex++ })),
  }));

  // Clear selection when item gets archived
  useEffect(() => {
    if (selectedNotifId && !currentList.find((n) => n.id === selectedNotifId)) {
      setSelectedNotifId(null);
    }
  }, [currentList, selectedNotifId]);

  return (
    <div className="flex-1 flex min-h-0">
      {/* ── Left: Notification List ─────────────────────────────── */}
      <div className={`flex flex-col overflow-y-auto px-6 py-6 ${selectedNotif ? "w-[420px] shrink-0 border-r border-border" : "flex-1 max-w-2xl"}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-lg font-bold text-foreground">Inbox</h1>
          {tab === "inbox" && active.length > 0 && (
            <Button variant="ghost" size="xs" onClick={archiveAll}>
              Mark all as done
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs
          value={tab}
          onValueChange={(v) => { setTab(v as "inbox" | "done"); setSelectedIndex(0); }}
          className="mb-5"
        >
          <TabsList variant="line">
            <TabsTrigger value="inbox">
              Inbox
              {unreadCount > 0 && (
                <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">{unreadCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Keyboard hint */}
        {currentList.length > 0 && (
          <div className="flex items-center gap-3 mb-4 text-[10px] text-muted-foreground/50">
            <span><kbd className="px-1 py-0.5 rounded border border-border text-[9px] font-mono">J</kbd><kbd className="px-1 py-0.5 rounded border border-border text-[9px] font-mono ml-0.5">K</kbd> navigate</span>
            <span><kbd className="px-1 py-0.5 rounded border border-border text-[9px] font-mono">E</kbd> done</span>
            <span><kbd className="px-1 py-0.5 rounded border border-border text-[9px] font-mono">U</kbd> read</span>
            <span><kbd className="px-1 py-0.5 rounded border border-border text-[9px] font-mono">H</kbd> snooze</span>
            <span><kbd className="px-1 py-0.5 rounded border border-border text-[9px] font-mono">&#x23CE;</kbd> open</span>
            {selectedNotif && <span><kbd className="px-1 py-0.5 rounded border border-border text-[9px] font-mono">Esc</kbd> close</span>}
          </div>
        )}

        {/* Notification list */}
        {currentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle2 size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              {tab === "inbox" ? "All caught up!" : "No archived notifications"}
            </p>
            <p className="text-xs text-muted-foreground">
              {tab === "inbox"
                ? "Nothing needs your attention."
                : "Items you mark as done will appear here."}
            </p>
          </div>
        ) : (
          <div ref={listRef} className="flex flex-col gap-6">
            {indexedGroups.map((group) => (
              <div key={group.label}>
                {/* Time group header */}
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  {group.label}
                </div>

                <div className="flex flex-col">
                  {group.items.map((notif) => {
                    const Icon = typeIconMap[notif.type] || Bell;
                    const color = typeColorMap[notif.type] || "var(--notif-project-update)";
                    const isUnread = !notif.readAt;
                    const isSelected = notif._flatIndex === selectedIndex;
                    const snoozeOptions = getSnoozeOptions();

                    return (
                      <div
                        key={notif.id}
                        data-index={notif._flatIndex}
                        onClick={() => selectNotification(notif)}
                        className={`group flex items-start gap-3 px-3 py-3 rounded-lg cursor-pointer transition-all ${
                          notif.id === selectedNotifId
                            ? "bg-accent ring-1 ring-primary/30"
                            : isSelected
                            ? "bg-accent/60"
                            : "hover:bg-accent/50"
                        }`}
                      >
                        {/* Unread dot */}
                        <div className="w-2 pt-2.5 shrink-0">
                          {isUnread && (
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ background: color }}
                            />
                          )}
                        </div>

                        {/* Type icon */}
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
                        >
                          <Icon size={14} style={{ color }} />
                        </div>

                        {/* Actor initials */}
                        <Avatar size="sm" className="mt-0.5">
                          <AvatarFallback className="text-[10px]">
                            {getInitials(notif.actorName)}
                          </AvatarFallback>
                        </Avatar>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm leading-snug ${
                              isUnread ? "font-semibold text-foreground" : "text-foreground/80"
                            }`}
                          >
                            {notif.title}
                          </p>
                          {notif.body && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {notif.body}
                            </p>
                          )}
                        </div>

                        {/* Right side: time + actions */}
                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          <span className="text-[11px] text-muted-foreground/60 font-mono">
                            {timeAgo(notif.createdAt)}
                          </span>

                          {tab === "inbox" && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Mark as done */}
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  archiveNotif(notif.id);
                                }}
                                className="text-muted-foreground hover:text-green-600"
                                title="Mark as done (E)"
                              >
                                <Check size={14} />
                              </Button>

                              {/* Snooze */}
                              <Popover
                                open={snoozeOpenId === notif.id}
                                onOpenChange={(open) =>
                                  setSnoozeOpenId(open ? notif.id : null)
                                }
                              >
                                <PopoverTrigger
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-amber-500 hover:bg-muted transition-colors"
                                  title="Snooze (H)"
                                >
                                  <Clock size={14} />
                                </PopoverTrigger>
                                <PopoverContent
                                  align="end"
                                  className="w-44 p-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="text-[11px] font-medium text-muted-foreground px-2 py-1.5">
                                    Snooze until...
                                  </div>
                                  {snoozeOptions.map((opt) => (
                                    <button
                                      key={opt.label}
                                      onClick={() => snoozeNotif(notif.id, opt.until)}
                                      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent transition-colors"
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right: Action Panel ─────────────────────────────────── */}
      {selectedNotif && (
        <div className="flex-1 min-w-[320px] bg-background">
          <InboxActionPanel
            notification={selectedNotif}
            onArchive={(id) => {
              archiveNotif(id);
              setSelectedNotifId(null);
            }}
            onToggleRead={toggleRead}
          />
        </div>
      )}
    </div>
  );
}
