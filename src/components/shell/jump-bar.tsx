"use client";

import { usePlatform } from "@/components/arc/shortcut-recorder/shortcut-recorder";
import { KeyCap } from "@/components/keyboard/key-caps";
import { openShellSurface } from "./shell-openers";
import styles from "./workspace-shell.module.css";

/**
 * #268 (#239 decision 9, #230 item 2): the sidebar's Jump to… bar, a way into the ⌘K palette for mouse users. A
 * button, not a field: it opens the palette, and focus comes back to it when the palette closes. Only the
 * listener and this bar ship with the page; the palette's own code still loads on demand. The stylesheet shows it
 * only on desktop with the sidebar expanded (not on phones, not collapsed or peeking); ⌘K works everywhere.
 */
export function JumpBar() {
  const modifier = usePlatform() === "mac" ? "⌘" : "Ctrl";
  return <button type="button" className={styles.jump} aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K"
    onClick={event => { openShellSurface("palette", { returnFocus: event.currentTarget }); }}>
    <span className={styles.jumpLabel}>Jump to…</span>
    <span className={styles.jumpKeys}><KeyCap>{modifier}</KeyCap><KeyCap>K</KeyCap></span>
  </button>;
}
