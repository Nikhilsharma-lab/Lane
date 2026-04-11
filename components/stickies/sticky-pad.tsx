"use client";

import { useState, useRef, useEffect } from "react";
import { StickyNote, X, Link2 } from "lucide-react";
import { createSticky } from "@/app/actions/stickies";
import { useRequests } from "@/context/requests-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {/* Capture card overlay */}
      {isOpen && (
        <Card className="w-[280px] shadow-lg">
          <CardHeader className="flex-row items-center justify-between pb-0">
            <CardTitle className="text-[13px] font-semibold">
              Quick sticky
            </CardTitle>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleDiscard}
              className="text-muted-foreground/60"
            >
              <X size={14} />
            </Button>
          </CardHeader>

          <CardContent className="flex flex-col gap-2.5">
            {/* Textarea */}
            <Textarea
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
              className="resize-y text-[13px] leading-relaxed"
            />

            {/* Character count */}
            <p className="-mt-1.5 text-right text-[11px] text-muted-foreground/60">
              {content.length}/500
            </p>

            {/* Color picker */}
            <div className="flex items-center gap-1.5">
              <span className="mr-0.5 text-[11px] text-muted-foreground/60">
                Color
              </span>
              {COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setColor(c.key)}
                  title={c.key}
                  className="size-[18px] cursor-pointer rounded-full p-0 transition-[border] duration-100"
                  style={{
                    background: c.hex,
                    border:
                      color === c.key
                        ? "2px solid hsl(var(--foreground))"
                        : "1px solid hsl(var(--border))",
                  }}
                />
              ))}
            </div>

            {/* Link to request */}
            <div className="flex items-center gap-1.5">
              <Link2 size={12} className="shrink-0 text-muted-foreground/60" />
              <select
                value={linkedRequestId ?? ""}
                onChange={(e) => setLinkedRequestId(e.target.value || null)}
                className={`flex-1 rounded-md border border-input bg-input/20 px-2 py-1 text-xs font-inherit outline-none ${
                  linkedRequestId
                    ? "text-foreground"
                    : "text-muted-foreground/60"
                }`}
              >
                <option value="">Link to request (optional)</option>
                {requests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title.length > 35
                      ? r.title.slice(0, 35) + "…"
                      : r.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="mt-0.5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleDiscard}>
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!content.trim() || isSaving}
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* FAB */}
      <Button
        onClick={() => setIsOpen((prev) => !prev)}
        title="New sticky (N then S)"
        size="icon-lg"
        className="size-12 rounded-full shadow-lg"
      >
        <StickyNote size={22} />
      </Button>
    </div>
  );
}
