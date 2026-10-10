import type { Preview } from "@storybook/nextjs-vite"
import { useLayoutEffect, type ReactNode } from "react"
import { fontVariables } from "../src/lib/fonts"
import { ThemeProvider } from "../src/components/theme-provider"
import { ToastStackProvider } from "../src/components/arc/toast-stack/toast-stack"
import { sb } from "storybook/test"
import "../src/components/arc/foundation.css"
import "../src/app/globals.css"
import "../src/styles/lane-primitives.css"
import "../src/styles/lane-arc-theme.css"

// Preview real forms while keeping all database, AI and storage effects outside Storybook.
sb.mock(import("../src/app/(app)/intake/actions.ts"))
sb.mock(import("../src/app/(app)/intake/project-actions.ts"))
sb.mock(import("../src/app/(app)/intake/attachment-actions.ts"))
sb.mock(import("../src/app/(app)/requests/[id]/actions.ts"))
sb.mock(import("../src/app/(app)/notifications/actions.ts"))

// Keep root styling with the mounted preview, including hot reloads and portals.
// Story-test cleanup can run while the preview remains visible.
// Every story renders in Lane's visual system, matching the production root in
// src/app/layout.tsx. parameters.visualSystem: "arc" is the opt-out for the one Arc
// reference story (Primitives/Controls). The Geist preview was retired on 2026-10-10
// (decision 8.12); data-color-system is still cleared in case a host set it.
const ROOT_ATTRIBUTES = ["data-visual-system", "data-ui-state-contract", "data-color-system"] as const
function PreviewRoot({ visualSystem = "lane", children }: { visualSystem?: string; children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement
    const classes = fontVariables.split(" ").filter(name => !root.classList.contains(name))
    const previous = ROOT_ATTRIBUTES.map(name => [name, root.getAttribute(name)] as const)
    root.classList.add(...classes)
    for (const name of ROOT_ATTRIBUTES) root.removeAttribute(name)
    if (visualSystem !== "arc") {
      root.setAttribute("data-visual-system", "lane")
      root.setAttribute("data-ui-state-contract", "semantic")
    }
    return () => {
      root.classList.remove(...classes)
      for (const [name, value] of previous) {
        if (value === null) root.removeAttribute(name)
        else root.setAttribute(name, value)
      }
    }
  }, [visualSystem])
  return children
}

// Settle the page before @storybook/addon-a11y runs axe. Storybook awaits project
// afterEach hooks in reverse order, so this one runs first. In the Vitest run it has
// already paused CSS animations at their end frame, but motion's WAAPI and JS exits
// (data-motion-pop-id) still finish on their own, and Radix presence unmounts closed
// overlays only after the cancelled animation's event fires. Without this wait, axe
// reads a button label mid-transform or the composer's leftover aria-hidden on <main>.
const SETTLE_TIMEOUT_MS = 1500
const CLOSING_OVERLAY = '[data-state="closed"]:is([role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"])'
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const isFiniteAnimation = (animation: Animation) => animation.effect?.getTiming().iterations !== Infinity
async function settleBeforeAxe() {
  const deadline = performance.now() + SETTLE_TIMEOUT_MS
  await nextFrame()
  while (performance.now() < deadline) {
    const running = document.getAnimations().filter(animation => animation.playState === "running" && isFiniteAnimation(animation))
    if (running.length === 0 && !document.querySelector("[data-motion-pop-id]") && !document.querySelector(CLOSING_OVERLAY)) return
    const pause = new Promise<void>(resolve => setTimeout(resolve, Math.max(0, Math.min(50, deadline - performance.now()))))
    await Promise.race([Promise.allSettled(running.map(animation => animation.finished)), pause])
    await nextFrame()
  }
}

const preview: Preview = {
  tags: ["autodocs"],
  globalTypes: {
    theme: {
      description: "Lane theme",
      toolbar: { icon: "circlehollow", items: ["light", "dark"], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: process.env.STORYBOOK_THEME ?? "light" },
  beforeEach: ({ canvasElement }) => {
    canvasElement.removeAttribute("data-story-ready")
  },
  afterEach: async ({ canvasElement }) => {
    await document.fonts.ready
    await settleBeforeAxe()
    canvasElement.setAttribute("data-story-ready", "true")
  },
  parameters: {
    nextjs: { appDirectory: true },
    layout: "padded",
    a11y: { test: "error" },
    viewport: {
      // The Storybook Vitest addon reapplies this viewport for every story;
      // vitest.browser.viewport alone is overridden by its desktop default.
      defaultViewport: "verification",
      options: {
        verification: { name: "Configured test width", styles: { width: `${process.env.STORYBOOK_WIDTH ?? "1440"}px`, height: "1000px" } },
        mobile: { name: "Phone · 390px", styles: { width: "390px", height: "844px" } },
        tablet: { name: "Tablet · 768px", styles: { width: "768px", height: "1024px" } },
        desktop: { name: "Desktop · 1440px", styles: { width: "1440px", height: "1000px" } },
      },
    },
  },
  decorators: [(Story, context) => (
    <PreviewRoot visualSystem={context.parameters.visualSystem}>
    <ThemeProvider
      key={context.parameters.browserTheme ? "browser-theme" : "forced-theme"}
      attribute={["class", "data-theme"]}
      forcedTheme={context.parameters.browserTheme ? undefined : context.globals.theme ?? "light"}
      enableSystem={Boolean(context.parameters.browserTheme)}
      defaultTheme="system"
      storageKey="lane-storybook-theme"
      disableTransitionOnChange
    >
      <div className={`${fontVariables} font-sans text-type-ui text-foreground`}>
        {/* Request rows and bulk actions need the toast context. Stories that show
            toasts mount their own ToastStack; a second stack here would duplicate
            the landmark. */}
        <ToastStackProvider><Story /></ToastStackProvider>
      </div>
    </ThemeProvider>
    </PreviewRoot>
  )],
}
export default preview
