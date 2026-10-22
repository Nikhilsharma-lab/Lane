import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";
import { testDatabaseFor } from "./src/test/test-database";

dotenv.config({ path: ".env.test" });

// Each git worktree resets its own lane_test_<copy>, so sessions working in
// parallel copies never wipe each other's database mid-run (src/test/test-database.ts).
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  if (url.pathname === "/lane_test") {
    url.pathname = `/${testDatabaseFor(process.cwd())}`;
    process.env.DATABASE_URL = url.toString();
  }
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    // Several sessions share this machine; a busy one must not fail a test on time alone.
    testTimeout: 20_000,
    globalSetup: "./src/test/global-setup.ts",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next resolves this marker itself; the suite imports server loaders directly.
      "server-only": path.resolve(__dirname, "src/test/server-only.ts"),
    },
  },
});
