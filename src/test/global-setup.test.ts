import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { resolveTestDatabase } from "./test-database";
import { setup } from "./global-setup";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execSync: vi.fn(), execFileSync: vi.fn(actual.execFileSync) };
});

const target = resolveTestDatabase("postgresql://tester:secret@127.0.0.1:65431/lane_test");
const releases: (() => void)[] = [];
beforeEach(async () => {
  vi.clearAllMocks();
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  vi.mocked(execFileSync).mockImplementation((binary, args, options) => {
    if (binary === "git" || binary === "/bin/ps" || String(binary).endsWith("sysctl")) return actual.execFileSync(binary, args, options);
    return Buffer.from("");
  });
  vi.stubEnv("DATABASE_URL", target.url);
});
afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.unstubAllEnvs();
});
function pgCalls() {
  return vi.mocked(execFileSync).mock.calls.filter(([binary]) => /\/(psql|dropdb|createdb)$/.test(String(binary)));
}

describe("disposable database reset boundary", () => {
  it.each([
    "postgresql://tester@db.example.com/lane_test",
    "postgresql://tester@localhost/production",
    "postgresql://tester@localhost/lane_test?host=db.example.com",
    "postgresql://tester@localhost/lane_test?service=production",
    "postgresql://tester@localhost/lane_test?hostaddr=203.0.113.1",
    "https://tester@localhost/lane_test",
    "postgresql://localhost/lane_test",
    "postgresql://tester@localhost/lane_test#ignored",
    "postgresql://tester@localhost/lane_test-copy",
    "postgresql://tester@localhost/lane_testing",
  ])("rejects %s before invoking subprocesses", async (url) => {
    vi.stubEnv("DATABASE_URL", url);
    await expect(setup()).rejects.toThrow();
    expect(pgCalls()).toHaveLength(0);
    expect(execSync).not.toHaveBeenCalled();
  });

  it("pins every command to the validated target and removes inherited PG routing", async () => {
    vi.stubEnv("PGHOST", "production.example.com");
    vi.stubEnv("PGHOSTADDR", "203.0.113.1");
    vi.stubEnv("PGSERVICE", "production");
    vi.stubEnv("PGOPTIONS", "-c search_path=private");
    const release = await setup();
    if (release) releases.push(release);
    const calls = pgCalls();
    expect(calls.length).toBeGreaterThan(7);
    for (const [, args, options] of calls.filter(([, args]) => !args?.includes("--version"))) {
      expect(args).toEqual(expect.arrayContaining(["--host", "127.0.0.1", "--port", "65431", "--username", "tester"]));
      expect(options).toMatchObject({ env: { PGPASSWORD: "secret" } });
      for (const name of ["PGHOST", "PGHOSTADDR", "PGSERVICE", "PGOPTIONS", "PGDATABASE"]) {
        expect(options && typeof options !== "string" && options.env?.[name]).toBeUndefined();
      }
    }
    for (const [binary, args] of calls.filter(([binary, args]) => String(binary).endsWith("/psql") && !args?.includes("--version"))) {
      expect(binary).toBeTruthy();
      expect(args).toEqual(expect.arrayContaining(["-X", "-v", "ON_ERROR_STOP=1", "--dbname", target.database]));
    }
    expect(execSync).not.toHaveBeenCalled();
  });

  it("stops at the first SQL failure", async () => {
    const previous = vi.mocked(execFileSync).getMockImplementation()!;
    vi.mocked(execFileSync).mockImplementation((binary, args, options) => {
      if (String(binary).endsWith("/psql") && !args?.includes("--version")) throw new Error("invalid SQL");
      return previous(binary, args, options);
    });
    await expect(setup()).rejects.toThrow("invalid SQL");
    expect(vi.mocked(execFileSync).mock.calls.filter(([binary, args]) => String(binary).endsWith("/psql") && !args?.includes("--version"))).toHaveLength(1);
    vi.mocked(execFileSync).mockImplementation(previous);
    const recovered = await setup();
    releases.push(recovered);
  });

  it("holds ownership after setup until runner teardown, refusing a second reset", async () => {
    const release = await setup();
    if (release) releases.push(release);
    vi.mocked(execFileSync).mockClear();
    await expect(setup()).rejects.toThrow(/already running/);
    expect(pgCalls()).toHaveLength(0);
    release?.();
    const next = await setup();
    if (next) releases.push(next);
    expect(pgCalls().filter(([binary]) => /\/(dropdb|createdb)$/.test(String(binary))).map(([, args]) => args?.at(-1)))
      .toEqual([target.database, target.database]);
  });
});
