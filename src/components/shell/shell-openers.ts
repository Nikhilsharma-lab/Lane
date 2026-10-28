"use client";

import { useEffect, useEffectEvent } from "react";

/**
 * Issue #102 (spec #101): one small way to open the shell's surfaces from
 * outside their own components, for the command palette. Each surface keeps
 * its own state and its own key (/, ?, C, a click on the bell); its component
 * registers an opener while it is mounted, and the palette calls it.
 *
 * A surface that is not mounted has no opener: `openShellSurface` returns
 * false and `canOpenShellSurface` says so, so the palette leaves the entry
 * out. On Settings that is search and the ? overlay, because the shell
 * renders only the page there (sidebar-view.tsx). The composer is mounted in
 * the (app) layout, so it opens everywhere. #204: the bell is a link to the
 * Inbox page, so it is a place the palette goes to, not a surface.
 */
export const SHELL_SURFACES = ["search", "shortcuts", "composer"] as const;
export type ShellSurface = (typeof SHELL_SURFACES)[number];

export interface ShellOpenRequest {
  /**
   * Where focus goes when the surface closes, where its own key would have
   * sent it. The palette passes what had focus before it opened; by the time
   * it calls, focus is on its own input or the page.
   */
  returnFocus?: HTMLElement | null;
}

export type ShellOpener = (request: ShellOpenRequest) => void;

const openers = new Map<ShellSurface, ShellOpener>();

/** Returns the unregister. A late unregister leaves a newer opener alone (Strict Mode remounts, a page swap). */
export function registerShellOpener(surface: ShellSurface, open: ShellOpener): () => void {
  openers.set(surface, open);
  return () => { if (openers.get(surface) === open) openers.delete(surface); };
}

export function canOpenShellSurface(surface: ShellSurface): boolean {
  return openers.has(surface);
}

/** Opens the surface and returns true, or returns false when it is not mounted. */
export function openShellSurface(surface: ShellSurface, request: ShellOpenRequest = {}): boolean {
  const open = openers.get(surface);
  if (!open) return false;
  open(request);
  return true;
}

/** Registers the component's opener while it is mounted and `enabled`; the opener always sees the latest render. */
export function useShellOpener(surface: ShellSurface, open: ShellOpener, enabled = true) {
  const run = useEffectEvent(open);
  useEffect(() => enabled ? registerShellOpener(surface, request => run(request)) : undefined, [surface, enabled]);
}
