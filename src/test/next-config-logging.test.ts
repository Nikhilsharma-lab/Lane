import { describe, expect, it, vi } from "vitest"

// #383: some Server Actions take a password (Settings → Profile's first password), and `next dev` prints every
// Server Action's arguments unless this is off.
describe("next.config.ts", () => {
  it("never logs a Server Action's arguments", async () => {
    vi.stubEnv("LANE_ENV_FILE", "/dev/null")
    const { default: config } = await import("../../next.config")
    expect(config.logging).toMatchObject({ serverFunctions: false })
    vi.unstubAllEnvs()
  })
})
