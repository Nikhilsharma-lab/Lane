import { motionTokens } from "@/components/arc/lib/motion-tokens"

/**
 * Plan item 2.4 (plan §2.3, motion rules): the sidebar panel translates and
 * the content's width changes once per toggle, at the start of a collapse and
 * at the end of an expand. Pure, so the order is unit tested.
 */
export type SidebarMotion = "collapsing" | "expanding" | null

/** The width the shell lays the content out with. While the panel slides in, the content keeps its width. */
export function layoutWidthFor({ width, autoCollapsed, motion }: { width: number; autoCollapsed: boolean; motion: SidebarMotion }) {
  if (autoCollapsed || motion === "expanding") return 0
  return width
}

export type TogglePlan = {
  /** The motion state after the toggle. */
  motion: SidebarMotion
  /** Start a slide, turn the running one around, or jump straight to the new width. */
  slide: "start" | "reverse" | "none"
}

/**
 * What a toggle does. `collapsed` is the target state before the toggle (a
 * collapse in flight already targets collapsed). A toggle during a slide turns
 * it around rather than restarting from an edge. Reduced motion, a drag, and
 * pinning a visible peek jump.
 */
export function planToggle({ collapsed, motion, reduced, fromPeek = false, dragging = false }: { collapsed: boolean; motion: SidebarMotion; reduced: boolean; fromPeek?: boolean; dragging?: boolean }): TogglePlan {
  const next = collapsed ? "expanding" : "collapsing"
  if (motion && motion !== next) return { motion: next, slide: "reverse" }
  if (reduced || dragging || (collapsed && fromPeek)) return { motion: null, slide: "none" }
  return { motion: next, slide: "start" }
}

/** The panel's slide: from docked to past the shell's 8px gutter, or back. Transform only. */
export function slideFor(direction: "collapsing" | "expanding", panelWidth: number) {
  const docked = { transform: "translateX(0)" }
  const away = { transform: `translateX(-${panelWidth + 8}px)` }
  const ease = direction === "collapsing" ? motionTokens.ease.exit : motionTokens.ease.enter
  return {
    keyframes: direction === "collapsing" ? [docked, away] : [away, docked],
    options: {
      duration: (direction === "collapsing" ? motionTokens.duration.exit : motionTokens.duration.standard) * 1000,
      easing: `cubic-bezier(${ease.join(", ")})`,
    },
  }
}
