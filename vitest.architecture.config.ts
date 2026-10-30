import { defineConfig } from "vitest/config";

// Bootstrap safety checks: no environment loading, global setup or live database.
export default defineConfig({
  test: {
    include: [
      "src/test/test-database.test.ts",
      "src/test/test-run-lock.test.ts",
      "src/test/global-setup.test.ts",
      "src/test/test-target-config.test.ts",
    ],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
