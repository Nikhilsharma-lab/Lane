"use client";

import { useLayoutEffect, useRef, type AnimationEvent, type ReactNode } from "react";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { prefersReducedMotion } from "@/components/motion/reduced-motion";
import styles from "./placeholder.module.css";

export interface PlaceholderProps {
  /** The loading shape: a page's own skeleton markup. Without it, an Arc Skeleton with `label`, `lines` and `avatar`. */
  children?: ReactNode;
  /** What the wait is announced as, for the default Arc Skeleton. */
  label?: string;
  lines?: number;
  avatar?: boolean;
  className?: string;
}

/**
 * #262 (polish bar §5): Lane's one placeholder, around Arc `skeleton`. Every route `loading.tsx` and
 * every in-page placeholder renders through it:
 *
 * - It stays invisible for `--duration-fast` (0.15s), so content that arrives quickly never shows a
 *   placeholder at all. Until then, what was clicked shows as pressed (`pressed-navigation.tsx`).
 * - Then it fades in, and when the content replaces it, the two crossfade over `--duration-standard`
 *   (0.2s): the placeholder fades out over the content as the content fades in.
 * - With motion turned off it appears and disappears at once, after the same wait.
 *
 * Use it in place of a bare `<Skeleton>`: `<Placeholder label="Loading people" lines={3} />`, or wrap a
 * page's own skeleton shape: `<Placeholder><RequestDetailSkeleton /></Placeholder>`. Each page's own
 * shape belongs to its screen.
 */
export function Placeholder({ children, label, lines, avatar, className }: PlaceholderProps) {
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    // Runs while the placeholder is still on the page, just before React removes it for the content.
    return () => { if (shown.current) crossfade(node); };
  }, []);
  const onAnimationStart = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.parentElement === root.current && /placeholder-in/.test(event.animationName)) shown.current = true;
  };
  return <div ref={root} className={[styles.placeholder, className].filter(Boolean).join(" ")} data-placeholder="" onAnimationStart={onAnimationStart}>
    {children ?? <Skeleton label={label} lines={lines} avatar={avatar} />}
  </div>;
}

/** The theme's standard duration (ms) and ease, read from theme.css so this file holds no motion value. */
function standardMotion() {
  const style = getComputedStyle(document.documentElement);
  const duration = Number.parseFloat(style.getPropertyValue("--duration-standard"));
  const easing = style.getPropertyValue("--ease-standard").trim() || "ease";
  return { duration: Number.isFinite(duration) ? duration : 0, easing };
}

/**
 * Leaves a copy of the visible placeholder where it was, fading out, and fades in whatever replaces it.
 * The copy sits in the main pane or dialog that holds the placeholder, so it keeps that context's look.
 */
function crossfade(node: HTMLElement) {
  if (prefersReducedMotion() || typeof node.animate !== "function") return;
  const { duration, easing } = standardMotion();
  if (!duration) return;
  const host = node.closest<HTMLElement>('[role="dialog"], #lane-main') ?? document.body;
  for (const child of Array.from(node.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const box = child.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const ghost = child.cloneNode(true) as HTMLElement;
    ghost.setAttribute("aria-hidden", "true");
    ghost.removeAttribute("role");
    ghost.inert = true;
    Object.assign(ghost.style, { position: "fixed", top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px`, margin: "0", pointerEvents: "none", animation: "none" });
    host.append(ghost);
    // A transformed ancestor moves fixed boxes; correct by what actually landed.
    const landed = ghost.getBoundingClientRect();
    if (landed.top !== box.top || landed.left !== box.left) Object.assign(ghost.style, { top: `${2 * box.top - landed.top}px`, left: `${2 * box.left - landed.left}px` });
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing, fill: "forwards" }).finished.then(() => ghost.remove(), () => ghost.remove());
  }
  const parent = node.parentElement;
  if (!parent) return;
  const before = new Set(Array.from(parent.children));
  // The content is added in the same commit, after this cleanup.
  queueMicrotask(() => {
    if (!parent.isConnected) return;
    for (const child of Array.from(parent.children)) {
      if (before.has(child) || !(child instanceof HTMLElement) || child.hasAttribute("data-placeholder")) continue;
      child.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
    }
  });
}
