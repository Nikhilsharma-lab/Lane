import { defineConfig } from "vitest/config"
import path from "node:path"

// Requests UI checks isolate external Clerk/database boundaries; no database setup.
export default defineConfig({
  test: {
    include: [
      "src/components/settings/*.test.ts",
      "src/components/auth/clerk-appearance.test.ts",
      "src/components/auth/auth-frames.test.ts",
      "src/app/terms/terms-page.test.ts",
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
      "src/lib/workspace-search.test.ts",
      "src/components/projects/workspace-projects-provider.test.ts",
      "src/components/requests/new-request-link.test.ts",
      "src/app/**/requests-workspace-properties.test.ts",
      "src/app/**/requests-workspace-contract.test.ts",
      "src/app/api/search/search.test.ts",
      "src/components/shell/page-strip.test.ts",
      "src/components/shell/sidebar-view-frame.test.ts",
      "src/app/**/app-frame.test.ts",
      "src/lib/request-lifecycle.test.ts",
      "src/lib/request-reviewer-rules.test.ts",
      "src/lib/keyboard-shortcuts.test.ts",
      "src/components/requests/request-grid-keys.test.ts",
      "src/components/requests/request-row-label.test.ts",
      "src/components/shell/sidebar-motion.test.ts",
      "src/components/requests/request-detail-keys.test.ts",
      "src/components/requests/request-sequence.test.ts",
      "src/lib/request-review.test.ts",
      "src/components/requests/local-time.test.ts",
      "src/components/shell/notification-read-state.test.ts",
      "src/components/shell/notification-keys.test.ts",
      "src/components/shell/notification-copy.test.ts",
      "src/components/shell/shell-openers.test.ts",
      "src/components/shell/command-palette-entries.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // As in vitest.config.ts: Next resolves this marker itself; these checks import server loaders directly.
      "server-only": path.resolve(__dirname, "src/test/server-only.ts"),
    },
  },
})
