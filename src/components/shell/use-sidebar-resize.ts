"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { useReducedMotion } from "motion/react";
import { layoutWidthFor, planToggle, slideFor, type SidebarMotion } from "./sidebar-motion";

const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const COLLAPSE_AT = 160;
const PHONE = "(max-width: 640px)";
const LINEAR_PREVIEW_COMPACT = "(max-width: 880px)";
const subscribePhone = (change: () => void) => {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const subscribeLinearPreviewCompact = (change: () => void) => {
  const query = window.matchMedia(LINEAR_PREVIEW_COMPACT);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};

/**
 * Lane's edge-resize adaptation of Arc's desktop sidebar. Plan item 2.4 (plan
 * §2.3): a toggle slides the panel on transform only and changes the content's
 * width once, at the start of a collapse and at the end of an expand
 * (sidebar-motion.ts). Drags, arrow keys, End, reduced motion, an automatic
 * collapse and pinning a visible peek change the width in one jump.
 */
export function useSidebarResize(disabled: boolean, linearPreviewAutoCollapse = false, onAutoExpand?: () => void) {
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false) && !linearPreviewAutoCollapse;
  const previewCompact = useSyncExternalStore(subscribeLinearPreviewCompact, () => window.matchMedia(LINEAR_PREVIEW_COMPACT).matches, () => false);
  const autoCollapsed = linearPreviewAutoCollapse && previewCompact;
  const reduced = useReducedMotion();
  // Supabase's sidebar width (--sb-sidebar-width, 13rem).
  const initialWidth = 208;
  const [width, setWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);
  const [lastExpanded, setLastExpanded] = useState(initialWidth);
  const drag = useRef<{ id: number; x: number; width: number; target: number; remembered: number; handle: HTMLElement } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [motion, setMotionState] = useState<SidebarMotion>(null);
  const motionRef = useRef<SidebarMotion>(null);
  const slide = useRef<Animation | null>(null);
  // A finished slide holds its last frame (fill: both) until the commit that lands the panel there.
  const ended = useRef<Animation | null>(null);
  const effectiveWidth = autoCollapsed ? 0 : width;
  const layoutWidth = layoutWidthFor({ width, autoCollapsed, motion });
  const collapsed = (width === 0 || autoCollapsed) && !phone;

  function setMotion(next: SidebarMotion) {
    motionRef.current = next;
    setMotionState(next);
  }
  /** Lands a slide that reached its end: the panel leaves the overlay box in the next commit, where the held frame is dropped. */
  function land(animation: Animation) {
    const panel = (animation.effect as KeyframeEffect | null)?.target as HTMLElement | null;
    // A collapse lands on the collapsed panel, off-screen at the same spot; its peek transitions must not replay there.
    if (motionRef.current === "collapsing" && panel) {
      panel.style.transition = "none";
      requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.transition = ""; }));
    }
    if (!motionRef.current) { animation.cancel(); return; }
    ended.current = animation;
    setMotion(null);
  }
  /** Ends a running slide at its end state (a drag or a keyboard resize takes over). */
  function settle() {
    const running = slide.current;
    slide.current = null;
    if (running) { running.finish(); land(running); }
    else if (motionRef.current) setMotion(null);
  }
  useLayoutEffect(() => {
    if (motion !== null || !ended.current) return;
    ended.current.cancel();
    ended.current = null;
  }, [motion]);
  /** A toggle's slide: start one, turn the running one around, or jump. */
  function toggleWidth(next: number, fromPeek = false) {
    const plan = planToggle({ collapsed: next !== 0, motion: motionRef.current, reduced: Boolean(reduced), fromPeek });
    // The running slide already lands on this width: nothing to settle or restart.
    if (plan.slide === "keep") return;
    const panel = shellRef.current?.querySelector<HTMLElement>("[data-sidebar-panel]");
    if (plan.slide === "reverse" && slide.current) {
      slide.current.reverse();
      setMotion(plan.motion);
    } else if (plan.slide === "start" && panel && typeof panel.animate === "function" && plan.motion) {
      settle();
      const { keyframes, options } = slideFor(plan.motion, lastExpanded);
      // "both" holds whichever end the slide stops at, including the start of a reversed slide.
      const animation = panel.animate(keyframes, { ...options, fill: "both" });
      slide.current = animation;
      setMotion(plan.motion);
      // A reversed slide keeps this promise, so it settles wherever the slide finally ends.
      animation.finished.then(() => {
        if (slide.current !== animation) return;
        slide.current = null;
        land(animation);
      }, () => {});
    } else settle();
    resize(next);
  }

  function resize(next: number) {
    const bounded = next < COLLAPSE_AT ? 0 : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(next)));
    if (bounded) setLastExpanded(bounded);
    setWidth(bounded);
  }
  /** Keyboard steps, End and Home change the width in one jump. */
  function jump(next: number) {
    settle();
    resize(next);
  }
  function expand(fromPeek = false) {
    if (disabled || phone) return;
    if (autoCollapsed) { onAutoExpand?.(); return; }
    toggleWidth(lastExpanded, fromPeek);
    focusVisible('button[aria-label^="Account menu,"]');
  }
  function focusVisible(selector: string) {
    requestAnimationFrame(() => [...(shellRef.current?.querySelectorAll<HTMLButtonElement>(selector) ?? [])]
      .find(button => button.getClientRects().length > 0 && !button.closest('[hidden],[inert]'))?.focus({ preventScroll: true }));
  }
  function toggle() {
    if (disabled || phone) return;
    if (collapsed) { expand(); return; }
    toggleWidth(0);
    focusVisible('button[aria-label="Expand sidebar"]');
  }
  function finish(cancel: boolean) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (cancel) { setLastExpanded(current.remembered); setWidth(current.target); }
    if (current.handle.hasPointerCapture(current.id)) current.handle.releasePointerCapture(current.id);
    setResizing(false);
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || phone || autoCollapsed || event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    // Grabbing the edge mid-slide finishes the slide first, so the drag starts from the width it was heading to.
    const sliding = motionRef.current !== null;
    settle();
    const visibleWidth = sliding ? width : shellRef.current?.querySelector("#lane-sidebar")?.getBoundingClientRect().width ?? width;
    drag.current = { id: event.pointerId, x: event.clientX, width: visibleWidth, target: width, remembered: lastExpanded, handle: event.currentTarget };
    // Browser capture keeps the drag alive when the edge moves under the pointer.
    if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (autoCollapsed) { finish(true); return; }
    resize(current.width + event.clientX - current.x);
  }
  function onPointerEnd(event: PointerEvent<HTMLDivElement>, cancel: boolean) {
    if (event.pointerId === drag.current?.id) finish(cancel);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || phone || autoCollapsed) return;
    if (event.key === "Escape" && drag.current) { event.preventDefault(); finish(true); return; }
    const step = event.shiftKey ? 32 : 16;
    const next = event.key === "Home" ? 0 : event.key === "End" ? MAX_WIDTH : event.key === "ArrowLeft" ? width <= MIN_WIDTH ? 0 : Math.max(MIN_WIDTH, width - step) : event.key === "ArrowRight" ? collapsed ? MIN_WIDTH : width + step : null;
    if (next !== null) { event.preventDefault(); jump(next); }
    else if (event.key === "Enter") { event.preventDefault(); toggle(); }
  }
  const shortcut = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (event.key === "Escape" && drag.current) { event.preventDefault(); finish(true); return; }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (event.key !== "[" || disabled || phone || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || target?.isContentEditable || target?.closest('input,textarea,select,[role="textbox"],[role="menu"],[role="dialog"]')) return;
    const box = shellRef.current?.getBoundingClientRect();
    if (!box?.width || box.bottom < 0 || box.top > window.innerHeight) return;
    event.preventDefault(); toggle();
  });
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => shortcut(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const cancelDrag = useEffectEvent(() => { finish(true); settle(); });
  useEffect(() => { if (phone || disabled || autoCollapsed) cancelDrag(); }, [phone, disabled, autoCollapsed]);
  useEffect(() => () => { slide.current?.cancel(); }, []);
  useEffect(() => {
    if (autoCollapsed && (shellRef.current?.querySelector("#lane-sidebar")?.contains(document.activeElement) || document.activeElement === handleRef.current)) {
      focusVisible('button[aria-label="Expand sidebar"]');
    }
  }, [autoCollapsed]);

  return { shellRef, layoutWidth, motion, collapsed, autoCollapsed, resizing, phone, expand, peekWidth: lastExpanded,
    separator: {
      ref: handleRef, role: "separator" as const, tabIndex: disabled || autoCollapsed ? -1 : 0,
      "aria-label": "Resize sidebar", "aria-orientation": "vertical" as const,
      "aria-controls": "lane-sidebar", "aria-valuemin": 0, "aria-valuemax": MAX_WIDTH, "aria-valuenow": effectiveWidth,
      "aria-valuetext": autoCollapsed ? "Sidebar collapsed automatically" : collapsed ? "Sidebar collapsed" : `${width} pixels`, "aria-disabled": disabled || autoCollapsed || undefined,
      onPointerDown, onPointerMove, onPointerUp: (event: PointerEvent<HTMLDivElement>) => onPointerEnd(event, false), onPointerCancel: (event: PointerEvent<HTMLDivElement>) => onPointerEnd(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => onPointerEnd(event, true), onKeyDown,
    },
  };
}
