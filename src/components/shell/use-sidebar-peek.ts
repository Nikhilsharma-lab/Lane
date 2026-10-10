"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { motionTokens } from "@/components/arc/lib/motion-tokens";

/** A temporary sidebar preview. It never changes the saved width or moves focus on hover. */
export function useSidebarPeek(collapsed: boolean, disabled: boolean) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(56);
  const [closing, setClosing] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const pointer = useRef({ trigger: false, panel: false });
  const hoveredPanelNode = useRef<EventTarget | null>(null);
  const focused = useRef(false);
  const pendingFocus = useRef<number | null>(null);

  function cancelPendingFocus() {
    if (pendingFocus.current === null) return;
    cancelAnimationFrame(pendingFocus.current);
    pendingFocus.current = null;
  }
  useLayoutEffect(() => {
    if (!collapsed || disabled) {
      cancelPendingFocus();
      focused.current = false;
    }
    return cancelPendingFocus;
  }, [collapsed, disabled]);

  function cancelClose() {
    setClosing(false);
  }
  function dismiss(restoreFocus = false) {
    cancelPendingFocus();
    cancelClose();
    setOpen(false);
    pointer.current = { trigger: false, panel: false };
    focused.current = false;
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }
  function scheduleClose() {
    setClosing(true);
  }
  function rememberTrigger(node: HTMLButtonElement) {
    trigger.current = node;
    const shell = node.closest<HTMLElement>("[data-workspace-shell]");
    setTop(Math.ceil(node.getBoundingClientRect().bottom - (shell?.getBoundingClientRect().top ?? 0) + 4));
  }
  function show(node?: HTMLButtonElement | null) {
    if (!collapsed || disabled || !node) return;
    cancelPendingFocus();
    cancelClose();
    rememberTrigger(node);
    focused.current = true;
    setOpen(true);
    pendingFocus.current = requestAnimationFrame(() => {
      pendingFocus.current = null;
      const panel = node.closest<HTMLElement>("[data-workspace-shell]")?.querySelector<HTMLElement>("#lane-sidebar");
      if (!node.isConnected || !panel?.hasAttribute("data-peeking") || panel.hasAttribute("inert")) {
        focused.current = false;
        return;
      }
      const first = panel?.querySelector<HTMLButtonElement>('button[aria-label^="Account menu,"]');
      first?.focus({ preventScroll: true });
      if (document.activeElement !== first) focused.current = false;
    });
  }
  useEffect(() => {
    if (!closing || disabled || !collapsed) return;
    // Give the pointer time to cross the small trigger/panel and portalled-menu gaps.
    const timer = setTimeout(() => {
      setClosing(false);
      const overPanel = pointer.current.panel && hoveredPanelNode.current instanceof Node && hoveredPanelNode.current.isConnected;
      if (!pointer.current.trigger && !overPanel && !focused.current) setOpen(false);
    }, motionTokens.duration.fast * 1000);
    return () => clearTimeout(timer);
  }, [closing, disabled, collapsed]);
  function enterTrigger(event: PointerEvent<HTMLButtonElement>) {
    if (!collapsed || disabled || event.pointerType === "touch") return;
    cancelClose();
    rememberTrigger(event.currentTarget);
    pointer.current.trigger = true;
    setOpen(true);
  }
  if (!collapsed && (open || closing)) { setOpen(false); setClosing(false); }
  const escape = useEffectEvent((event: KeyboardEvent) => {
    if (!open || !collapsed || disabled || event.key !== "Escape" || event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    // The innermost menu/dialog gets the first Escape, including portalled branches.
    if (target?.closest('[role="menu"], [role="dialog"]')) return;
    event.preventDefault();
    dismiss(true);
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => escape(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return { peeking: collapsed && open, peekTop: top, dismiss, show,
    triggerEvents: {
      onPointerEnter: enterTrigger,
      onPointerLeave: () => { pointer.current.trigger = false; scheduleClose(); },
    },
    panelEvents: {
      onPointerOverCapture: (event: PointerEvent<HTMLElement>) => { hoveredPanelNode.current = event.target; },
      onPointerEnter: () => { pointer.current.panel = true; cancelClose(); },
      onPointerLeave: () => { pointer.current.panel = false; scheduleClose(); },
      // React events also cross portals, so account/context menus and notifications
      // remain part of this interaction without querying unrelated document layers.
      onFocusCapture: () => { focused.current = true; cancelClose(); },
      onBlurCapture: () => { focused.current = false; scheduleClose(); },
    },
  };
}
