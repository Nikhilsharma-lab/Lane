"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { ShortcutKbd } from "@/components/arc/shortcut-recorder/shortcut-recorder";

/**
 * #262 (polish bar §9, #225): Lane's one key cap, Arc `shortcut-recorder`'s `ShortcutKbd` at its small
 * size. Every shortcut hint (tooltips, the `?` overlay, the ⌘K palette, inline "Press C" hints) draws its
 * keys with it; product code writes no `<kbd>` of its own (design:check). On touch screens globals.css
 * hides every key cap, Arc's own included.
 *
 * `<KeyCap>C</KeyCap>`, one cap per key of a chord. Caps are decorative: say the shortcut in words nearby
 * (`aria-keyshortcuts`, a label or screen-reader text).
 */
export function KeyCap({ children, className, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <ShortcutKbd size="sm" aria-hidden="true" {...props} className={className}>{children}</ShortcutKbd>;
}
