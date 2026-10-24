import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as targets from "./test-database";

const directory = mkdtempSync(path.join(tmpdir(), "lane-target-test-"));
const main = path.join(directory, "main");
mkdirSync(main);
execFileSync("git", ["init", "--quiet", main]);
execFileSync("git", ["-C", main, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture"], { stdio: "pipe" });
const linked = path.join(directory, "arbitrary-copy");
execFileSync("git", ["-C", main, "worktree", "add", "--quiet", "-b", "fixture", linked]);
const subfolder = path.join(linked, "src");
mkdirSync(subfolder);
const alias = path.join(directory, "alias");
symlinkSync(linked, alias);
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("checkout-owned connection configuration", () => {
  it("discovers one real root through subfolders and symlink aliases, with a distinct main target", () => {
    expect(targets.checkoutRootFor(subfolder)).toBe(realpathSync(linked));
    expect(targets.checkoutRootFor(alias)).toBe(realpathSync(linked));
    expect(targets.resolveTestDatabase("postgresql://tester@localhost/lane_test", alias).database)
      .not.toBe(targets.resolveTestDatabase("postgresql://tester@localhost/lane_test", main).database);
    expect(() => targets.resolveTestDatabase("postgresql://tester@localhost/lane_test", directory)).toThrow(/checkout/i);
  });
});

it("substitutes only the placeholder and preserves credentials/server for an exact override", () => {
  const assigned = targets.resolveTestDatabase("postgres://tester:p%40ss@127.0.0.1:5437/lane_test", main);
  expect(assigned.url).toBe(`postgres://tester:p%40ss@127.0.0.1:5437/${assigned.database}`);
  expect(targets.resolveTestDatabase(assigned.url, main)).toEqual(assigned);
  expect(targets.isLocalTestDatabase(assigned.url, main)).toBe(true);
  expect(targets.isLocalTestDatabase(assigned.url, linked)).toBe(false);
  expect(targets.isLocalTestDatabase("postgres://tester@localhost/lane_test", main)).toBe(false);
});

it.each([
  undefined, "invalid", "postgresql://tester@remote.invalid/lane_test",
  "https://tester@localhost/lane_test", "postgresql://localhost/lane_test",
  "postgresql://tester@localhost:0/lane_test", "postgresql://tester@localhost:65536/lane_test",
  "postgresql://tester@localhost/production", "postgresql://tester@localhost/lane_test_other",
  "postgresql://tester@localhost/lane_test?host=remote.invalid", "postgresql://tester@localhost/lane_test?",
  "postgresql://tester@localhost/lane_test#", "postgresql://tester@localhost/lane_test#fragment",
  "postgresql://%ZZ@localhost/lane_test",
])("refuses an invalid or foreign target without disclosing its URL", (value) => {
  expect(() => targets.resolveTestDatabase(value, main)).toThrow(/test-target/);
});

vi.mock("dotenv", () => ({ default: { config() {} } }));
afterEach(() => vi.unstubAllEnvs());
it("config rejects a foreign explicit target instead of letting setup choose another database", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://tester@localhost/lane_test_foreign");
  vi.resetModules();
  await expect(import("../../vitest.config")).rejects.toThrow(/test-target/);
});

it("config publishes the same exact target consumed by reset and database guards", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://tester@localhost/lane_test");
  vi.resetModules();
  await import("../../vitest.config");
  expect(targets.requireTestDatabase(process.env.DATABASE_URL).database)
    .toBe(targets.testDatabaseFor(targets.checkoutRootFor(process.cwd())));
});

it("ignores inherited Git routing and keeps branch-independent identity", () => {
  vi.stubEnv("GIT_DIR", path.join(main, ".git"));
  vi.stubEnv("GIT_WORK_TREE", main);
  expect(targets.checkoutRootFor(subfolder)).toBe(realpathSync(linked));
  const before = targets.resolveTestDatabase("postgresql://tester@localhost/lane_test", main).database;
  execFileSync("git", ["-C", main, "branch", "-m", "renamed-main"]);
  expect(targets.resolveTestDatabase("postgresql://tester@localhost/lane_test", main).database).toBe(before);
});

it("assigns a new target after a checkout moves", () => {
  const original = path.join(directory, "movable");
  const moved = path.join(directory, "moved");
  mkdirSync(original);
  execFileSync("git", ["init", "--quiet", original]);
  const before = targets.resolveTestDatabase("postgresql://tester@localhost/lane_test", original).database;
  renameSync(original, moved);
  expect(targets.resolveTestDatabase("postgresql://tester@localhost/lane_test", moved).database).not.toBe(before);
});

it.each([
  ["postgresql://tester@localhost/lane_test", 5432],
  ["postgresql://tester@localhost:5437/lane_test", 5437],
])("pins driver routing to the validated target for %s", async (databaseUrl, port) => {
  vi.stubEnv("PGPORT", "65432");
  vi.stubEnv("PGHOST", "remote.invalid");
  vi.stubEnv("PGDATABASE", "production");
  vi.stubEnv("PGUSER", "other-user");
  vi.stubEnv("PGUSERNAME", "other-user");
  const target = targets.resolveTestDatabase(databaseUrl, main);
  // Postgres.js is lazy: reading options and ending an unused client never connects.
  const client = postgres(target.url);
  try {
    expect(client.options.port).toEqual([port]);
    expect(client.options.host).toEqual(["localhost"]);
    expect(client.options.database).toBe(target.database);
    expect(client.options.user).toBe("tester");
    expect(target.port).toBe(String(port));
    expect(new URL(target.url).port).toBe(String(port));
  } finally {
    await client.end();
  }
});

it("removes inherited PostgreSQL client overrides before publishing worker configuration", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://tester@localhost/lane_test");
  const inherited = {
    PGPORT: "65432", PGHOST: "remote.invalid", PGHOSTADDR: "203.0.113.1",
    PGDATABASE: "production", PGUSER: "other-user", PGUSERNAME: "other-user",
    PGPASSWORD: "inherited-password", PGSERVICE: "production", PGOPTIONS: "-c search_path=private",
    PGSSL: "require", PGTARGETSESSIONATTRS: "read-only",
  };
  for (const [key, value] of Object.entries(inherited)) vi.stubEnv(key, value);
  vi.resetModules();
  await import("../../vitest.config");
  const target = targets.requireTestDatabase(process.env.DATABASE_URL);
  const client = postgres(process.env.DATABASE_URL!);
  try {
    expect(client.options).toMatchObject({
      host: ["localhost"], port: [5432], database: target.database, user: "tester",
      pass: "", ssl: false,
    });
    for (const key of Object.keys(inherited)) expect(process.env[key], key).toBeUndefined();
  } finally {
    await client.end();
  }
});
