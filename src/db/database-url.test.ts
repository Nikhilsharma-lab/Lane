import { describe, expect, it } from "vitest";

import { cleanDatabaseUrl } from "./database-url";

const url = "postgresql://postgres.ref:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";

describe("cleanDatabaseUrl", () => {
  it("leaves a clean URL alone", () => {
    expect(cleanDatabaseUrl(url)).toBe(url);
  });

  // Production went down on 2026-10-26: the Vercel value ended in U+2028, so
  // Postgres was asked for a database named "postgres%E2%80%A8".
  it.each([
    ["a trailing line separator", `${url} `],
    ["a trailing paragraph separator", `${url} `],
    ["a trailing newline", `${url}\n`],
    ["surrounding spaces and tabs", `  \t${url} `],
    ["a leading byte order mark", `﻿${url}`],
    ["a trailing zero-width space", `${url}​`],
    ["a trailing no-break space", `${url} `],
    ["surrounding quotes", `"${url}"`],
  ])("strips %s", (_label, raw) => {
    expect(cleanDatabaseUrl(raw)).toBe(url);
  });

  it("returns undefined for an unset or blank value", () => {
    expect(cleanDatabaseUrl(undefined)).toBeUndefined();
    expect(cleanDatabaseUrl("   ")).toBeUndefined();
  });
});
