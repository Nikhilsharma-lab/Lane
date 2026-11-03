"use client";

import { useRef, useState, type ReactElement } from "react";
import { useRequestNavigation } from "@/components/requests/request-navigation";
import { ArrowUpRight, Check, Copy, ExternalLink, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "@/components/arc/context-menu/context-menu";

import { Button } from "@/components/arc/button/button";
import { PermanentActionConfirmation } from "@/components/popup/permanent-action-confirmation";
import { thrownMessage } from "@/lib/failure-messages";
import styles from "./project-context-menu.module.css";

export interface ProjectContextMenuProps {
  children: ReactElement;
  href: string;
  label: string;
  onDelete?: () => Promise<void>;
  onNavigate?: () => void;
  onOpenChange?: (open: boolean) => void;
}

/** Arc's context menu keeps the existing Project link as its navigation target. */
export function ProjectContextMenu({ children, href, label, onNavigate, onOpenChange, onDelete }: ProjectContextMenuProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  async function confirmDelete() {
    if (!onDelete || pending.current) return;
    pending.current = true;
    setBusy(true); setError(null);
    try { await onDelete(); setConfirming(false); }
    catch (thrown) { setError(thrownMessage(thrown, "The Project couldn't be deleted. Try again.")); }
    finally { pending.current = false; setBusy(false); }
  }
  const navigation = useRequestNavigation();
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

  const copyLabel = copyState === "copied" ? "Link copied" : copyState === "error" ? "Copy failed. Try again" : "Copy link";
  const items: ContextMenuItem[] = [
    { id: "open", label: "Open", icon: <ArrowUpRight />, onSelect: () => { navigation.open(href); onNavigate?.(); } },
    { id: "new-tab", label: "Open in new tab", icon: <ExternalLink />, onSelect: () => { window.open(href, "_blank", "noopener,noreferrer"); } },
    { id: "copy", label: copyLabel, icon: copyState === "copied" ? <Check /> : copyState === "error" ? <RotateCcw /> : <Copy />, closeOnSelect: false, onSelect: () => { void copyLink(); } },
    ...(onDelete ? [{ id: "delete", label: "Delete Project…", icon: <Trash2 />, destructive: true, separatorBefore: true, onSelect: () => { setError(null); setConfirming(true); } }] : []),
  ];
  function menuChanged(open: boolean) {
    copyVersion.current += 1;
    setCopyState("idle");
    onOpenChange?.(open);
  }
  return <>
    <div className={styles.row}>
      <ContextMenu asChild openOnClick={false} label={`${label} actions`} onOpenChange={menuChanged} items={items}>{children}</ContextMenu>
      {onDelete && <ContextMenu asChild label={`${label} actions`} onOpenChange={menuChanged} items={items}>
        <Button ref={opener} type="button" size="sm" variant="ghost" className={styles.more} aria-label={`${label} actions`}><MoreHorizontal aria-hidden="true" /></Button>
      </ContextMenu>}
    </div>
    <PermanentActionConfirmation open={confirming} onOpenChange={setConfirming} title={`Delete “${label}”?`}
      description="Requests will be kept under No Project. This Project and its Project-only labels will be permanently deleted. Workspace labels will be kept. This can't be undone."
      confirmLabel="Delete Project" busy={busy} onConfirm={() => { void confirmDelete(); }}
      returnFocus={() => opener.current ?? document.querySelector<HTMLButtonElement>('#lane-sidebar button[aria-label="Projects"]')}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </PermanentActionConfirmation>
    <span className="sr-only" role="status" aria-live="polite">{copyState === "copied" ? `Link to ${label} copied.` : copyState === "error" ? "Couldn't copy the link. Try again." : ""}</span>
  </>;
}
