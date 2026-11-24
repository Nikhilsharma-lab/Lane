import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

// #399: made-up secrets only. The pin's fingerprint is replaced with a made-up secret's; the committed one is read
// from the real module below, and no test needs the secret behind it.
const MADE_UP_STAGING_SECRET = "made-up-staging-secret-for-the-safety-test-0001";
const MADE_UP_OTHER_SECRET = "made-up-other-secret-for-the-safety-test-0002";
vi.mock("../../e2e/helpers/staging-pin", async (importActual) => ({
  ...(await importActual<typeof import("../../e2e/helpers/staging-pin")>()),
  STAGING_AUTH_SECRET_SHA256: createHash("sha256").update("made-up-staging-secret-for-the-safety-test-0001").digest("hex"),
}));
vi.mock("@playwright/test", () => ({ defineConfig: (config: unknown) => config, devices: { "Desktop Chrome": {} } }));
const dotenv = vi.hoisted(() => ({ config: vi.fn() }));
vi.mock("dotenv", () => ({ default: dotenv }));
vi.mock("postgres", () => ({ default: vi.fn() }));

const STAGING_DB = "postgresql://postgres.jznepeqghjixcrpuddym:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
const LOCAL_DB = "postgresql://nikhilsharma@localhost:5432/lane_test_257_fix";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(postgres).mockImplementation(() => { throw new Error("unexpected database connection"); });
  vi.stubEnv("DATABASE_URL", STAGING_DB);
  vi.stubEnv("BETTER_AUTH_SECRET", MADE_UP_STAGING_SECRET);
  vi.stubEnv("E2E_BASE_URL", "http://localhost:3100");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://jznepeqghjixcrpuddym.supabase.co");
  vi.stubEnv("LANE_E2E_ALLOW_REMOTE", "1");
  vi.stubEnv("LANE_E2E_LOCAL_DATABASE", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** Making a person is refused with this message, before any connection, and the message never holds a secret. */
async function refusesToMakeAnything(message = /\[e2e\]/) {
  const { createTestUser } = await import("../../e2e/helpers/test-user");
  const refusal = await createTestUser("safety").then(() => null, (error: Error) => error);
  expect(refusal?.message).toMatch(message);
  expect(refusal?.message).not.toContain("made-up");
  expect(postgres).not.toHaveBeenCalled();
}

describe("the pin on Lane Staging", () => {
  it("accepts staging's database, storage and Better Auth secret", async () => {
    const { assertE2ETarget } = await import("../../e2e/helpers/safety");
    expect(assertE2ETarget()).toEqual({ databaseUrl: STAGING_DB, baseURL: "http://localhost:3100", ssl: "require" });
    const direct = "postgresql://postgres:secret@db.jznepeqghjixcrpuddym.supabase.co:5432/postgres";
    vi.stubEnv("DATABASE_URL", direct);
    vi.stubEnv("E2E_BASE_URL", "https://lane-staging.vercel.app");
    expect(assertE2ETarget()).toEqual({ databaseUrl: direct, baseURL: "https://lane-staging.vercel.app", ssl: "require" });
  });

  it.each([
    ["another secret", MADE_UP_OTHER_SECRET],
    ["staging's secret with a newline", `${MADE_UP_STAGING_SECRET}\n`],
    ["the fingerprint itself", createHash("sha256").update(MADE_UP_STAGING_SECRET).digest("hex")],
  ])("refuses %s, naming the secret and never its value", async (_, secret) => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    await refusesToMakeAnything(/BETTER_AUTH_SECRET is not Lane Staging's/);
  });

  it.each(["", "   "])("refuses a missing secret (%j)", async (secret) => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    await refusesToMakeAnything(/BETTER_AUTH_SECRET is not set/);
  });

  it("stops Playwright's configuration with that message, before any project", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", MADE_UP_OTHER_SECRET);
    await expect(import("../../playwright.config")).rejects.toThrow(/BETTER_AUTH_SECRET is not Lane Staging's/);
  });

  it("commits the fingerprint posted on #399", async () => {
    const { STAGING_AUTH_SECRET_SHA256 } = await vi.importActual<typeof import("../../e2e/helpers/staging-pin")>("../../e2e/helpers/staging-pin");
    expect(STAGING_AUTH_SECRET_SHA256).toBe("fd50bebe99b574fcd074c8d30803a82d60c58ce1f255659a32d4f0374e93a382");
  });

  it.each([
    ["DATABASE_URL", "postgresql://postgres:secret@production.example.com/postgres"],
    ["DATABASE_URL", "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"],
    ["DATABASE_URL", "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres"],
    ["DATABASE_URL", "postgresql://postgres.jznepeqghjixcrpuddym:secret@evil.example.com/postgres"],
    ["DATABASE_URL", "postgresql://postgres.jznepeqghjixcrpuddym:secret@aws-0-ap-northeast-1.pooler.supabase.com/postgres?host=evil.example.com"],
    ["DATABASE_URL", ""],
    ["DATABASE_URL", LOCAL_DB],
    ["E2E_BASE_URL", "https://app.uselane.app"],
    ["E2E_BASE_URL", "http://localhost:3259"],
    ["LANE_E2E_ALLOW_REMOTE", ""],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://production.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_URL", ""],
  ])("rejects unsafe %s %s before making anything", async (name, value) => {
    vi.stubEnv(name, value);
    await refusesToMakeAnything();
  });

  it("serves a local app with the checked environment, without rereading secrets files", async () => {
    const { default: config } = await import("../../playwright.config");
    expect(config.webServer).toMatchObject({
      reuseExistingServer: false,
      env: { LANE_ENV_FILE: "/dev/null", DATABASE_URL: "postgresql://postgres.jznepeqghjixcrpuddym:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres" },
    });
    // Fixture mutations retain the validated session connection.
    expect(new URL(process.env.DATABASE_URL!).port).toBe("5432");
    expect(config.webServer).toHaveProperty("command", expect.stringContaining("LANE_ENV_FILE=/dev/null"));
  });

  it("starts no app for deployed staging", async () => {
    vi.stubEnv("E2E_BASE_URL", "https://lane-staging.vercel.app");
    const { default: config } = await import("../../playwright.config");
    expect(config.webServer).toBeUndefined();
  });

  it("proves the app's auth in a setup project every suite waits for", async () => {
    const { default: config } = await import("../../playwright.config");
    const [setup, ...suites] = config.projects!;
    expect((setup.testMatch as RegExp).test("e2e/better-auth.setup.ts")).toBe(true);
    expect(suites.map((project) => project.dependencies)).toEqual([[setup.name]]);
  });
});

// #257 review: specs can run against a local server on a local database (`LANE_E2E_LOCAL_DATABASE=1`). The storage
// check and the remote opt-in stay; the secret is the local app's own (#399).
describe("the local database", () => {
  beforeEach(() => {
    vi.stubEnv("LANE_E2E_LOCAL_DATABASE", "1");
    vi.stubEnv("DATABASE_URL", LOCAL_DB);
    vi.stubEnv("BETTER_AUTH_SECRET", MADE_UP_OTHER_SECRET);
    vi.stubEnv("E2E_BASE_URL", "http://localhost:3259");
  });

  it("accepts a lane_test_ database on this machine, an app on any local port and the local secret, without SSL", async () => {
    const { assertE2ETarget } = await import("../../e2e/helpers/safety");
    expect(assertE2ETarget()).toEqual({ databaseUrl: LOCAL_DB, baseURL: "http://localhost:3259", ssl: false });
    vi.stubEnv("DATABASE_URL", "postgresql://nikhilsharma@127.0.0.1/lane_test_dev_257");
    vi.stubEnv("E2E_BASE_URL", "http://127.0.0.1:3100");
    expect(assertE2ETarget()).toMatchObject({ baseURL: "http://127.0.0.1:3100", ssl: false });
  });

  it.each([
    ["DATABASE_URL", STAGING_DB],
    ["DATABASE_URL", "postgresql://nikhilsharma@db.example.com:5432/lane_test_257_fix"],
    ["DATABASE_URL", "postgresql://nikhilsharma@localhost:5432/postgres"],
    ["DATABASE_URL", "postgresql://nikhilsharma@localhost:5432/lane"],
    ["DATABASE_URL", "postgresql://nikhilsharma@localhost:5432/lane_test_257_fix?host=db.example.com"],
    ["DATABASE_URL", "mysql://nikhilsharma@localhost:5432/lane_test_257_fix"],
    ["E2E_BASE_URL", "https://lane-staging.vercel.app"],
    ["E2E_BASE_URL", "https://localhost.example.com:3259"],
    ["E2E_BASE_URL", "http://localhost:3259/requests"],
    ["LANE_E2E_ALLOW_REMOTE", ""],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://production.supabase.co"],
    ["BETTER_AUTH_SECRET", ""],
  ])("rejects unsafe %s %s before making anything", async (name, value) => {
    vi.stubEnv(name, value);
    await refusesToMakeAnything();
  });

  it("starts the app on the chosen port against the local database, ignoring the staging overlay", async () => {
    vi.stubEnv("STAGING_DATABASE_URL", STAGING_DB);
    const { default: config } = await import("../../playwright.config");
    expect(dotenv.config).not.toHaveBeenCalledWith(expect.objectContaining({ path: ".env.staging.local" }));
    expect(process.env.DATABASE_URL).toBe(LOCAL_DB);
    expect(config.use).toMatchObject({ baseURL: "http://localhost:3259" });
    expect(config.webServer).toMatchObject({ url: "http://localhost:3259", env: { DATABASE_URL: LOCAL_DB, PORT: "3259", LANE_ENV_FILE: "/dev/null" } });
    expect(config.webServer).toHaveProperty("command", expect.stringContaining("PORT=3259"));
  });

  it("gives the app its own address, the run's secret and Cloudflare's always-pass Turnstile keys, whatever the env file holds", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://elsewhere.example.com");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "made-up-real-turnstile-secret");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "made-up-real-site-key");
    const { default: config } = await import("../../playwright.config");
    expect(config.webServer).toMatchObject({
      env: {
        BETTER_AUTH_URL: "http://localhost:3259",
        BETTER_AUTH_SECRET: MADE_UP_OTHER_SECRET,
        // https://developers.cloudflare.com/turnstile/troubleshooting/testing/
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      },
    });
  });
});

// What the receipts protect once there are rows is in e2e-fixtures.test.ts, on the test database.
describe("fixture ownership, before any connection", () => {
  it("refuses to delete a person this run didn't make", async () => {
    const { deleteTestUser } = await import("../../e2e/helpers/test-user");
    const { cleanupTestWorkspace } = await import("../../e2e/helpers/cleanup");
    await expect(deleteTestUser("someone-else")).rejects.toThrow(/no creation receipt/);
    await expect(cleanupTestWorkspace("someone-else")).rejects.toThrow(/no creation receipt/);
    expect(postgres).not.toHaveBeenCalled();
  });

  it("refuses to delete a workspace this run didn't make", async () => {
    const { deleteTestWorkspace } = await import("../../e2e/helpers/cleanup");
    await expect(deleteTestWorkspace("someone-elses")).rejects.toThrow(/no creation receipt/);
    expect(postgres).not.toHaveBeenCalled();
  });

  it("makes no workspace for a person this run didn't make", async () => {
    const { provisionTestWorkspace } = await import("../../e2e/helpers/cleanup");
    await expect(provisionTestWorkspace({ userId: "someone-else", email: "x@example.com", name: "X", workspaceName: "X" })).rejects.toThrow(/no creation receipt/);
    expect(postgres).not.toHaveBeenCalled();
  });
});
