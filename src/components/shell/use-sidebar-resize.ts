"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { animate, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { motionTokens } from "@/components/arc/lib/motion-tokens";

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

/** Lane's edge-resize adaptation of Arc's spring-driven desktop sidebar. */
export function useSidebarResize(disabled: boolean, linearPreviewAutoCollapse = false, onAutoExpand?: () => void) {
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false) && !linearPreviewAutoCollapse;
  const previewCompact = useSyncExternalStore(subscribeLinearPreviewCompact, () => window.matchMedia(LINEAR_PREVIEW_COMPACT).matches, () => false);
  const autoCollapsed = linearPreviewAutoCollapse && previewCompact;
  const reduced = useReducedMotion();
  const initialWidth = linearPreviewAutoCollapse ? 254 : 272;
  const [width, setWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);
  const [lastExpanded, setLastExpanded] = useState(initialWidth);
  const drag = useRef<{ id: number; x: number; width: number; target: number; remembered: number; handle: HTMLElement } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const pixels = useMotionValue(initialWidth);
  const cssWidth = useTransform(pixels, value => `${Math.max(0, value)}px`);
  const effectiveWidth = autoCollapsed ? 0 : width;
  const collapsed = (width === 0 || autoCollapsed) && !phone;

  useEffect(() => {
    if (resizing) return;
    if (reduced) { pixels.jump(effectiveWidth); return; }
    const controls = animate(pixels, effectiveWidth, motionTokens.spring.smooth);
    return () => controls.stop();
  }, [effectiveWidth, pixels, reduced, resizing]);

  function resize(next: number) {
    const bounded = next < COLLAPSE_AT ? 0 : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(next)));
    if (bounded) setLastExpanded(bounded);
    if (drag.current) pixels.jump(bounded);
    setWidth(bounded);
  }
  function expand() {
    if (disabled || phone) return;
    if (autoCollapsed) { onAutoExpand?.(); return; }
    resize(lastExpanded);
    focusVisible('button[aria-label^="Account menu,"]');
  }
  function focusVisible(selector: string) {
    requestAnimationFrame(() => [...(shellRef.current?.querySelectorAll<HTMLButtonElement>(selector) ?? [])]
      .find(button => button.getClientRects().length > 0 && !button.closest('[hidden],[inert]'))?.focus({ preventScroll: true }));
  }
  function toggle() {
    if (disabled || phone) return;
    if (collapsed) { expand(); return; }
    resize(0);
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
    // Motion's value can be one paint ahead of the edge on screen. Capture the
    // rendered width so grabbing a moving edge does not skip those final pixels.
    const visibleWidth = shellRef.current?.querySelector("#lane-sidebar")?.getBoundingClientRect().width ?? pixels.get();
    drag.current = { id: event.pointerId, x: event.clientX, width: visibleWidth, target: width, remembered: lastExpanded, handle: event.currentTarget };
    // Browser capture keeps the drag alive when the edge moves under the pointer.
    if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
    pixels.jump(visibleWidth);
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
    if (next !== null) { event.preventDefault(); resize(next); }
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
  const cancelDrag = useEffectEvent(() => finish(true));
  useEffect(() => { if (phone || disabled || autoCollapsed) cancelDrag(); }, [phone, disabled, autoCollapsed]);
  useEffect(() => {
    if (autoCollapsed && (shellRef.current?.querySelector("#lane-sidebar")?.contains(document.activeElement) || document.activeElement === handleRef.current)) {
      focusVisible('button[aria-label="Expand sidebar"]');
    }
  }, [autoCollapsed]);

  return { shellRef, cssWidth, collapsed, autoCollapsed, resizing, phone, expand, peekWidth: lastExpanded,
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
