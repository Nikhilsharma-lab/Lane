import { defineConfig } from "vitest/config"
import path from "node:path"

// Requests UI checks isolate external Clerk/database boundaries; no database setup.
export default defineConfig({
  test: {
    include: [
      "src/components/shell/sidebar-workspace-name.test.ts",
      "src/components/shell/workspace-switcher.test.ts",
      "src/components/shell/project-tone.test.ts",
      "src/app/**/requests-welcome.test.ts",
      "src/app/**/intake/attachment-recovery.test.ts",
      "src/app/**/intake/intake-gate-contract.test.ts",
      "src/lib/intake-draft.test.ts",
      "src/lib/request-workspace.test.ts",
      "src/lib/request-overview.test.ts",
      "src/lib/request-code.test.ts",
      "src/components/projects/workspace-projects-provider.test.ts",
      "src/components/requests/new-request-link.test.ts",
      "src/app/**/requests-workspace-properties.test.ts",
      "src/app/**/requests-workspace-contract.test.ts",
      "src/app/api/search/search.test.ts",
    ],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "src/test/server-only.ts") } },
})
