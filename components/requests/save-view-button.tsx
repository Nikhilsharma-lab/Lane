"use client";

import { useState, useRef, useEffect } from "react";
import { Star, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <div className="flex items-center gap-0 h-7 border rounded-md overflow-hidden bg-card">
        <Input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="View name…"
          className="h-full border-none rounded-none font-mono text-[11px] w-[140px] focus-visible:ring-0"
        />
        <Button
          variant={name.trim() ? "default" : "secondary"}
          size="icon-sm"
          onClick={handleConfirm}
          title="Save view"
          className="rounded-none border-l h-full"
        >
          <Check className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={() => setIsEditing(true)}
    >
      <Star className="size-3" />
      Save View
    </Button>
  );
}
