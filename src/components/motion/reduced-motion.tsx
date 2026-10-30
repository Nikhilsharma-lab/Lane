"use client";

import { MotionGlobalConfig } from "motion/react";

/**
 * #262 (polish bar §10, A122): Lane's one reduced-motion rule. With motion turned off on the device,
 * overlays, menus, the bottom panel, toasts, rows and placeholders appear and disappear at once.
 *
 * Two halves, both global, so a new component follows them without opting in:
 * - Motion (JavaScript): `MotionGlobalConfig.instantAnimations` makes every Motion animation (motion
 *   components, AnimatePresence exits, `animate()`) jump to its end on the next frame, fades included.
 *   It follows the device setting live.
 * - CSS: `src/app/globals.css` cuts every CSS animation and transition to an instant under
 *   `prefers-reduced-motion: reduce` (zero-length animations still fire `animationend` for Radix).
 *
 * Anything that animates outside those two (the Web Animations API, a requestAnimationFrame loop)
 * checks `prefersReducedMotion()` and skips the movement.
 */
const query = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

// Runs once when the browser loads this module, before anything has animated.
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const media = window.matchMedia(query);
  const apply = () => { MotionGlobalConfig.instantAnimations = media.matches; };
  apply();
  media.addEventListener("change", apply);
}

/** Mounted once in the root layout so the rule above loads on every page. Renders nothing. */
export function ReducedMotion() {
  return null;
}
