"use client";

import { createPortal } from "react-dom";
import { Fragment, cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, HTMLAttributes, KeyboardEvent, MouseEvent, ReactElement, ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { motionTokens } from "../lib/motion-tokens";
import styles from "./context-menu.module.css";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  checked?: boolean;
  /** Optional nested choices; leaf actions retain the original API. */
  children?: ContextMenuItem[];
  separatorBefore?: boolean;
  /** Display hint only. Applications own shortcut registration. */
  shortcut?: string;
  /** Keep the menu open for an action that confirms its result in place. */
  closeOnSelect?: boolean;
}

export interface ContextMenuProps {
  children: ReactNode;
  items: ContextMenuItem[];
  label?: string;
  /** Lane integration: keep the existing link as the sole focusable trigger. */
  asChild?: boolean;
  openOnClick?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type Highlight = { index: number; top: number; height: number; danger: boolean; glide: boolean };

const MENU_WIDTH = 208;

// Keeps the menu 8px inside the viewport. Rows are 34px with 5px padding and a 1px border; the real size is measured before paint.
function clampTo(x: number, y: number, width: number, height: number) {
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));
  // The menu grows from the pointer, even when it is clamped away from a viewport edge.
  return { x: left, y: top, originX: Math.max(0, Math.min(width, x - left)), originY: Math.max(0, Math.min(height, y - top)) };
}

type PanelPoint = { x: number; y: number; originX: number; originY: number };
type SubmenuAnchor = { trigger: HTMLButtonElement; parent: HTMLDivElement; label: string };

/** Each depth keeps Arc's single moving highlight and pointer-origin panel motion. */
function MenuPanel({ id, treeId, label, items, point, panelRef, reduced, isLive, onClose, anchor, onBack, onOverlap, focusFirst = true, focusRequest = 0 }: {
  id: string; treeId: string; label: string; items: ContextMenuItem[]; point: PanelPoint;
  panelRef?: { current: HTMLDivElement | null }; reduced: boolean; isLive: () => boolean; onClose: () => void;
  anchor?: SubmenuAnchor; onBack?: () => void; onOverlap?: (overlap: boolean) => void; focusFirst?: boolean; focusRequest?: number;
}) {
  const present = useIsPresent();
  const localRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<PanelPoint & { overlap: boolean }>({ ...point, overlap: false });
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [child, setChild] = useState<{ id: string; anchor: SubmenuAnchor; focus: boolean; focusRequest: number } | null>(null);
  const childVersion = useRef(0);
  const [childOverlaps, setChildOverlaps] = useState(false);
  const pointer = useRef(false);
  const clearTimer = useRef(0);
  const hoverTimer = useRef(0);
  const submenuId = useId();
  const openedItem = child ? items.find(item => item.id === child.id && !item.disabled && item.children?.length) : undefined;
  const hiddenByChild = Boolean(openedItem && childOverlaps);

  useLayoutEffect(() => {
    const panel = localRef.current;
    if (!panel || !anchor) return;
    const target = anchor.trigger.getBoundingClientRect();
    const parent = anchor.parent.getBoundingClientRect();
    const width = panel.offsetWidth;
    const right = parent.right - 4;
    const left = parent.left - width + 4;
    const fitsRight = right + width <= window.innerWidth - 8;
    const fitsLeft = left >= 8;
    const overlap = !fitsRight && !fitsLeft;
    const next = clampTo(fitsRight ? right : fitsLeft ? left : parent.left, overlap ? parent.top : target.top - 5, width, panel.offsetHeight);
    setPlacement(previous => previous.x === next.x && previous.y === next.y && previous.overlap === overlap ? previous : { ...next, overlap });
    onOverlap?.(overlap);
  }, [anchor, items.length, placement.overlap, onOverlap]);
  useEffect(() => {
    if (present && (focusFirst || placement.overlap)) localRef.current?.querySelector<HTMLElement>('[data-index]:not([data-index="-1"]):not(:disabled)')?.focus({ preventScroll: true });
  }, [focusFirst, focusRequest, placement.overlap, present]);
  useEffect(() => () => { window.clearTimeout(clearTimer.current); window.clearTimeout(hoverTimer.current); }, []);

  function closeChild() {
    window.clearTimeout(hoverTimer.current);
    const trigger = child?.anchor.trigger;
    setChild(null);
    setChildOverlaps(false);
    requestAnimationFrame(() => { if (isLive() && trigger?.isConnected) trigger.focus({ preventScroll: true }); });
  }
  function openChild(item: ContextMenuItem, trigger: HTMLButtonElement, focus: boolean) {
    window.clearTimeout(hoverTimer.current);
    if (!present || !isLive() || item.disabled || !item.children?.length || !localRef.current) return;
    if (child?.id === item.id) {
      if (focus) document.getElementById(submenuId)?.querySelector<HTMLElement>('[data-index]:not(:disabled)')?.focus({ preventScroll: true });
      return;
    }
    setChildOverlaps(false);
    setChild({ id: item.id, anchor: { trigger, parent: localRef.current, label }, focus, focusRequest: ++childVersion.current });
  }
  function place(item: HTMLElement, glide: boolean) {
    window.clearTimeout(clearTimer.current);
    const next = { index: Number(item.dataset.index), top: item.offsetTop, height: item.offsetHeight, danger: item.dataset.tone === "danger" };
    setHighlight(current => ({ ...next, glide: glide && current !== null }));
  }
  function onFocus(event: FocusEvent<HTMLDivElement>) {
    const item = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-index]') : null;
    if (item && !pointer.current && item.matches(":focus-visible")) place(item, false);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!present || !isLive()) return;
    // A portalled inner menu still bubbles through its owning Request row in
    // React. Context-menu commands belong to this open menu, not that row.
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault(); event.stopPropagation(); return;
    }
    const enabled = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-index]:not(:disabled)'));
    const current = enabled.findIndex(item => item === document.activeElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (current + 1) % enabled.length;
    if (event.key === "ArrowUp") next = current < 0 ? enabled.length - 1 : (current - 1 + enabled.length) % enabled.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = enabled.length - 1;
    if (next !== undefined && enabled.length) {
      event.preventDefault(); event.stopPropagation();
      setChild(null); setChildOverlaps(false);
      enabled[next]?.focus({ preventScroll: true });
    }
    if (event.key === "ArrowRight") {
      const trigger = document.activeElement as HTMLButtonElement | null;
      const item = trigger ? items[Number(trigger.dataset.index)] : undefined;
      if (item?.children?.length && trigger) { event.preventDefault(); event.stopPropagation(); openChild(item, trigger, true); }
    }
    if (event.key === "ArrowLeft" && onBack) { event.preventDefault(); event.stopPropagation(); onBack(); }
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Escape" && onBack) onBack(); else onClose();
    }
  }
  const activePoint = anchor ? placement : point;
  return <>
    <motion.div id={id} ref={node => { localRef.current = node; if (panelRef) panelRef.current = node; }}
      data-context-tree={treeId} data-ui-surface="floating" data-submenu={anchor ? "" : undefined}
      className={styles.menu} role="menu" aria-label={label} tabIndex={-1} inert={hiddenByChild || undefined}
      style={{ left: activePoint.x, top: activePoint.y, transformOrigin: `${activePoint.originX}px ${activePoint.originY}px`, visibility: hiddenByChild ? "hidden" : undefined }}
      onKeyDown={onKeyDown} onFocus={onFocus} onPointerMoveCapture={() => { pointer.current = true; }} onKeyDownCapture={() => { pointer.current = false; window.clearTimeout(hoverTimer.current); }}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onPointerLeave={event => { window.clearTimeout(hoverTimer.current); if (isLive() && !openedItem) { event.currentTarget.focus({ preventScroll: true }); clearTimer.current = window.setTimeout(() => setHighlight(null), 70); } }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }}
      exit={reduced ? { opacity: 0, transition: { duration: motionTokens.duration.instant } } : { opacity: 0, scale: .98, transition: { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] } }}
      transition={reduced ? { duration: motionTokens.duration.instant } : { default: motionTokens.spring.snappy, opacity: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.enter] } }}>
      <motion.span className={styles.highlight} data-tone={highlight?.danger ? "danger" : undefined} aria-hidden="true" initial={false}
        animate={highlight ? { y: highlight.top, height: highlight.height, opacity: 1 } : { opacity: 0 }}
        transition={{ default: highlight?.glide && !reduced ? motionTokens.spring.snappy : { duration: 0 }, opacity: { duration: reduced ? 0 : motionTokens.duration.instant } }} />
      {anchor && placement.overlap && <><button type="button" role="menuitem" tabIndex={-1} data-index={-1} className={styles.item} onClick={onBack} aria-label={`Back to ${anchor.label}`}>
        <ChevronLeft size={15} aria-hidden="true" /><span className={styles.label}>Back</span>
      </button><div className={styles.separator} role="separator" /></>}
      {items.map((item, index) => <Fragment key={item.id}>
        {item.separatorBefore && index > 0 && <div className={styles.separator} role="separator" />}
        <button type="button" role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={item.checked}
          aria-haspopup={item.children?.length ? "menu" : undefined} aria-expanded={item.children?.length ? openedItem?.id === item.id : undefined}
          aria-controls={openedItem?.id === item.id ? submenuId : undefined}
          tabIndex={-1} data-index={index} data-tone={item.destructive ? "danger" : undefined} data-submenu-open={openedItem?.id === item.id || undefined}
          style={{ "--i": index } as CSSProperties} disabled={item.disabled}
          className={[styles.item, item.destructive ? styles.destructive : ""].filter(Boolean).join(" ")}
          onPointerMove={event => {
            if (!present || !isLive()) return;
            window.clearTimeout(clearTimer.current);
            const trigger = event.currentTarget;
            if (document.activeElement !== trigger) trigger.focus({ preventScroll: true });
            if (highlight?.index !== index) place(trigger, true);
            if (openedItem?.id === item.id) return;
            window.clearTimeout(hoverTimer.current);
            hoverTimer.current = window.setTimeout(() => {
              if (item.children?.length) openChild(item, trigger, false);
              else { setChild(null); setChildOverlaps(false); }
            }, 100);
          }}
          onPointerLeave={() => { window.clearTimeout(hoverTimer.current); }}
          onClick={event => {
            if (!present || !isLive()) return;
            if (item.children?.length) { openChild(item, event.currentTarget, true); return; }
            if (item.closeOnSelect !== false) onClose();
            item.onSelect?.();
          }}>
          <span className={styles.icon} aria-hidden="true">{item.icon ?? (item.checked ? <Check size={15} /> : <MoreHorizontal size={15} />)}</span>
          <span className={styles.label}>{item.label}</span>
          {item.checked && item.icon && <Check className={styles.check} size={14} aria-hidden="true" />}
          {item.shortcut && <kbd className={styles.shortcut} aria-hidden="true">{item.shortcut}</kbd>}
          {!!item.children?.length && <ChevronRight className={styles.chevron} size={14} aria-hidden="true" />}
        </button>
      </Fragment>)}
    </motion.div>
    <AnimatePresence>
      {openedItem && child && <MenuPanel key={openedItem.id} id={submenuId} treeId={treeId} label={openedItem.label} items={openedItem.children!}
        point={point} anchor={child.anchor} focusFirst={child.focus} focusRequest={child.focusRequest} reduced={reduced} isLive={isLive} onClose={onClose} onBack={closeChild} onOverlap={setChildOverlaps} />}
    </AnimatePresence>
  </>;
}

export function ContextMenu({ children, items, label = "Context menu", asChild = false, openOnClick = true, onOpenChange }: ContextMenuProps) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  // The portal mounts on first open (client only) and stays so the menu can animate out.
  const [portal, setPortal] = useState(false);
  // Each open gets its own key, so reopening at a new point fades the old menu out in place
  // and grows a fresh one from the pointer instead of teleporting the visible menu.
  const [point, setPoint] = useState({ x: 0, y: 0, originX: 0, originY: 0, key: 0 });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const menuId = useId();
  const openChange = useRef(onOpenChange);
  // A primary press on the target while the menu is open closes it; the click that follows must not reopen it.
  const pressedWhileOpen = useRef(false);
  // An exiting menu keeps its last props, so its handlers check this before moving focus or selecting.
  const live = useRef(false);

  const anchor = useRef({ x: 0, y: 0 });

  useLayoutEffect(() => { openChange.current = onOpenChange; }, [onOpenChange]);
  const changeOpen = useCallback((next: boolean) => {
    if (live.current === next) return;
    live.current = next;
    setOpen(next);
    openChange.current?.(next);
  }, []);
  const closeMenu = useCallback((restoreFocus = false) => {
    changeOpen(false);
    const target = targetRef.current;
    if (restoreFocus && target?.isConnected && target.getClientRects().length && !target.closest("[inert], [hidden]") && getComputedStyle(target).visibility === "visible") target.focus({ preventScroll: true });
  }, [changeOpen]);
  useEffect(() => () => { if (live.current) openChange.current?.(false); }, []);
  // Re-clamp against the menu's real size before the first frame, so long labels or many rows never overflow the viewport.
  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!open || !node) return;
    const next = clampTo(anchor.current.x, anchor.current.y, node.offsetWidth, node.offsetHeight);
    setPoint(current => (current.x === next.x && current.y === next.y && current.originX === next.originX && current.originY === next.originY ? current : { ...next, key: current.key }));
  }, [open, point.key]);
  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (event.target instanceof Element && event.target.closest(`[data-context-tree="${CSS.escape(menuId)}"]`)) return;
      closeMenu();
      // Let the outside press focus its own link/button first. A non-focusable
      // backdrop leaves focus on the exiting menu or body, so restore its link.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!live.current && (active === document.body || (active && menu?.contains(active)))) closeMenu(true);
      });
    };
    const closeOnViewportChange = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(`[data-context-tree="${CSS.escape(menuId)}"]`)) return;
      closeMenu(true);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("resize", closeOnViewportChange);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [open, point.key, closeMenu, menuId]);

  function showMenu(x: number, y: number) {
    anchor.current = { x, y };
    const estimate = clampTo(x, y, MENU_WIDTH, Math.min(300, items.length * 34 + 12));
    setPoint(current => ({ ...estimate, key: current.key + 1 }));
    setPortal(true);
    changeOpen(true);
  }

  function rememberTarget(container: HTMLElement, target: EventTarget | null) {
    const selector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]';
    const original = target instanceof Element ? target.closest<HTMLElement>(selector) : null;
    targetRef.current = original && container.contains(original) ? original : container.matches(selector) ? container : container.querySelector<HTMLElement>(selector) ?? container;
  }

  function onTargetKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      rememberTarget(event.currentTarget, event.target);
      event.preventDefault();
      event.stopPropagation();
      const rect = targetRef.current?.getBoundingClientRect();
      if (rect) showMenu(rect.left + 12, rect.bottom + 8);
    }
  }

  function onTargetClick(event: MouseEvent<HTMLElement>) {
    rememberTarget(event.currentTarget, event.target);
    if (pressedWhileOpen.current) { pressedWhileOpen.current = false; return; }
    const rect = targetRef.current?.getBoundingClientRect();
    if (rect) showMenu(rect.left + 12, rect.bottom + 8);
  }

  const child = asChild && isValidElement(children) ? children as ReactElement<HTMLAttributes<HTMLElement>> : null;
  // A Request row keeps its listitem role. Only trigger roles that support an
  // expanded state receive aria-expanded; haspopup/controls are global states.
  const exposesExpanded = Boolean(child && (child.type === "button" || child.type === "a"
    || typeof (child.props as { href?: unknown }).href === "string"
    || ["button", "link", "menuitem", "treeitem", "row", "combobox"].includes(child.props.role ?? "")));
  const targetProps: HTMLAttributes<HTMLElement> = {
    onPointerDown: event => { pressedWhileOpen.current = open && event.button === 0; },
    onClick: openOnClick ? onTargetClick : undefined,
    onContextMenu: event => { event.preventDefault(); event.stopPropagation(); rememberTarget(event.currentTarget, event.target); showMenu(event.clientX, event.clientY); },
    onKeyDown: onTargetKeyDown,
    "aria-haspopup": "menu", "aria-expanded": exposesExpanded ? open : undefined, "aria-controls": open ? menuId : undefined,
  };
  // cloneElement attaches these handlers; targetRef is accessed only when an event runs.
  // eslint-disable-next-line react-hooks/refs
  const target = child ? cloneElement(child, {
    ...targetProps,
    onPointerDown: event => { child.props.onPointerDown?.(event); if (!event.defaultPrevented) targetProps.onPointerDown?.(event); },
    onClick: event => { child.props.onClick?.(event); if (!event.defaultPrevented) targetProps.onClick?.(event); },
    onContextMenu: event => { child.props.onContextMenu?.(event); if (!event.defaultPrevented) targetProps.onContextMenu?.(event); },
    onKeyDown: event => { child.props.onKeyDown?.(event); if (!event.defaultPrevented) targetProps.onKeyDown?.(event); },
  }) : <div {...targetProps} ref={node => { targetRef.current = node; }} className={styles.target} tabIndex={0} aria-label={label}>{children}</div>;

  return <>
    {target}
    {portal ? createPortal(<AnimatePresence>
      {open && <MenuPanel key={point.key} id={menuId} treeId={menuId} label={label} items={items}
        point={point} panelRef={menuRef} reduced={!!reduced} isLive={() => live.current}
        onClose={() => closeMenu(true)} />}
    </AnimatePresence>, document.body) : null}
  </>;
}

export const contextMenuExampleItems: ContextMenuItem[] = [
  { id: "copy", label: "Copy link", icon: <Copy size={15} /> },
  { id: "delete", label: "Delete project", icon: <Trash2 size={15} />, destructive: true },
];

export default ContextMenu;
