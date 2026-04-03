"use client";
import { useShortcuts } from "./global-shortcuts-provider";

export function HeaderSearch() {
  const { openPalette } = useShortcuts();
  return (
    <button
      onClick={openPalette}
      className="hidden md:flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 transition-colors"
    >
      <span>Search</span>
      <kbd className="text-[10px] border border-[var(--border)] rounded px-1 font-mono bg-[var(--bg-subtle)]">⌘K</kbd>
    </button>
  );
}
