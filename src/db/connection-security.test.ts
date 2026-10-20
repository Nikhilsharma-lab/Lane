import { rootCertificates } from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Postgres.js opens a socket only when a query runs. Inspect the real lazy
// client's options without making any query or hosted connection.
const shared = globalThis as typeof globalThis & { _sql?: unknown; _db?: unknown };
beforeEach(() => {
  vi.resetModules();
  delete shared._sql;
  delete shared._db;
  vi.stubEnv("DATABASE_URL", "postgresql://user:password@database.example:6543/postgres");
  vi.stubEnv("DATABASE_SSL_CA", "");
  vi.stubEnv("LANE_ALLOW_HOSTED_DB", "1");
  vi.stubEnv("VERCEL", "");
});
afterEach(() => {
  delete shared._sql;
  delete shared._db;
  vi.unstubAllEnvs();
});
async function sslOptions() {
  const { db } = await import("./index");
  return db.$client.options.ssl;
}
describe("database connection certificate verification", () => {
  it("initializes the real Postgres.js client on Vercel without an incompatible pool adapter", async () => {
    vi.stubEnv("VERCEL", "1");
    expect(await sslOptions()).toEqual({ rejectUnauthorized: true });
  });
  it("verifies hosted certificates even when the URL asks to disable TLS", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@database.example:6543/postgres?sslmode=disable");
    expect(await sslOptions()).toEqual({ rejectUnauthorized: true });
  });
  it.each(["localhost", "127.0.0.1"])("keeps the existing local %s database usable without TLS", async (host) => {
    vi.stubEnv("DATABASE_URL", `postgresql://user@${host}:5432/lane_test`);
    expect(await sslOptions()).toBe(false);
  });
  it.each(["localhost.example", "127.0.0.1.example"])("does not treat %s as local", async (host) => {
    vi.stubEnv("DATABASE_URL", `postgresql://user@${host}:5432/postgres`);
    expect(await sslOptions()).toEqual({ rejectUnauthorized: true });
  });
  it.each([false, true])("uses the configured CA and retains verification (escaped newlines: %s)", async (escaped) => {
    const ca = rootCertificates[0];
    vi.stubEnv("DATABASE_SSL_CA", escaped ? ca.replaceAll("\n", "\\n") : ca);
    expect(await sslOptions()).toEqual({ rejectUnauthorized: true, ca: ca.trim() });
  });
  it("rejects invalid CA configuration without an insecure fallback or leaking its value", async () => {
    vi.stubEnv("DATABASE_SSL_CA", "INVALID_CA_VALUE_MUST_NOT_APPEAR");
    await expect(sslOptions()).rejects.toThrow("DATABASE_SSL_CA must contain a valid PEM certificate");
    expect(shared._sql).toBeUndefined();
  });
});
