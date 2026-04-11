"use client";

import { useState, useRef, useEffect } from "react";
import { Pin, Trash2, Link as LinkIcon } from "lucide-react";

const COLOR_MAP: Record<string, string> = {
  cream: "#F8F6F1",
  green: "#2E5339",
  rose: "#C27B9E",
  sky: "#7DA5C4",
  amber: "#D4A84B",
};

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

  const borderColor = COLOR_MAP[sticky.color] ?? COLOR_MAP.cream;

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
      className="bg-card"
      style={{
        borderTop: `3px solid ${borderColor}`,
        borderRadius: 10,
        padding: "12px 14px",
        width: 220,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "box-shadow 0.15s ease",
        boxShadow: isHovered
          ? "0 2px 12px rgba(0,0,0,0.08)"
          : "0 1px 3px rgba(0,0,0,0.04)",
        position: "relative",
      }}
    >
      {/* Action buttons */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          gap: 4,
          opacity: isHovered || sticky.isPinned ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        <button
          type="button"
          onClick={() => onUpdate(sticky.id, { isPinned: !sticky.isPinned })}
          title={sticky.isPinned ? "Unpin" : "Pin"}
          className={sticky.isPinned ? "text-primary" : "text-muted-foreground/60"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Pin size={14} />
        </button>
        {isHovered && (
          <button
            type="button"
            onClick={() => onArchive(sticky.id)}
            title="Archive"
            className="text-muted-foreground/60"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          maxLength={500}
          rows={3}
          className="text-foreground border border-border"
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            background: "transparent",
            borderRadius: 6,
            padding: "6px 8px",
            resize: "vertical",
            outline: "none",
            fontFamily: "inherit",
            width: "100%",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditContent(sticky.content);
            setIsEditing(true);
          }}
          className="text-foreground"
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            cursor: "text",
            textAlign: "left",
            background: "none",
            border: "none",
            padding: 0,
            fontFamily: "inherit",
            minHeight: 20,
          }}
        >
          {sticky.content}
        </button>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto",
        }}
      >
        <span
          className="text-muted-foreground/60"
          style={{
            fontSize: 11,
          }}
        >
          {timeAgo(sticky.createdAt)}
        </span>
        {sticky.requestId && (
          <span
            className="text-primary bg-primary/10"
            style={{
              fontSize: 10,
              fontWeight: 560,
              padding: "2px 6px",
              borderRadius: 4,
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <LinkIcon size={10} />
            Linked
          </span>
        )}
      </div>
    </div>
  );
}
