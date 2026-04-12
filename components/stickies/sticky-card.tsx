"use client";

import { useState, useRef, useEffect } from "react";
import { Pin, Trash2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { STICKY_COLORS } from "@/lib/theme-colors";

interface StickyCardProps {
  sticky: {
    id: string;
    content: string;
    color: string;
    isPinned: boolean;
    requestId: string | null;
    createdAt: Date | string;
  };
  onUpdate: (
    id: string,
    data: { content?: string; color?: string; isPinned?: boolean }
  ) => void;
  onArchive: (id: string) => void;
}

function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function StickyCard({ sticky, onUpdate, onArchive }: StickyCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(sticky.content);
  const [isHovered, setIsHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const colorEntry = STICKY_COLORS.find((c) => c.key === sticky.color);
  const borderColor = colorEntry?.hex ?? STICKY_COLORS[0].hex;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  function handleSave() {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== sticky.content) {
      onUpdate(sticky.id, { content: trimmed });
    }
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setEditContent(sticky.content);
      setIsEditing(false);
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative flex w-[220px] flex-col gap-2 rounded-[10px] bg-card px-3.5 py-3 transition-shadow ${
        isHovered ? "shadow-md" : "shadow-sm"
      }`}
      style={{ borderTop: `3px solid ${borderColor}` }}
    >
      {/* Action buttons */}
      <div
        className={`absolute right-2 top-2 flex gap-1 transition-opacity ${
          isHovered || sticky.isPinned ? "opacity-100" : "opacity-0"
        }`}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onUpdate(sticky.id, { isPinned: !sticky.isPinned })}
          title={sticky.isPinned ? "Unpin" : "Pin"}
          className={
            sticky.isPinned
              ? "text-primary"
              : "text-muted-foreground/60"
          }
        >
          <Pin size={14} />
        </Button>
        {isHovered && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onArchive(sticky.id)}
            title="Archive"
            className="text-muted-foreground/60"
          >
            <Trash2 size={14} />
          </Button>
        )}
      </div>

      {/* Content */}
      {isEditing ? (
        <Textarea
          ref={textareaRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          maxLength={500}
          rows={3}
          className="w-full resize-y bg-transparent text-[13px] leading-relaxed"
        />
      ) : (
        <Button
          variant="ghost"
          type="button"
          onClick={() => {
            setEditContent(sticky.content);
            setIsEditing(true);
          }}
          className="min-h-[20px] h-auto cursor-text whitespace-pre-wrap break-words p-0 text-left font-inherit text-[13px] leading-relaxed text-foreground hover:bg-transparent"
        >
          {sticky.content}
        </Button>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground/60">
          {timeAgo(sticky.createdAt)}
        </span>
        {sticky.requestId && (
          <Badge variant="secondary" className="gap-[3px] text-[10px] text-primary bg-primary/10">
            <LinkIcon size={10} />
            Linked
          </Badge>
        )}
      </div>
    </div>
  );
}
