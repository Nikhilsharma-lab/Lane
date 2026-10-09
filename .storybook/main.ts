import type { StorybookConfig } from "@storybook/nextjs-vite"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

const config: StorybookConfig = {
  stories: ["../src/stories/**/*.stories.tsx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: { nextConfigPath: ".storybook/next.config.ts" },
  },
  core: { disableTelemetry: true },
  viteFinal: async (config) => {
    config.envDir = fileURLToPath(new URL(".", import.meta.url))
    config.define = { ...config.define, "process.env.STORYBOOK_THEME": JSON.stringify(process.env.STORYBOOK_THEME ?? "light"), "process.env.STORYBOOK_WIDTH": JSON.stringify(process.env.STORYBOOK_WIDTH ?? "1440") }
    config.resolve ??= {}
    // The framework's Vite alias still prevents default before consumer onClick.
    // Its exported mock has the correct Next Link ordering, so cancelled
    // navigation can open the Request composer without weakening app guards.
    config.resolve.alias = { ...config.resolve.alias, "next/link": "@storybook/nextjs-vite/link.mock", "@": fileURLToPath(new URL("../src", import.meta.url)) }
    config.plugins ??= []
    config.plugins.push({
      name: "lane-storybook-link-ordering",
      enforce: "post",
      config: () => ({ resolve: { alias: [{ find: /^next\/link$/, replacement: require.resolve("@storybook/nextjs-vite/link.mock") }] } }),
    })
    return config
  },
}
export default config
