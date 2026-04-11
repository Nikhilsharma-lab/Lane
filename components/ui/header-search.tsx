"use client";
import { useShortcuts } from "./global-shortcuts-provider";

export function HeaderSearch() {
  const { openPalette } = useShortcuts();
  return (
    <button
      onClick={openPalette}
      className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground border border-border rounded-lg px-2.5 py-1.5 transition-colors"
    >
      <span>Search</span>
      <kbd className="text-[10px] border border-border rounded px-1 font-mono bg-muted">⌘K</kbd>
    </button>
  );
}
