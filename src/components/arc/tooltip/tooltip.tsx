"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../lib/motion-tokens";
import styles from "./tooltip.module.css";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom";
}

const DELAY = 250;
const SKIP_WINDOW = 300;

/* Lane adaptation (plan item 1.14): upstream shares warmth through a store every Tooltip subscribes to, so hundreds of row tooltips re-render whenever any tooltip opens or cools. Warmth is now a module-level value that is only read when a tooltip wants to open; nothing subscribes and nothing re-renders when it changes. Each Tooltip runs Arc's 250 ms delay itself (Radix opens at once), skipping it while another tooltip is open or closed less than 300 ms ago. */
let openCount = 0;
let warmUntil = 0;
const warmth = {
  get: () => openCount > 0 || performance.now() < warmUntil,
  opened() { openCount += 1; warmUntil = 0; },
  closed() { openCount = Math.max(0, openCount - 1); if (!openCount) warmUntil = performance.now() + SKIP_WINDOW; },
};

const SharedProvider = createContext(false);

/** Optional: one Radix provider for every Tooltip beneath it, instead of one per Tooltip. Behaviour is the same either way. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <SharedProvider.Provider value={true}>
    <TooltipPrimitive.Provider delayDuration={0} skipDelayDuration={0}>{children}</TooltipPrimitive.Provider>
  </SharedProvider.Provider>;
}

/** String content crossfades when it changes while open, and the bubble springs to the new text size. */
function TooltipText({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const measure = useRef<HTMLSpanElement>(null);
  const measured = useRef<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number; animate: boolean } | null>(null);
  useLayoutEffect(() => {
    const node = measure.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      const current = node.textContent;
      const animate = measured.current !== null && measured.current !== current;
      measured.current = current;
      setSize({ width: Math.ceil(box?.inlineSize ?? node.offsetWidth), height: Math.ceil(box?.blockSize ?? node.offsetHeight), animate });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <motion.span className={styles.text} initial={false} animate={size ? { width: size.width, height: size.height } : undefined} transition={size?.animate && !reduced ? motionTokens.spring.morph : { duration: 0 }}>
    <span ref={measure} className={styles.measure} aria-hidden="true">{text}</span>
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={text} className={styles.line} initial={reduced ? false : { opacity: 0, y: "0.3em", filter: `blur(${motionTokens.blur.soft}px)` }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: "-0.3em", filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] } }} transition={{ duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}>{text}</motion.span>
    </AnimatePresence>
  </motion.span>;
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const shared = useContext(SharedProvider);
  // Controlled so the instant flag lands in the same render that mounts the content (Radix reports uncontrolled changes a frame late).
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const delay = useRef(0);
  const focused = useRef(false);
  useEffect(() => {
    if (!open) return;
    warmth.opened();
    return warmth.closed;
  }, [open]);
  const cancel = () => window.clearTimeout(delay.current);
  useEffect(() => cancel, []);
  // Radix asks to open at once (its delay is 0). Focus opens at once, as upstream; a warm hover opens at once without travel; a cold hover waits Arc's delay. Radix does not report a close while the delayed open is still pending, so the trigger cancels it on leave, press and blur.
  const onOpenChange = (next: boolean) => {
    cancel();
    if (!next) { setOpen(false); return; }
    if (focused.current || warmth.get()) { setInstant(warmth.get()); setOpen(true); return; }
    delay.current = window.setTimeout(() => { setInstant(false); setOpen(true); }, DELAY);
  };
  const root = <TooltipPrimitive.Root open={open} delayDuration={0} onOpenChange={onOpenChange}>
    <TooltipPrimitive.Trigger asChild onPointerLeave={cancel} onPointerDown={cancel} onBlur={cancel}
      onFocus={() => { focused.current = true; queueMicrotask(() => { focused.current = false; }); }}>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content className={styles.tooltip} data-instant={instant || undefined} side={side} sideOffset={8} collisionPadding={12}>
        {typeof content === "string" || typeof content === "number" ? <TooltipText text={String(content)}/> : content}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>;
  if (shared) return root;
  return <TooltipPrimitive.Provider delayDuration={0} skipDelayDuration={0}>{root}</TooltipPrimitive.Provider>;
}

export default Tooltip;
