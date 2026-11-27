// #412: `apply`, run as the runbook runs it, against scratch databases at 0054. It checks what changed in the
// database and the step log: 0055 arrives whole, or nothing changes at all.
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localServerUrl, MADE_UP_PASSWORD, makeGnupg, makeScratch, makeWorkingFolder, runKit, sha256, stepLog, tableDigests, type Gnupg, type Scratch } from "./test-kit";

const MIGRATION_0055 = path.resolve(__dirname, "../../src/db/migrations/0055_better_auth.sql");

let gnupg: Gnupg;
let dir: string;

beforeAll(() => {
  gnupg = makeGnupg();
});
afterAll(() => gnupg?.close());
beforeEach(() => {
  dir = makeWorkingFolder();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Every public column and index: what 0055 adds, so a run that changed nothing leaves this as it was. */
async function schema(sql: Scratch["sql"]): Promise<string[]> {
  const rows = await sql<{ item: string }[]>`
    select 'column ' || table_name || '.' || column_name as item from information_schema.columns where table_schema = 'public'
    union all select 'index ' || indexname from pg_indexes where schemaname = 'public'
    order by 1`;
  return rows.map((row) => row.item);
}

async function exportAndRehearse(scratch: Scratch): Promise<void> {
  expect((await runKit(["export", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [scratch.url], env: gnupg.env })).code).toBe(0);
  expect((await runKit(["rehearse", "rehearsal"], { dir, clipboard: [localServerUrl()], env: gnupg.env })).code).toBe(0);
}

const applyTo = (scratch: Scratch) => runKit(["apply", "rehearsal"], { dir, clipboard: [scratch.url] });

describe("apply on a database at 0054 whose export was rehearsed", () => {
  let scratch: Scratch;
  beforeAll(async () => {
    scratch = await makeScratch({ before0055: true });
  }, 60_000);
  afterAll(async () => scratch?.drop());

  it("brings it to 0055 with every row still there, and a rerun changes nothing", async () => {
    await exportAndRehearse(scratch);
    const rowsBefore = Object.fromEntries(Object.entries(await tableDigests(scratch.sql)).map(([table, digest]) => [table, digest.split(":")[0]]));
    expect(await schema(scratch.sql)).not.toContain("column profiles.email_verified");

    const run = await applyTo(scratch);

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Apply: ok/);
    const after = await schema(scratch.sql);
    for (const item of ["column profiles.email_verified", "column organizations.logo", "column session.token", "column rate_limit.key", "index profiles_email_unique"]) {
      expect(after).toContain(item);
    }
    const rowsAfter = Object.fromEntries(Object.entries(await tableDigests(scratch.sql)).map(([table, digest]) => [table, digest.split(":")[0]]));
    expect(rowsAfter).toEqual({ ...rowsBefore, account: "0", invitation: "0", member: "0", rate_limit: "0", session: "0", verification: "0" });
    expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "apply", result: "ok", sha256: { migration: sha256(readFileSync(MIGRATION_0055)) } });

    const digests = await tableDigests(scratch.sql);
    const rerun = await applyTo(scratch);

    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toMatch(/already at 0055\. Nothing was changed/);
    expect({ schema: await schema(scratch.sql), rows: await tableDigests(scratch.sql) }).toEqual({ schema: after, rows: digests });
    expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "apply", result: "ok", counts: { alreadyAt0055: true } });
    const log = readFileSync(path.join(dir, "rehearsal", "steps.log"), "utf8");
    for (const output of [run.stdout, run.stderr, rerun.stdout, rerun.stderr, log]) expect(output).not.toContain(MADE_UP_PASSWORD);
  }, 120_000);
});

describe("apply that can't finish", () => {
  let scratch: Scratch;
  beforeAll(async () => {
    scratch = await makeScratch({ before0055: true });
  }, 60_000);
  afterAll(async () => scratch?.drop());

  it("leaves the database exactly as it was when a statement in 0055 fails", async () => {
    await exportAndRehearse(scratch);
    // A table 0055 also creates, made after the rehearsal: 0055's CREATE TABLE fails partway through the file.
    await scratch.sql`create table public.session (id text primary key)`;
    try {
      const before = { schema: await schema(scratch.sql), rows: await tableDigests(scratch.sql) };

      const run = await applyTo(scratch);

      expect(run.code).toBe(1);
      expect(run.stderr).toMatch(/FAILED: 0055 stopped at its first error and was rolled back, so the database is as it was\.[\s\S]*relation "session" already exists/);
      expect({ schema: await schema(scratch.sql), rows: await tableDigests(scratch.sql) }).toEqual(before);
      expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "apply", result: "failed" });
    } finally {
      await scratch.sql`drop table public.session`;
    }
  }, 120_000);

  it("stops on two emails that differ only in case, before 0055 runs", async () => {
    await exportAndRehearse(scratch);
    await scratch.sql`insert into public.profiles (id, full_name, email) values
      ('user_case_412_1', 'Case', 'Case.412@example.test'), ('user_case_412_2', 'Case', 'case.412@example.test')`;
    try {
      const before = { schema: await schema(scratch.sql), rows: await tableDigests(scratch.sql) };

      const run = await applyTo(scratch);

      expect(run.code).toBe(1);
      expect(run.stdout).toMatch(/STOP: profiles has 1 email\(s\) that differ only in case[\s\S]*case\.412@example\.test \(2 profiles\)/);
      expect({ schema: await schema(scratch.sql), rows: await tableDigests(scratch.sql) }).toEqual(before);
      expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "apply", result: "stop", counts: { caseDuplicateEmails: 1 } });
    } finally {
      await scratch.sql`delete from public.profiles where id like 'user_case_412_%'`;
    }
  }, 120_000);

  it("stops until the latest export has passed a rehearsal", async () => {
    expect((await runKit(["export", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [scratch.url], env: gnupg.env })).code).toBe(0);
    const before = { schema: await schema(scratch.sql), rows: await tableDigests(scratch.sql) };

    const run = await applyTo(scratch);

    expect(run.code).toBe(1);
    expect(run.stdout).toMatch(/STOP: The latest export of rehearsal \(lane-rehearsal-[^)]+\) hasn't passed a rehearsal with this 0055\. Run rehearse rehearsal first\./);
    expect({ schema: await schema(scratch.sql), rows: await tableDigests(scratch.sql) }).toEqual(before);
    expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "apply", result: "stop" });
  }, 120_000);
});
