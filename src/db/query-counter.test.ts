import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, queryCounter } from "@/db";

describe("queryCounter", () => {
  it("counts the statements the shared client runs inside a measurement, and nothing outside it", async () => {
    await db.execute(sql`select 1`);
    const outer = await queryCounter.measure(async () => {
      await db.execute(sql`select 1`);
      const inner = await queryCounter.measure(() => db.execute(sql`select 2`));
      await db.execute(sql`select 3`);
      return inner.statements;
    });
    expect(outer.result).toBe(1);
    expect(outer.statements).toBe(2);
  });

  it("returns the measured function's result", async () => {
    const { result, statements } = await queryCounter.measure(async () => "done");
    expect(result).toBe("done");
    expect(statements).toBe(0);
  });
});
