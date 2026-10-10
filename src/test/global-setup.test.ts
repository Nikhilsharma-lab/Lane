import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { setup } from "./global-setup";

vi.mock("node:child_process", () => ({ execSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock("child_process", () => ({ execSync: vi.fn(), execFileSync: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://tester:secret@127.0.0.1:5437/lane_test");
});
afterEach(() => vi.unstubAllEnvs());

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
  ])("rejects %s before invoking subprocesses", async (url) => {
    vi.stubEnv("DATABASE_URL", url);
    await expect(setup()).rejects.toThrow();
    expect(execFileSync).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalled();
  });

  it("pins every command to the validated target and removes inherited PG routing", async () => {
    vi.stubEnv("PGHOST", "production.example.com");
    vi.stubEnv("PGHOSTADDR", "203.0.113.1");
    vi.stubEnv("PGSERVICE", "production");
    vi.stubEnv("PGOPTIONS", "-c search_path=private");
    await setup();
    const calls = vi.mocked(execFileSync).mock.calls;
    expect(calls.length).toBeGreaterThan(7);
    for (const [, args, options] of calls.filter(([, args]) => !args?.includes("--version"))) {
      expect(args).toEqual(expect.arrayContaining(["--host", "127.0.0.1", "--port", "5437", "--username", "tester"]));
      expect(options).toMatchObject({ env: { PGPASSWORD: "secret" } });
      for (const name of ["PGHOST", "PGHOSTADDR", "PGSERVICE", "PGOPTIONS", "PGDATABASE"]) {
        expect(options && typeof options !== "string" && options.env?.[name]).toBeUndefined();
      }
    }
    for (const [binary, args] of calls.filter(([binary, args]) => String(binary).endsWith("/psql") && !args?.includes("--version"))) {
      expect(binary).toBeTruthy();
      expect(args).toEqual(expect.arrayContaining(["-X", "-v", "ON_ERROR_STOP=1", "--dbname", "lane_test"]));
    }
    expect(execSync).not.toHaveBeenCalled();
  });

  it("stops at the first SQL failure", async () => {
    vi.mocked(execFileSync).mockImplementation((binary, args) => {
      if (String(binary).endsWith("/psql") && !args?.includes("--version")) throw new Error("invalid SQL");
      return Buffer.from("");
    });
    await expect(setup()).rejects.toThrow("invalid SQL");
    expect(vi.mocked(execFileSync).mock.calls.filter(([binary, args]) => String(binary).endsWith("/psql") && !args?.includes("--version"))).toHaveLength(1);
  });
});
