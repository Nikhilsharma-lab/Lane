import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { assertSafeDatabaseUrl } from "./hosted-database-guard";

describe("assertSafeDatabaseUrl", () => {
  it("allows the local lane_test database", () => {
    expect(() =>
      assertSafeDatabaseUrl("postgresql://nikhilsharma@localhost:5432/lane_test")
    ).not.toThrow();
  });

  it("allows the Lane Staging project", () => {
    expect(() =>
      assertSafeDatabaseUrl(
        "postgresql://postgres.jznepeqghjixcrpuddym:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
        { NODE_ENV: "development" }
      )
    ).not.toThrow();
  });

  it("refuses another hosted database during local development", () => {
    expect(() =>
      assertSafeDatabaseUrl(
        "postgresql://postgres.otherproject:secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres",
        { NODE_ENV: "development" }
      )
    ).toThrow(/non-staging hosted DATABASE_URL/);
  });

  it("allows an explicit override or a production runtime", () => {
    expect(() =>
      assertSafeDatabaseUrl(
        "postgresql://postgres.otherproject:secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres",
        { NODE_ENV: "development", LANE_ALLOW_HOSTED_DB: "1" }
      )
    ).not.toThrow();

    expect(() =>
      assertSafeDatabaseUrl(
        "postgresql://postgres.otherproject:secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres",
        { NODE_ENV: "production" }
      )
    ).not.toThrow();
  });

  it("runs before Lane opens a database connection", () => {
    const source = readFileSync(join(process.cwd(), "src/db/index.ts"), "utf8");
    expect(source).toContain("assertSafeDatabaseUrl(process.env.DATABASE_URL)");
  });
});
