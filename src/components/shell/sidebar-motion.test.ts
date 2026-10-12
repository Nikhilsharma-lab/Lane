import { describe, expect, it } from "vitest"
import { layoutWidthFor, planToggle, slideFor } from "./sidebar-motion"

describe("sidebar motion", () => {
  it("collapses the layout at the start of a collapse", () => {
    const plan = planToggle({ collapsed: false, motion: null, reduced: false })
    expect(plan).toEqual({ motion: "collapsing", slide: "start" })
    // The toggle sets the width to 0 with the motion, so the content widens once, at once.
    expect(layoutWidthFor({ width: 0, autoCollapsed: false, motion: plan.motion })).toBe(0)
  })
  it("widens the layout only at the end of an expand", () => {
    const plan = planToggle({ collapsed: true, motion: null, reduced: false })
    expect(plan).toEqual({ motion: "expanding", slide: "start" })
    expect(layoutWidthFor({ width: 272, autoCollapsed: false, motion: plan.motion })).toBe(0)
    expect(layoutWidthFor({ width: 272, autoCollapsed: false, motion: null })).toBe(272)
  })
  it("turns a slide around instead of restarting it", () => {
    expect(planToggle({ collapsed: true, motion: "collapsing", reduced: false })).toEqual({ motion: "expanding", slide: "reverse" })
    expect(planToggle({ collapsed: false, motion: "expanding", reduced: false })).toEqual({ motion: "collapsing", slide: "reverse" })
  })
  it("leaves a running slide alone when the same toggle comes again", () => {
    expect(planToggle({ collapsed: true, motion: "expanding", reduced: false })).toEqual({ motion: "expanding", slide: "keep" })
    expect(planToggle({ collapsed: false, motion: "collapsing", reduced: false })).toEqual({ motion: "collapsing", slide: "keep" })
  })
  it("jumps for reduced motion, a drag and a pinned peek", () => {
    expect(planToggle({ collapsed: false, motion: null, reduced: true })).toEqual({ motion: null, slide: "none" })
    expect(planToggle({ collapsed: true, motion: null, reduced: true })).toEqual({ motion: null, slide: "none" })
    expect(planToggle({ collapsed: false, motion: null, reduced: false, dragging: true })).toEqual({ motion: null, slide: "none" })
    expect(planToggle({ collapsed: true, motion: null, reduced: false, fromPeek: true })).toEqual({ motion: null, slide: "none" })
  })
  it("keeps an automatic collapse at zero", () => {
    expect(layoutWidthFor({ width: 254, autoCollapsed: true, motion: null })).toBe(0)
  })
  it("slides on transform only, 180 ms out and 240 ms in", () => {
    const out = slideFor("collapsing", 272)
    expect(out.keyframes).toEqual([{ transform: "translateX(0)" }, { transform: "translateX(-280px)" }])
    expect(out.options.duration).toBe(180)
    const back = slideFor("expanding", 272)
    expect(back.keyframes).toEqual([{ transform: "translateX(-280px)" }, { transform: "translateX(0)" }])
    expect(back.options.duration).toBe(240)
    expect(back.options.easing).toBe("cubic-bezier(0.16, 1, 0.3, 1)")
  })
})
