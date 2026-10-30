import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const provider = vi.hoisted(() => ({
  instance: { get: vi.fn() },
  users: {
    createUser: vi.fn(), getUser: vi.fn(), deleteUser: vi.fn(), getOrganizationMembershipList: vi.fn(),
    getUserList: vi.fn(), updateUser: vi.fn(), updateUserMetadata: vi.fn(), verifyPassword: vi.fn(),
  },
  organizations: { createOrganization: vi.fn(), getOrganization: vi.fn(), deleteOrganization: vi.fn() },
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn(async () => provider) }));
vi.mock("@clerk/testing/playwright", () => ({ clerk: {} }));
vi.mock("@playwright/test", () => ({ defineConfig: (config: unknown) => config, devices: { "Desktop Chrome": {} } }));
const dotenv = vi.hoisted(() => ({ config: vi.fn() }));
vi.mock("dotenv", () => ({ default: dotenv }));
vi.mock("postgres", () => ({ default: vi.fn(() => { throw new Error("unexpected database connection"); }) }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://postgres.jznepeqghjixcrpuddym:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", `pk_test_${Buffer.from("thankful-caiman-3665.clerk.accounts.dev$").toString("base64")}`);
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_inert");
  vi.stubEnv("E2E_BASE_URL", "http://localhost:3100");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://jznepeqghjixcrpuddym.supabase.co");
  vi.stubEnv("LANE_E2E_ALLOW_REMOTE", "1");
  provider.instance.get.mockResolvedValue({ id: "ins_3JlFEUdZ5q4X4z6DI7c8i7k0tYZ", environmentType: "development" });
  provider.users.createUser.mockImplementation(async (input) => ({ id: "user_owned", privateMetadata: input.privateMetadata }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("E2E mutation boundary", () => {
  it.each([
    ["DATABASE_URL", "postgresql://postgres:secret@production.example.com/postgres"],
    ["DATABASE_URL", "postgresql://postgres.jznepeqghjixcrpuddym:secret@evil.example.com/postgres"],
    ["DATABASE_URL", "postgresql://postgres.jznepeqghjixcrpuddym:secret@aws-0-ap-northeast-1.pooler.supabase.com/postgres?host=evil.example.com"],
    ["E2E_BASE_URL", "https://app.uselane.app"],
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", `pk_test_${Buffer.from("other.clerk.accounts.dev$").toString("base64")}`],
    ["LANE_E2E_ALLOW_REMOTE", ""],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://production.supabase.co"],
    ["CLERK_API_URL", "https://other-api.example.com"],
    ["CLERK_FAPI", "other.clerk.accounts.dev"],
    ["CLERK_FAPI", "https://thankful-caiman-3665.clerk.accounts.dev"],
    ["CLERK_PROXY_URL", "https://proxy.example.com"],
    ["NEXT_PUBLIC_CLERK_PROXY_URL", "https://proxy.example.com"],
  ])("rejects unsafe %s before creating anything", async (name, value) => {
    vi.stubEnv(name, value);
    const { createTestUser } = await import("../../e2e/helpers/test-user");
    await expect(createTestUser("safety")).rejects.toThrow();
    expect(provider.users.createUser).not.toHaveBeenCalled();
    expect(provider.organizations.createOrganization).not.toHaveBeenCalled();
    expect(postgres).not.toHaveBeenCalled();
  });

  // Clerk's Playwright setup writes the pinned instance's Frontend API host into
  // CLERK_FAPI, and workers reload the config after it, so that one value is safe.
  it("accepts CLERK_FAPI set by Clerk's test setup for the pinned development instance", async () => {
    vi.stubEnv("CLERK_FAPI", "thankful-caiman-3665.clerk.accounts.dev");
    const { createTestUser } = await import("../../e2e/helpers/test-user");
    await expect(createTestUser("safety")).resolves.toMatchObject({ id: "user_owned" });
    expect(provider.users.createUser).toHaveBeenCalledOnce();
  });

  it("rejects a secret key for a different development instance", async () => {
    provider.instance.get.mockResolvedValue({ id: "ins_wrong", environmentType: "development" });
    const { createTestUser } = await import("../../e2e/helpers/test-user");
    await expect(createTestUser("safety")).rejects.toThrow();
    expect(provider.users.createUser).not.toHaveBeenCalled();
  });

  it("does not create a Clerk organization before checking the DB target", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres@production.example.com/postgres");
    const { provisionTestWorkspace } = await import("../../e2e/helpers/cleanup");
    await expect(provisionTestWorkspace({ userId: "user_unowned", email: "x@example.com", name: "X", workspaceName: "X" })).rejects.toThrow();
    expect(provider.organizations.createOrganization).not.toHaveBeenCalled();
  });

  it("refuses deletion of an unrecorded user even when they are an admin", async () => {
    provider.users.getOrganizationMembershipList.mockResolvedValue({ data: [{ role: "org:admin", organization: { id: "org_unrelated" } }], totalCount: 1 });
    const { deleteTestUser } = await import("../../e2e/helpers/test-user");
    await expect(deleteTestUser("user_unrecorded")).rejects.toThrow();
    expect(provider.users.deleteUser).not.toHaveBeenCalled();
    expect(provider.organizations.deleteOrganization).not.toHaveBeenCalled();
  });

  it("refuses cleanup when a recorded user also belongs to an unrelated organization", async () => {
    const { createTestUser, deleteTestUser } = await import("../../e2e/helpers/test-user");
    const user = await createTestUser("safety");
    const metadata = provider.users.createUser.mock.calls[0][0].privateMetadata;
    provider.users.getUser.mockResolvedValue({ id: user.id, privateMetadata: metadata });
    provider.users.getOrganizationMembershipList.mockResolvedValue({ data: [{ role: "org:admin", organization: { id: "org_unrelated" } }], totalCount: 1 });
    await expect(deleteTestUser(user.id)).rejects.toThrow();
    expect(provider.users.deleteUser).not.toHaveBeenCalled();
    expect(provider.organizations.deleteOrganization).not.toHaveBeenCalled();
  });

  it("deletes an exact recorded fixture with matching metadata and no memberships", async () => {
    const { createTestUser, deleteTestUser } = await import("../../e2e/helpers/test-user");
    const user = await createTestUser("safety");
    provider.users.getUser.mockResolvedValue({ id: user.id, privateMetadata: provider.users.createUser.mock.calls[0][0].privateMetadata });
    provider.users.getOrganizationMembershipList.mockResolvedValue({ data: [], totalCount: 0 });
    await deleteTestUser(user.id);
    expect(provider.users.deleteUser).toHaveBeenCalledExactlyOnceWith(user.id);
  });

  it("refuses SQL cleanup of an unrecorded user before connecting", async () => {
    const { cleanupTestWorkspace } = await import("../../e2e/helpers/cleanup");
    await expect(cleanupTestWorkspace("user_stranger")).rejects.toThrow();
    expect(postgres).not.toHaveBeenCalled();
  });

  it("deletes only a recorded organization whose remote ownership marker matches", async () => {
    const { createTestUser, createClerkTestOrganization, deleteTestUser } = await import("../../e2e/helpers/test-user");
    const user = await createTestUser("owned-org");
    provider.users.getUser.mockResolvedValue({ id: user.id, privateMetadata: provider.users.createUser.mock.calls[0][0].privateMetadata });
    provider.organizations.createOrganization.mockImplementation(async (input) => ({ id: "org_owned", ...input }));
    const orgId = await createClerkTestOrganization(user.id, "Fixture");
    provider.organizations.getOrganization.mockResolvedValue({ id: orgId, ...provider.organizations.createOrganization.mock.calls[0][0] });
    provider.users.getOrganizationMembershipList.mockResolvedValue({ data: [{ organization: { id: orgId } }], totalCount: 1 });
    await deleteTestUser(user.id);
    expect(provider.organizations.deleteOrganization).toHaveBeenCalledExactlyOnceWith(orgId);
    expect(provider.users.deleteUser).toHaveBeenCalledExactlyOnceWith(user.id);
  });

  it("refuses an organization with changed ownership metadata before any deletion", async () => {
    const { createTestUser, createClerkTestOrganization, deleteTestUser } = await import("../../e2e/helpers/test-user");
    const user = await createTestUser("changed-org");
    provider.users.getUser.mockResolvedValue({ id: user.id, privateMetadata: provider.users.createUser.mock.calls[0][0].privateMetadata });
    provider.organizations.createOrganization.mockResolvedValue({ id: "org_changed" });
    const orgId = await createClerkTestOrganization(user.id, "Fixture");
    provider.organizations.getOrganization.mockResolvedValue({ id: orgId, createdBy: user.id, privateMetadata: {} });
    provider.users.getOrganizationMembershipList.mockResolvedValue({ data: [{ organization: { id: orgId } }], totalCount: 1 });
    await expect(deleteTestUser(user.id)).rejects.toThrow();
    expect(provider.organizations.deleteOrganization).not.toHaveBeenCalled();
    expect(provider.users.deleteUser).not.toHaveBeenCalled();
  });

  it("starts an explicitly selected local app with the validated environment, without rereading secrets files", async () => {
    const { default: config } = await import("../../playwright.config");
    expect(config.webServer).toMatchObject({
      reuseExistingServer: false,
      env: { LANE_ENV_FILE: "/dev/null", DATABASE_URL: "postgresql://postgres.jznepeqghjixcrpuddym:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres" },
    });
    // Fixture mutations retain the validated session connection.
    expect(new URL(process.env.DATABASE_URL!).port).toBe("5432");
    expect(config.webServer).toHaveProperty("command", expect.stringContaining("LANE_ENV_FILE=/dev/null"));
  });

});

// #257 review: specs can run against a local server on a local database (`LANE_E2E_LOCAL_DATABASE=1`). Clerk is
// still the pinned development instance, so its checks and the remote opt-in stay.
describe("E2E local database", () => {
  const LOCAL_DB = "postgresql://nikhilsharma@localhost:5432/lane_test_257_fix";
  beforeEach(() => {
    vi.stubEnv("LANE_E2E_LOCAL_DATABASE", "1");
    vi.stubEnv("DATABASE_URL", LOCAL_DB);
    vi.stubEnv("E2E_BASE_URL", "http://localhost:3259");
  });

  it("accepts a lane_test_ database on this machine and an app on any local port, without SSL", async () => {
    const { assertE2ETarget } = await import("../../e2e/helpers/safety");
    expect(assertE2ETarget()).toEqual({ databaseUrl: LOCAL_DB, baseURL: "http://localhost:3259", ssl: false });
    vi.stubEnv("DATABASE_URL", "postgresql://nikhilsharma@127.0.0.1/lane_test_dev_257");
    vi.stubEnv("E2E_BASE_URL", "http://127.0.0.1:3100");
    expect(assertE2ETarget()).toMatchObject({ baseURL: "http://127.0.0.1:3100", ssl: false });
  });

  it("keeps SSL on Lane Staging's database", async () => {
    vi.stubEnv("LANE_E2E_LOCAL_DATABASE", "");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres.jznepeqghjixcrpuddym:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres");
    vi.stubEnv("E2E_BASE_URL", "http://localhost:3100");
    const { assertE2ETarget } = await import("../../e2e/helpers/safety");
    expect(assertE2ETarget()).toMatchObject({ ssl: "require" });
  });

  it.each([
    ["DATABASE_URL", "postgresql://postgres.jznepeqghjixcrpuddym:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"],
    ["DATABASE_URL", "postgresql://nikhilsharma@db.example.com:5432/lane_test_257_fix"],
    ["DATABASE_URL", "postgresql://nikhilsharma@localhost:5432/postgres"],
    ["DATABASE_URL", "postgresql://nikhilsharma@localhost:5432/lane"],
    ["DATABASE_URL", "postgresql://nikhilsharma@localhost:5432/lane_test_257_fix?host=db.example.com"],
    ["DATABASE_URL", "mysql://nikhilsharma@localhost:5432/lane_test_257_fix"],
    ["E2E_BASE_URL", "https://lane-staging.vercel.app"],
    ["E2E_BASE_URL", "https://localhost.example.com:3259"],
    ["E2E_BASE_URL", "http://localhost:3259/requests"],
    ["LANE_E2E_ALLOW_REMOTE", ""],
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", `pk_test_${Buffer.from("other.clerk.accounts.dev$").toString("base64")}`],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://production.supabase.co"],
  ])("rejects unsafe %s %s before creating anything", async (name, value) => {
    vi.stubEnv(name, value);
    const { createTestUser } = await import("../../e2e/helpers/test-user");
    await expect(createTestUser("safety")).rejects.toThrow();
    expect(provider.users.createUser).not.toHaveBeenCalled();
  });

  it("refuses a local database unless the local switch is on", async () => {
    vi.stubEnv("LANE_E2E_LOCAL_DATABASE", "");
    vi.stubEnv("E2E_BASE_URL", "http://localhost:3100");
    const { assertE2ETarget } = await import("../../e2e/helpers/safety");
    expect(() => assertE2ETarget()).toThrow();
  });

  it("starts the app on the chosen port against the local database, ignoring the staging overlay", async () => {
    vi.stubEnv("STAGING_DATABASE_URL", "postgresql://postgres.jznepeqghjixcrpuddym:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres");
    const { default: config } = await import("../../playwright.config");
    expect(dotenv.config).not.toHaveBeenCalledWith(expect.objectContaining({ path: ".env.staging.local" }));
    expect(process.env.DATABASE_URL).toBe(LOCAL_DB);
    expect(config.use).toMatchObject({ baseURL: "http://localhost:3259" });
    expect(config.webServer).toMatchObject({ url: "http://localhost:3259", env: { DATABASE_URL: LOCAL_DB, PORT: "3259", LANE_ENV_FILE: "/dev/null" } });
    expect(config.webServer).toHaveProperty("command", expect.stringContaining("PORT=3259"));
  });
});

// #257 review: the Clerk development instance has a 100-user cap. With `LANE_E2E_REUSE_USERS=1`, a fixture that
// can't create a user at the cap borrows an existing `lane-e2e-*` user, and gives it back instead of deleting it.
describe("E2E borrowed users at Clerk's user cap", () => {
  const quotaExceeded = Object.assign(new Error("user quota exceeded"), { status: 403, errors: [{ code: "user_quota_exceeded" }] });
  const candidate = (id: string, email: string, privateMetadata: Record<string, unknown> = { laneE2ERunId: "old-run" }) =>
    ({ id, firstName: "Review PM", lastName: null, emailAddresses: [{ emailAddress: email }], privateMetadata });
  const stranger = candidate("user_stranger", "someone@example.com");
  const busy = candidate("user_busy", "lane-e2e-busy-1+clerk_test@example.com");
  const borrowedElsewhere = candidate("user_elsewhere", "lane-e2e-elsewhere-1+clerk_test@example.com", { laneE2EBorrowedBy: "another-run" });
  const wrongPassword = candidate("user_password", "lane-e2e-password-1+clerk_test@example.com");
  const free = candidate("user_free", "lane-e2e-free-1+clerk_test@example.com");
  const users = new Map([stranger, busy, borrowedElsewhere, wrongPassword, free].map((user) => [user.id, structuredClone(user)]));

  beforeEach(() => {
    vi.stubEnv("LANE_E2E_REUSE_USERS", "1");
    for (const user of [stranger, busy, borrowedElsewhere, wrongPassword, free]) users.set(user.id, structuredClone(user));
    provider.users.createUser.mockRejectedValue(quotaExceeded);
    provider.users.getUserList.mockResolvedValue({ data: [...users.values()], totalCount: users.size });
    provider.users.getUser.mockImplementation(async (id: string) => users.get(id));
    provider.users.updateUserMetadata.mockImplementation(async (id: string, { privateMetadata }) => {
      const user = users.get(id)!;
      user.privateMetadata = Object.fromEntries(Object.entries({ ...user.privateMetadata, ...privateMetadata }).filter(([, value]) => value !== null));
      return user;
    });
    // Clerk stores an empty name as null.
    provider.users.updateUser.mockImplementation(async (id: string, names: Record<string, string>) =>
      Object.assign(users.get(id)!, Object.fromEntries(Object.entries(names).map(([key, value]) => [key, value || null]))));
    provider.users.getOrganizationMembershipList.mockImplementation(async ({ userId }) =>
      userId === "user_busy" ? { data: [{ organization: { id: "org_unrelated" } }], totalCount: 1 } : { data: [], totalCount: 0 });
    provider.users.verifyPassword.mockImplementation(async ({ userId }) => {
      if (userId === "user_password") throw new Error("password mismatch");
      return { verified: true };
    });
  });

  it("borrows a free lane-e2e user with the fixture's password, named as a new fixture", async () => {
    const { createTestUser } = await import("../../e2e/helpers/test-user");
    await expect(createTestUser("reuse")).resolves.toEqual({ id: "user_free", email: "lane-e2e-free-1+clerk_test@example.com", password: "LaneE2ETest1234!" });
    expect(users.get("user_free")).toMatchObject({ firstName: "Lane", lastName: "E2E" });
    expect(users.get("user_free")!.privateMetadata).toHaveProperty("laneE2EBorrowedBy");
    for (const id of ["user_stranger", "user_busy", "user_elsewhere", "user_password"]) expect(users.get(id)).toEqual(candidate(id, users.get(id)!.emailAddresses[0].emailAddress, users.get(id)!.privateMetadata));
    expect(users.get("user_elsewhere")!.privateMetadata).toEqual({ laneE2EBorrowedBy: "another-run" });
  });

  it("never borrows the same user twice in one run", async () => {
    const { createTestUser } = await import("../../e2e/helpers/test-user");
    await createTestUser("first");
    await expect(createTestUser("second")).rejects.toThrow(/no free lane-e2e/i);
  });

  it("gives a borrowed user back with its own name instead of deleting it, after deleting the run's organizations", async () => {
    const { createTestUser, createClerkTestOrganization, deleteTestUser } = await import("../../e2e/helpers/test-user");
    const user = await createTestUser("reuse");
    const { laneE2EBorrowedBy: runId } = users.get(user.id)!.privateMetadata;
    provider.organizations.createOrganization.mockImplementation(async (input) => ({ id: "org_owned", ...input }));
    const orgId = await createClerkTestOrganization(user.id, "Fixture");
    expect(provider.organizations.createOrganization.mock.calls[0][0].privateMetadata).toEqual({ laneE2ERunId: runId });
    provider.organizations.getOrganization.mockResolvedValue({ id: orgId, ...provider.organizations.createOrganization.mock.calls[0][0] });
    provider.users.getOrganizationMembershipList.mockResolvedValue({ data: [{ organization: { id: orgId } }], totalCount: 1 });
    await provider.users.updateUser(user.id, { firstName: "Marguerite", lastName: "Okonkwo-Fairweather" });

    await deleteTestUser(user.id);
    expect(provider.organizations.deleteOrganization).toHaveBeenCalledExactlyOnceWith(orgId);
    expect(provider.users.deleteUser).not.toHaveBeenCalled();
    expect(users.get(user.id)).toEqual(free);
  });

  it("refuses to give back a borrowed user that joined an unrelated organization", async () => {
    const { createTestUser, deleteTestUser } = await import("../../e2e/helpers/test-user");
    const user = await createTestUser("reuse");
    provider.users.getOrganizationMembershipList.mockResolvedValue({ data: [{ organization: { id: "org_unrelated" } }], totalCount: 1 });
    await expect(deleteTestUser(user.id)).rejects.toThrow();
    expect(provider.organizations.deleteOrganization).not.toHaveBeenCalled();
    expect(provider.users.deleteUser).not.toHaveBeenCalled();
  });

  it("fails as before at the cap when borrowing is off", async () => {
    vi.stubEnv("LANE_E2E_REUSE_USERS", "");
    const { createTestUser } = await import("../../e2e/helpers/test-user");
    await expect(createTestUser("reuse")).rejects.toBe(quotaExceeded);
    expect(provider.users.getUserList).not.toHaveBeenCalled();
  });

  it("borrows only at the cap, not on any other Clerk error", async () => {
    const other = Object.assign(new Error("form_identifier_exists"), { status: 422, errors: [{ code: "form_identifier_exists" }] });
    provider.users.createUser.mockRejectedValue(other);
    const { createTestUser } = await import("../../e2e/helpers/test-user");
    await expect(createTestUser("reuse")).rejects.toBe(other);
    expect(provider.users.getUserList).not.toHaveBeenCalled();
  });

  it("runs one worker, so two workers never borrow the same user", async () => {
    const { default: config } = await import("../../playwright.config");
    expect(config.workers).toBe(1);
  });
});
