"use client";

import { useState, useRef, useEffect } from "react";
import { StickyNote, X, Link2 } from "lucide-react";
import { createSticky } from "@/app/actions/stickies";
import { useRequests } from "@/context/requests-context";

const COLORS = [
  { key: "cream", hex: "#F8F6F1" },
  { key: "green", hex: "#2E5339" },
  { key: "rose", hex: "#C27B9E" },
  { key: "sky", hex: "#7DA5C4" },
  { key: "amber", hex: "#D4A84B" },
];

export function StickyPad() {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const [color, setColor] = useState("cream");
  const [linkedRequestId, setLinkedRequestId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requests = useRequests();

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard shortcut: N then S
  useEffect(() => {
    let lastKey = "";
    let timer: ReturnType<typeof setTimeout>;

    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (lastKey === "n" && e.key === "s") {
        e.preventDefault();
        setIsOpen(true);
        lastKey = "";
        return;
      }
      lastKey = e.key;
      clearTimeout(timer);
      timer = setTimeout(() => {
        lastKey = "";
      }, 500);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, []);

  function handleDiscard() {
    setContent("");
    setColor("cream");
    setLinkedRequestId(null);
    setIsOpen(false);
  }

  async function handleSave() {
    const trimmed = content.trim();
    if (!trimmed) return;

    setIsSaving(true);
    await createSticky({ content: trimmed, color, requestId: linkedRequestId });
    setIsSaving(false);
    setContent("");
    setColor("cream");
    setLinkedRequestId(null);
    setIsOpen(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {/* Capture card overlay */}
      {isOpen && (
        <div
          style={{
            width: 280,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 14,
            boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Quick sticky
            </span>
            <button
              type="button"
              onClick={handleDiscard}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-tertiary)",
                padding: 2,
                display: "flex",
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") handleDiscard();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSave();
              }
            }}
            maxLength={500}
            placeholder="What's on your mind?"
            rows={3}
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--text-primary)",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 10px",
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
              width: "100%",
            }}
          />

          {/* Character count */}
          <div
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              textAlign: "right",
              marginTop: -6,
            }}
          >
            {content.length}/500
          </div>

          {/* Color picker */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginRight: 2,
              }}
            >
              Color
            </span>
            {COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setColor(c.key)}
                title={c.key}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: c.hex,
                  border:
                    color === c.key
                      ? "2px solid var(--text-primary)"
                      : "1px solid var(--border)",
                  cursor: "pointer",
                  padding: 0,
                  transition: "border 0.1s ease",
                }}
              />
            ))}
          </div>

          {/* Link to request */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link2 size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <select
              value={linkedRequestId ?? ""}
              onChange={(e) => setLinkedRequestId(e.target.value || null)}
              style={{
                flex: 1,
                fontSize: 12,
                color: linkedRequestId ? "var(--text-primary)" : "var(--text-tertiary)",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 8px",
                outline: "none",
                fontFamily: "inherit",
              }}
            >
              <option value="">Link to request (optional)</option>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title.length > 35 ? r.title.slice(0, 35) + "…" : r.title}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 2,
            }}
          >
            <button
              type="button"
              onClick={handleDiscard}
              style={{
                fontSize: 13,
                fontWeight: 520,
                color: "var(--text-secondary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: 6,
              }}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!content.trim() || isSaving}
              style={{
                fontSize: 13,
                fontWeight: 560,
                color: "#fff",
                background: !content.trim() || isSaving
                  ? "var(--text-tertiary)"
                  : "var(--accent)",
                border: "none",
                cursor: !content.trim() || isSaving ? "not-allowed" : "pointer",
                padding: "5px 14px",
                borderRadius: 6,
                transition: "background 0.15s ease",
              }}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="New sticky (N then S)"
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 12px rgba(46,83,57,0.3)",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
      >
        <StickyNote size={22} />
      </button>
    </div>
  );
}
