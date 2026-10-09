import type { Preview } from "@storybook/nextjs-vite"
import { useLayoutEffect, type ReactNode } from "react"
import { fontVariables } from "../src/lib/fonts"
import { ThemeProvider } from "../src/components/theme-provider"
import { sb } from "storybook/test"
import "../src/components/arc/foundation.css"
import "../src/app/globals.css"
import "../src/styles/geist-colors.css"
import "../src/styles/linear-primitives.css"
import "../src/styles/linear-arc-theme.css"

// Preview real forms while keeping all database, AI and storage effects outside Storybook.
sb.mock(import("../src/app/(app)/intake/actions.ts"))
sb.mock(import("../src/app/(app)/intake/project-actions.ts"))
sb.mock(import("../src/app/(app)/intake/attachment-actions.ts"))
sb.mock(import("../src/app/(app)/requests/[id]/actions.ts"))
sb.mock(import("../src/app/(app)/notifications/actions.ts"))

// Keep root styling with the mounted preview, including hot reloads and portals.
// Story-test cleanup can run while the preview remains visible.
function PreviewRoot({ colorSystem, visualSystem, children }: { colorSystem?: string; visualSystem?: string; children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement
    const classes = fontVariables.split(" ").filter(name => !root.classList.contains(name))
    const previousAccent = root.getAttribute("data-accent")
    const previousSystem = root.getAttribute("data-color-system")
    const previousVisual = root.getAttribute("data-visual-system")
    const previousStates = root.getAttribute("data-ui-state-contract")
    root.classList.add(...classes)
    root.removeAttribute("data-visual-system")
    root.removeAttribute("data-ui-state-contract")
    if (visualSystem === "linear") {
      root.removeAttribute("data-accent")
      root.removeAttribute("data-color-system")
      root.setAttribute("data-visual-system", "linear")
      root.setAttribute("data-ui-state-contract", "semantic")
    } else if (colorSystem === "geist") {
      root.removeAttribute("data-accent")
      root.setAttribute("data-color-system", "geist")
      root.setAttribute("data-ui-state-contract", "semantic")
    } else {
      root.setAttribute("data-accent", "green")
      root.removeAttribute("data-color-system")
    }
    return () => {
      root.classList.remove(...classes)
      if (previousAccent === null) root.removeAttribute("data-accent")
      else root.setAttribute("data-accent", previousAccent)
      if (previousSystem === null) root.removeAttribute("data-color-system")
      else root.setAttribute("data-color-system", previousSystem)
      if (previousVisual === null) root.removeAttribute("data-visual-system")
      else root.setAttribute("data-visual-system", previousVisual)
      if (previousStates === null) root.removeAttribute("data-ui-state-contract")
      else root.setAttribute("data-ui-state-contract", previousStates)
    }
  }, [colorSystem, visualSystem])
  return children
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
    <PreviewRoot colorSystem={context.parameters.colorSystem} visualSystem={context.parameters.visualSystem}>
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
        <Story />
      </div>
    </ThemeProvider>
    </PreviewRoot>
  )],
}
export default preview
