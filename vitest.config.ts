import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";
import { resolveTestDatabase } from "./src/test/test-database";

dotenv.config({ path: ".env.test" });

// Resolve the checkout-owned target once before any worker or global reset starts.
process.env.DATABASE_URL = resolveTestDatabase(process.env.DATABASE_URL).url;

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
