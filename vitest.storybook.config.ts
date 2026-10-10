import { defineConfig } from "vitest/config"
import { playwright } from "@vitest/browser-playwright"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { fileURLToPath } from "node:url"

// Deliberately independent of vitest.config.ts: no env loading, DB resets or Clerk users.
export default defineConfig({
  envDir: ".storybook",
  define: { "process.env.STORYBOOK_THEME": JSON.stringify(process.env.STORYBOOK_THEME ?? "light"), "process.env.STORYBOOK_WIDTH": JSON.stringify(process.env.STORYBOOK_WIDTH ?? "1440") },
  plugins: [storybookTest({ configDir: fileURLToPath(new URL("./.storybook", import.meta.url)) })],
  optimizeDeps: { include: ["react-dom/server", "next/dynamic", "react-hook-form", "@hookform/resolvers/zod", "motion/react", "@radix-ui/react-checkbox", "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-popover", "@radix-ui/react-select", "@radix-ui/react-tooltip"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    name: "storybook",
    browser: {
      enabled: true,
      headless: true,
      // CI runners: a small /dev/shm and a GPU process that can take the renderer down with it. Both flags
      // keep headless Chromium alive for a whole shard ("Browser connection was closed while running tests").
      provider: playwright({ launchOptions: { args: ["--disable-dev-shm-usage", "--disable-gpu"] }, contextOptions: { reducedMotion: process.env.STORYBOOK_REDUCED_MOTION === "reduce" ? "reduce" : "no-preference" } }),
      instances: [{ browser: "chromium" }],
      viewport: { width: Number(process.env.STORYBOOK_WIDTH ?? 1440), height: 1000 },
    },
  },
})
