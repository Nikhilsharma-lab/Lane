import { rootCertificates } from "node:tls";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Do not load .env.local or open a database connection while evaluating tooling.
vi.mock("dotenv", () => ({ config: vi.fn() }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://user:password@database.example:6543/postgres?sslmode=disable");
  vi.stubEnv("DATABASE_SSL_CA", "");
});
afterEach(() => vi.unstubAllEnvs());

async function migrationClientOptions() {
  const { default: config } = await import("../../drizzle.config");
  const credentials = config.dbCredentials;
  if (!credentials) throw new Error("Missing test credentials");
  // Drizzle Kit 0.31.10's actual constructor boundary: when url is present it
  // drops sibling ssl options. Exercise that branch with the real lazy driver.
  const client = "url" in credentials
    ? postgres(credentials.url as string, { max: 1 })
    : postgres({ ...credentials, max: 1 });
  return client.options;
}

describe("migration connection certificate verification", () => {
  it("enforces certificate verification through the installed Drizzle constructor path", async () => {
    expect((await migrationClientOptions()).ssl).toEqual({ rejectUnauthorized: true });
  });
  it.each(["localhost", "127.0.0.1"])("supports local migrations on %s without TLS", async (host) => {
    vi.stubEnv("DATABASE_URL", `postgresql://user@${host}:5432/lane_test?sslmode=require`);
    expect((await migrationClientOptions()).ssl).toBe(false);
  });
  it("preserves encoded credentials, database name and port when using explicit TLS options", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres.test:pass%3Awith%40symbols@database.example:6543/lane%2Dtest");
    expect(await migrationClientOptions()).toMatchObject({
      host: ["database.example"], port: [6543], user: "postgres.test", pass: "pass:with@symbols", database: "lane-test", ssl: { rejectUnauthorized: true },
    });
  });
  it("passes the same normalized CA certificate to migrations", async () => {
    const ca = rootCertificates[0];
    vi.stubEnv("DATABASE_SSL_CA", ca.replaceAll("\n", "\\n"));
    expect((await migrationClientOptions()).ssl).toEqual({ rejectUnauthorized: true, ca: ca.trim() });
  });
  it("rejects an invalid migration CA rather than dropping it", async () => {
    vi.stubEnv("DATABASE_SSL_CA", "INVALID_CA_VALUE");
    await expect(migrationClientOptions()).rejects.toThrow("DATABASE_SSL_CA must contain a valid PEM certificate");
  });
  it("keeps offline schema generation available without database credentials", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { default: config } = await import("../../drizzle.config");
    expect(config.dbCredentials).toBeUndefined();
  });
});
