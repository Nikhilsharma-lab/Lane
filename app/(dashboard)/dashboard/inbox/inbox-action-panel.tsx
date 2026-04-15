"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  UserPlus,
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
  ExternalLink,
  Send,
  Check,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

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

interface ActionPanelProps {
  notification: InboxNotification;
  onArchive: (id: string) => void;
  onToggleRead: (id: string) => void;
  onClose: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return "S";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const typeConfig: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  assigned: { icon: UserPlus, color: "var(--notif-assigned)", label: "Assignment" },
  comment: { icon: MessageSquare, color: "var(--notif-comment)", label: "Comment" },
  mention: { icon: AtSign, color: "var(--notif-mention)", label: "Mention" },
  stage_change: { icon: ArrowRight, color: "var(--notif-stage-change)", label: "Stage Change" },
  signoff_requested: { icon: Shield, color: "var(--notif-signoff-requested)", label: "Sign-off Request" },
  signoff_submitted: { icon: CheckCircle2, color: "var(--notif-signoff-submitted)", label: "Sign-off Submitted" },
  request_approved: { icon: CheckCircle2, color: "var(--notif-request-approved)", label: "Request Approved" },
  request_rejected: { icon: XCircle, color: "var(--notif-request-rejected)", label: "Request Rejected" },
  figma_update: { icon: FileWarning, color: "var(--notif-figma-update)", label: "Figma Update" },
  idea_vote: { icon: ThumbsUp, color: "var(--notif-idea-vote)", label: "Idea Vote" },
  idea_approved: { icon: Sparkles, color: "var(--notif-idea-approved)", label: "Idea Approved" },
  nudge: { icon: Bell, color: "var(--notif-nudge)", label: "Nudge" },
  project_update: { icon: FolderOpen, color: "var(--notif-project-update)", label: "Project Update" },
};

// ── Property Row ───────────────────────────────────────────────────────────

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 text-sm text-foreground">{children}</div>
    </div>
  );
}

// ── Sub-panels ──────────────────────────────────────────────────────────────

function SignoffRequestedPanel({ notification, onArchive }: { notification: InboxNotification; onArchive: (id: string) => void }) {
  const [decision, setDecision] = useState<string | null>(null);
  const [conditions, setConditions] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!decision || !notification.requestId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/requests/${notification.requestId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          conditions: decision === "approved_with_conditions" ? conditions : undefined,
          comments: decision === "rejected" ? reason : undefined,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(() => onArchive(notification.id), 800);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle2 size={28} className="text-green-500 mb-2" />
        <p className="text-sm font-medium text-foreground">Sign-off submitted</p>
        <p className="text-xs text-muted-foreground mt-1">Moving to done...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Review and submit your sign-off for this request.</p>

      <div className="flex flex-wrap gap-2">
        {(["approved", "approved_with_conditions", "rejected"] as const).map((d) => (
          <Button
            key={d}
            variant="outline"
            size="sm"
            onClick={() => setDecision(decision === d ? null : d)}
            className={`text-sm ${
              decision === d
                ? d === "approved"
                  ? "bg-green-500/10 border-green-500/30 text-green-600 hover:bg-green-500/15"
                  : d === "approved_with_conditions"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/15"
                  : "bg-red-500/10 border-red-500/30 text-red-600 hover:bg-red-500/15"
                : ""
            }`}
          >
            {d === "approved" ? "Approve" : d === "approved_with_conditions" ? "Approve with conditions" : "Request changes"}
          </Button>
        ))}
      </div>

      {decision === "approved_with_conditions" && (
        <Input
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          placeholder="Describe the conditions..."
        />
      )}

      {decision === "rejected" && (
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What needs to change?"
          rows={3}
        />
      )}

      {decision && (
        <Button
          onClick={handleSubmit}
          disabled={submitting || (decision === "approved_with_conditions" && !conditions.trim())}
          variant={decision === "rejected" ? "destructive" : "default"}
          size="default"
        >
          {submitting ? "Submitting..." : "Submit sign-off"}
        </Button>
      )}
    </div>
  );
}

function CommentPanel({ notification, onArchive }: { notification: InboxNotification; onArchive: (id: string) => void }) {
  const [isPending, startTransition] = useTransition();
  const [reply, setReply] = useState("");
  const [sent, setSent] = useState(false);

  function handleReply() {
    if (!reply.trim() || !notification.requestId) return;
    startTransition(async () => {
      const res = await fetch(`/api/requests/${notification.requestId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      if (res.ok) {
        setSent(true);
        setReply("");
        setTimeout(() => onArchive(notification.id), 800);
      }
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle2 size={28} className="text-green-500 mb-2" />
        <p className="text-sm font-medium text-foreground">Reply sent</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Original comment */}
      {notification.body && (
        <div className="bg-muted rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Avatar size="sm">
              <AvatarFallback className="text-[9px]">
                {getInitials(notification.actorName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium text-foreground">{notification.actorName || "System"}</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{notification.body}</p>
        </div>
      )}

      {/* Reply */}
      {notification.requestId && (
        <div className="space-y-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply..."
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleReply();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              {reply.trim() ? "Cmd+Enter to send" : ""}
            </span>
            <Button
              onClick={handleReply}
              disabled={isPending || !reply.trim()}
              size="sm"
            >
              <Send size={13} />
              {isPending ? "Sending..." : "Reply"}
            </Button>
          </div>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onArchive(notification.id)}
        className="w-full text-muted-foreground"
      >
        Mark as done without replying
      </Button>
    </div>
  );
}

function FigmaDriftPanel({ notification, onArchive }: { notification: InboxNotification; onArchive: (id: string) => void }) {
  const [reviewed, setReviewed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleMarkReviewed() {
    setSubmitting(true);
    onArchive(notification.id);
    setReviewed(true);
    setSubmitting(false);
  }

  if (reviewed) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle2 size={28} className="text-green-500 mb-2" />
        <p className="text-sm font-medium text-foreground">Acknowledged</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle className="text-amber-600">Post-handoff change detected</AlertTitle>
        <AlertDescription>
          {notification.body || "A design file was updated after handoff. Review the changes to ensure your implementation stays in sync."}
        </AlertDescription>
      </Alert>

      <Button
        onClick={handleMarkReviewed}
        disabled={submitting}
        size="lg"
        className="w-full"
      >
        <Check size={14} />
        Acknowledge
      </Button>

      <p className="text-[11px] text-muted-foreground/60 text-center">
        Open the request to do a full Figma review
      </p>
    </div>
  );
}

function NudgePanel({ notification, onArchive }: { notification: InboxNotification; onArchive: (id: string) => void }) {
  const [responded, setResponded] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const responses = [
    { key: "blocked", label: "I'm blocked", icon: "\u{1F6A7}", desc: "Something is preventing progress" },
    { key: "thinking", label: "Still thinking", icon: "\u{1F4AD}", desc: "Working through the problem" },
    { key: "update", label: "Update now", icon: "\u270F\uFE0F", desc: "I'll post an update" },
  ];

  function handleRespond(responseKey: string) {
    setSelectedResponse(responseKey);

    startTransition(async () => {
      if (notification.requestId) {
        const responseMap: Record<string, string> = {
          blocked: "I'm currently blocked on this -- will update when I have a path forward.",
          thinking: "Still thinking through the approach. Will share progress soon.",
          update: "Thanks for the nudge -- posting an update now.",
        };
        await fetch(`/api/requests/${notification.requestId}/comment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: responseMap[responseKey] || "Acknowledged" }),
        });
      }
      setResponded(true);
      setTimeout(() => onArchive(notification.id), 800);
    });
  }

  if (responded) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle2 size={28} className="text-green-500 mb-2" />
        <p className="text-sm font-medium text-foreground">Response logged</p>
        <p className="text-xs text-muted-foreground mt-1">A check-in was posted on the request.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">How&apos;s this going? Pick the option that fits best.</p>

      <div className="flex flex-col gap-2">
        {responses.map((r) => (
          <Button
            key={r.key}
            variant="outline"
            size="lg"
            onClick={() => handleRespond(r.key)}
            disabled={isPending}
            className={`justify-start h-auto py-3 rounded-xl ${
              selectedResponse === r.key ? "bg-accent border-primary/30" : ""
            }`}
          >
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-base">{r.icon}</span>
                <span className="text-sm font-medium text-foreground">{r.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 ml-7">{r.desc}</p>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}

function StageChangePanel({ notification, onArchive }: { notification: InboxNotification; onArchive: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {notification.body && (
        <Alert>
          <AlertDescription>{notification.body}</AlertDescription>
        </Alert>
      )}

      <Button onClick={() => onArchive(notification.id)} size="lg" className="w-full">
        <Check size={14} />
        Acknowledge
      </Button>
    </div>
  );
}

function GenericPanel({ notification, onArchive }: { notification: InboxNotification; onArchive: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {notification.body && (
        <div className="bg-muted rounded-xl p-3.5">
          <p className="text-sm text-foreground/80 leading-relaxed">{notification.body}</p>
        </div>
      )}

      <Button onClick={() => onArchive(notification.id)} size="lg" className="w-full">
        <Check size={14} />
        Mark as done
      </Button>
    </div>
  );
}

// ── Main Action Panel ───────────────────────────────────────────────────────

export function InboxActionPanel({ notification, onArchive, onToggleRead, onClose }: ActionPanelProps) {
  const config = typeConfig[notification.type] || { icon: Bell, color: "var(--notif-project-update)", label: notification.type };
  const Icon = config.icon;
  const isUnread = !notification.readAt;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* ── Title area ──────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 shrink-0">
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `color-mix(in srgb, ${config.color} 12%, transparent)` }}
          >
            <Icon size={18} style={{ color: config.color }} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="text-base font-semibold text-foreground leading-snug">
              {notification.title}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="shrink-0 text-muted-foreground"
            title="Close panel (Esc)"
          >
            <X size={16} />
          </Button>
        </div>
      </div>

      {/* ── Properties section ──────────────────────────────────── */}
      <div className="mx-4 rounded-xl bg-muted/40 px-4 py-1 shrink-0">
        <div className="flex items-center justify-between py-2.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            Properties
            <ChevronDown size={12} className="text-muted-foreground/50" />
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onToggleRead(notification.id)}
              title={isUnread ? "Mark as read (U)" : "Mark as unread (U)"}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full border-2 ${
                  isUnread ? "border-primary bg-primary" : "border-muted-foreground/40"
                }`}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onArchive(notification.id)}
              className="text-muted-foreground hover:text-green-600"
              title="Mark as done (E)"
            >
              <Check size={15} />
            </Button>
          </div>
        </div>

        <PropertyRow label="Type">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: config.color }}
          />
          <span
            className="text-xs font-medium"
            style={{ color: config.color }}
          >
            {config.label}
          </span>
        </PropertyRow>

        {notification.actorName && (
          <PropertyRow label="From">
            <Avatar size="sm">
              <AvatarFallback className="text-[9px]">
                {getInitials(notification.actorName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm">{notification.actorName}</span>
          </PropertyRow>
        )}

        <PropertyRow label="Time">
          <span className="text-sm text-muted-foreground">{formatDate(notification.createdAt)}</span>
        </PropertyRow>

        <PropertyRow label="Status">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
            isUnread
              ? "bg-primary/10 text-primary"
              : notification.archivedAt
              ? "bg-green-500/10 text-green-600"
              : "bg-muted text-muted-foreground"
          }`}>
            {isUnread ? "Unread" : notification.archivedAt ? "Done" : "Read"}
          </span>
        </PropertyRow>
      </div>

      {/* ── Content section ─────────────────────────────────────── */}
      <div className="flex-1 px-5 py-5">
        {renderActionContent(notification, onArchive)}
      </div>

      {/* ── Footer link ─────────────────────────────────────────── */}
      <div className="px-5 py-3 shrink-0">
        <Link
          href={notification.url}
          className="flex items-center justify-center gap-1.5 w-full h-8 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          <ExternalLink size={12} />
          View full {notification.requestId ? "request" : "page"}
        </Link>
      </div>
    </div>
  );
}

function renderActionContent(notification: InboxNotification, onArchive: (id: string) => void) {
  switch (notification.type) {
    case "signoff_requested":
      return <SignoffRequestedPanel notification={notification} onArchive={onArchive} />;

    case "comment":
    case "mention":
      return <CommentPanel notification={notification} onArchive={onArchive} />;

    case "figma_update":
      return <FigmaDriftPanel notification={notification} onArchive={onArchive} />;

    case "nudge":
      return <NudgePanel notification={notification} onArchive={onArchive} />;

    case "stage_change":
      return <StageChangePanel notification={notification} onArchive={onArchive} />;

    case "signoff_submitted":
    case "request_approved":
    case "request_rejected":
    case "assigned":
    case "idea_vote":
    case "idea_approved":
    case "project_update":
    default:
      return <GenericPanel notification={notification} onArchive={onArchive} />;
  }
}
