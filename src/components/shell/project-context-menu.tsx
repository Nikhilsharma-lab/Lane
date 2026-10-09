"use client";

import { useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Copy, ExternalLink, RotateCcw } from "lucide-react";
import { ContextMenu } from "@/components/arc/context-menu/context-menu";

export interface ProjectContextMenuProps {
  children: ReactElement;
  href: string;
  label: string;
  onNavigate?: () => void;
  onOpenChange?: (open: boolean) => void;
}

/** Arc's context menu keeps the existing Project link as its navigation target. */
export function ProjectContextMenu({ children, href, label, onNavigate, onOpenChange }: ProjectContextMenuProps) {
  const router = useRouter();
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const copyVersion = useRef(0);

  async function copyLink() {
    if (copyState === "copying") return;
    const version = ++copyVersion.current;
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      if (version === copyVersion.current) setCopyState("copied");
    } catch {
      if (version === copyVersion.current) setCopyState("error");
    }
  }

  const copyLabel = copyState === "copying" ? "Copying link…" : copyState === "copied" ? "Link copied" : copyState === "error" ? "Copy failed. Try again" : "Copy link";
  return <>
    <ContextMenu asChild openOnClick={false} label={`${label} actions`} onOpenChange={open => {
      copyVersion.current += 1;
      setCopyState("idle");
      onOpenChange?.(open);
    }} items={[
      { id: "open", label: "Open", icon: <ArrowUpRight size={15} />, onSelect: () => { onNavigate?.(); router.push(href); } },
      { id: "new-tab", label: "Open in new tab", icon: <ExternalLink size={15} />, onSelect: () => { window.open(href, "_blank", "noopener,noreferrer"); } },
      { id: "copy", label: copyLabel, icon: copyState === "copied" ? <Check size={15} /> : copyState === "error" ? <RotateCcw size={15} /> : <Copy size={15} />, closeOnSelect: false, onSelect: () => { void copyLink(); } },
    ]}>{children}</ContextMenu>
    <span className="sr-only" role="status" aria-live="polite">{copyState === "copied" ? `Link to ${label} copied.` : copyState === "error" ? "Could not copy the link. Try again." : ""}</span>
  </>;
}
