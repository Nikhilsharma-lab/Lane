import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const provider = vi.hoisted(() => ({
  instance: { get: vi.fn() },
  users: { createUser: vi.fn(), getUser: vi.fn(), deleteUser: vi.fn(), getOrganizationMembershipList: vi.fn() },
  organizations: { createOrganization: vi.fn(), getOrganization: vi.fn(), deleteOrganization: vi.fn() },
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn(async () => provider) }));
vi.mock("@clerk/testing/playwright", () => ({ clerk: {} }));
vi.mock("@playwright/test", () => ({ defineConfig: (config: unknown) => config, devices: { "Desktop Chrome": {} } }));
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
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
afterEach(() => vi.unstubAllEnvs());

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
  ])("rejects unsafe %s before creating anything", async (name, value) => {
    vi.stubEnv(name, value);
    const { createTestUser } = await import("../../e2e/helpers/test-user");
    await expect(createTestUser("safety")).rejects.toThrow();
    expect(provider.users.createUser).not.toHaveBeenCalled();
    expect(provider.organizations.createOrganization).not.toHaveBeenCalled();
    expect(postgres).not.toHaveBeenCalled();
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
      env: { LANE_ENV_FILE: "/dev/null", DATABASE_URL: process.env.DATABASE_URL },
    });
    expect(config.webServer).toHaveProperty("command", expect.stringContaining("LANE_ENV_FILE=/dev/null"));
  });
});
