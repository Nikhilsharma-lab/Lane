import { requireTestDatabase } from "@/test/test-database";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// #209: one Quarter note per workspace per quarter, with its last editor and edit time.
const ORG = "org_quarter_notes_schema";
const OTHER = "org_quarter_notes_schema_other";
const ADMIN = "user_quarter_notes_admin";
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = process.env.DATABASE_URL!;
  requireTestDatabase(url);
  connection = postgres(url, { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Quarter notes','quarter-notes-schema'), (${OTHER},'Other','quarter-notes-schema-other')`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG}, ${OTHER})`;
  await connection.end();
});

const write = (org: string, year: number, quarter: number, body: string) =>
  connection`insert into quarter_notes (org_id, year, quarter, body, edited_by) values (${org}, ${year}, ${quarter}, ${body}, ${ADMIN}) returning *`;

describe("Quarter notes", () => {
  it("stores plain text with its last editor and edit time", async () => {
    const [note] = await write(ORG, 2026, 3, "We shipped the new checkout.\nDetails: https://example.test/q3");
    expect(note).toMatchObject({ org_id: ORG, year: 2026, quarter: 3, body: "We shipped the new checkout.\nDetails: https://example.test/q3", edited_by: ADMIN });
    expect(note.edited_at).toBeInstanceOf(Date);
  });

  it("keeps one note per workspace per quarter", async () => {
    await write(ORG, 2026, 2, "Spring");
    await expect(write(ORG, 2026, 2, "Again")).rejects.toMatchObject({ code: "23505" });
    await write(OTHER, 2026, 2, "Another workspace's spring");
    await write(ORG, 2025, 2, "Last year's spring");
  });

  it("refuses a quarter outside 1 to 4, an unlikely year, and blank, padded or overlong text", async () => {
    for (const [year, quarter] of [[2026, 0], [2026, 5], [1999, 1], [3000, 1]])
      await expect(write(ORG, year, quarter, "Note")).rejects.toMatchObject({ code: "23514" });
    for (const body of ["", "   ", " padded", "x".repeat(4001)])
      await expect(write(ORG, 2024, 1, body)).rejects.toMatchObject({ code: "23514" });
    await expect(connection`insert into quarter_notes (org_id, year, quarter, body, edited_by) values (${ORG}, 2024, 1, 'Note', '')`).rejects.toMatchObject({ code: "23514" });
    await write(ORG, 2024, 1, "x".repeat(4000));
  });

  it("belongs to a workspace and goes with it", async () => {
    await expect(write("org_missing_quarter_notes", 2026, 1, "Note")).rejects.toMatchObject({ code: "23503" });
    await connection`insert into organizations (id,name,slug) values ('org_quarter_notes_gone','Gone','quarter-notes-gone')`;
    await write("org_quarter_notes_gone", 2026, 1, "Note");
    await connection`delete from organizations where id = 'org_quarter_notes_gone'`;
    expect(await connection`select 1 from quarter_notes where org_id = 'org_quarter_notes_gone'`).toHaveLength(0);
  });

  it("is closed to direct database clients, like every Lane table", async () => {
    const [table] = await connection`select relrowsecurity from pg_class where oid = 'public.quarter_notes'::regclass`;
    expect(table.relrowsecurity).toBe(true);
    const grants = await connection`select grantee from information_schema.role_table_grants where table_name = 'quarter_notes' and grantee in ('PUBLIC', 'anon', 'authenticated')`;
    expect(grants).toHaveLength(0);
  });
});
