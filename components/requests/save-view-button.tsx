"use client";

import { useState, useRef, useEffect } from "react";
import { Star, Check } from "lucide-react";

interface SaveViewButtonProps {
  onSave: (name: string) => void;
  hasActiveFilters: boolean;
}

export function SaveViewButton({ onSave, hasActiveFilters }: SaveViewButtonProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const trimmed = name.trim();
      if (trimmed) {
        onSave(trimmed);
        setName("");
        setIsEditing(false);
      }
    } else if (e.key === "Escape") {
      setName("");
      setIsEditing(false);
    }
  }

  function handleConfirm() {
    const trimmed = name.trim();
    if (trimmed) {
      onSave(trimmed);
      setName("");
      setIsEditing(false);
    }
  }

  if (!hasActiveFilters) return null;

  if (isEditing) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 28,
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          overflow: "hidden",
          background: "var(--bg-surface)",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="View name…"
          style={{
            height: "100%",
            padding: "0 8px",
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "'Geist Mono', monospace",
            fontSize: 11,
            color: "var(--text-primary)",
            width: 140,
          }}
        />
        <button
          onClick={handleConfirm}
          title="Save view"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: "100%",
            border: "none",
            borderLeft: "1px solid var(--border)",
            background: name.trim() ? "var(--accent)" : "var(--bg-subtle)",
            color: name.trim() ? "#fff" : "var(--text-tertiary)",
            cursor: name.trim() ? "pointer" : "default",
            transition: "background 0.1s",
          }}
        >
          <Check size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: 28,
        padding: "0 10px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "var(--bg-surface)",
        color: "var(--text-secondary)",
        fontFamily: "'Geist Mono', monospace",
        fontSize: 11,
        fontWeight: 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "background 0.1s",
      }}
      className="hover:bg-[var(--bg-hover)]"
    >
      <Star size={11} />
      Save View
    </button>
  );
}
