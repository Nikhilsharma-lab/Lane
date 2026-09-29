import { defineConfig } from "vitest/config"
import path from "node:path"

// Requests UI checks isolate external Clerk/database boundaries; no database setup.
export default defineConfig({
  test: {
    include: [
      "src/components/shell/sidebar-workspace-name.test.ts",
      "src/app/**/requests-welcome.test.ts",
      "src/components/shell/sidebar-utils.test.ts",
    ],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
})
