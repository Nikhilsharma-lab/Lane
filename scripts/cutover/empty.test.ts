// #413: `empty`, `empty-bucket` and `check-zero`, run as the runbook runs them inside the outage, against a scratch
// database at 0055 and a scratch folder standing in for request-attachments. Each test checks what is left in the
// database, the other schemas, the folder and the step log, never how the kit got there.
import { chmodSync, existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  localServerUrl,
  MADE_UP_PASSPHRASE,
  makeGnupg,
  makeScratch,
  makeWorkingFolder,
  putFile,
  runKit,
  snapshotFolder,
  stepLog,
  tableDigests,
  type Gnupg,
  type KitRun,
  type Scratch,
} from "./test-kit";

let scratch: Scratch;
let gnupg: Gnupg;
let dir: string;

/** What lives outside public in a Supabase database, made up here: emptying must leave every row of it. */
async function otherSchemas(sql: Scratch["sql"]): Promise<string[]> {
  const rows = await sql<{ row: string }[]>`
    select 'auth.users ' || to_jsonb(u)::text as row from auth.users u
    union all select 'storage.objects ' || to_jsonb(o)::text from storage.objects o
    union all select 'drizzle.__drizzle_migrations ' || to_jsonb(m)::text from drizzle.__drizzle_migrations m
    order by 1`;
  return rows.map((row) => row.row);
}

const rowsPerTable = async () => Object.fromEntries(Object.entries(await tableDigests(scratch.sql)).map(([table, digest]) => [table, Number(digest.split(":")[0])]));

beforeAll(async () => {
  scratch = await makeScratch();
  gnupg = makeGnupg();
  dir = makeWorkingFolder();
  await scratch.sql.unsafe(`
    create schema auth; create table auth.users (id text primary key, email text);
    insert into auth.users values ('made-up-auth-user-413', 'auth-413@example.test');
    create schema storage; create table storage.objects (id serial primary key, name text);
    insert into storage.objects (name) values ('org_a/request_1/brief.pdf');
    create schema drizzle; create table drizzle.__drizzle_migrations (id serial primary key, hash text, created_at bigint);
    insert into drizzle.__drizzle_migrations (hash, created_at) values ('made-up-hash-413', 1764201600000)`);
  putFile(scratch.folder, "org_a/request_1/brief.pdf", "%PDF made-up 413", "application/pdf");
  // As the runbook goes up to the outage: export, rehearse, apply (already at 0055 here), check-writes.
  expect((await runKit(["export", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [scratch.url], env: gnupg.env })).code).toBe(0);
  expect((await runKit(["rehearse", "rehearsal"], { dir, clipboard: [localServerUrl()], env: gnupg.env })).code).toBe(0);
  expect((await runKit(["check-writes", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [scratch.url] })).code).toBe(0);
}, 180_000);
afterAll(async () => {
  await scratch?.drop();
  gnupg?.close();
  rmSync(dir, { recursive: true, force: true });
});

const empty = (workingFolder = dir) => runKit(["empty", "rehearsal"], { dir: workingFolder, clipboard: [scratch.url] });
const emptyBucket = () => runKit(["empty-bucket", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [scratch.url] });
const checkZero = () => runKit(["check-zero", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [scratch.url] });

function expectNoSecret(...runs: KitRun[]): void {
  const log = readFileSync(path.join(dir, "rehearsal", "steps.log"), "utf8");
  for (const output of [...runs.flatMap((run) => [run.stdout, run.stderr]), log]) {
    expect(output).not.toContain(decodeURIComponent(new URL(scratch.url).password));
    expect(output).not.toContain(MADE_UP_PASSPHRASE);
  }
}

describe("empty", () => {
  it("stops, emptying nothing, when the environment's latest export hasn't passed rehearse and check-writes", async () => {
    const elsewhere = makeWorkingFolder();
    try {
      const before = await tableDigests(scratch.sql);

      const run = await empty(elsewhere);

      expect(run.code).toBe(1);
      expect(run.stdout).toMatch(/STOP: There is no export of rehearsal\./);
      expect(run.stdout).toMatch(/Empty: stop\. Nothing was emptied\./);
      expect(await tableDigests(scratch.sql)).toEqual(before);
      expect(stepLog(elsewhere, "rehearsal")).toEqual([expect.objectContaining({ step: "empty", result: "stop" })]);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("leaves every row in place when something fails inside its transaction", async () => {
    // Fires once every table is truncated, inside the same transaction, and fails it.
    await scratch.sql.unsafe(`
      create function public.made_up_fail_413() returns trigger language plpgsql as $$ begin raise exception 'made-up failure 413'; end $$;
      create trigger made_up_fail_413 after truncate on public.profiles for each statement execute function public.made_up_fail_413()`);
    try {
      const before = { rows: await tableDigests(scratch.sql), other: await otherSchemas(scratch.sql) };

      const run = await empty();

      expect(run.code).toBe(1);
      expect(run.stderr).toMatch(/FAILED: Emptying failed and was rolled back, so nothing was emptied\.[\s\S]*made-up failure 413/);
      expect({ rows: await tableDigests(scratch.sql), other: await otherSchemas(scratch.sql) }).toEqual(before);
      expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "empty", result: "failed" });
      expectNoSecret(run);
    } finally {
      await scratch.sql.unsafe("drop trigger made_up_fail_413 on public.profiles; drop function public.made_up_fail_413()");
    }
  });

  it("empties every table in public, one made after the kit was written included, and touches nothing else; a rerun does the same", async () => {
    // A table no kit file names, with rows and its own sequence.
    await scratch.sql`create table public.made_up_later_413 (id serial primary key, note text)`;
    await scratch.sql`insert into public.made_up_later_413 (note) values ('one'), ('two')`;
    const rows = await rowsPerTable();
    expect(rows.made_up_later_413).toBe(2);
    expect(rows.profiles).toBeGreaterThan(0);
    const before = { other: await otherSchemas(scratch.sql), folder: snapshotFolder(scratch.folder) };

    const run = await empty();

    expect(run.code).toBe(0);
    expect(run.stdout).toContain(`Emptied ${Object.keys(rows).length} tables in public (${Object.values(rows).reduce((sum, count) => sum + count, 0)} rows) in one transaction.`);
    expect(run.stdout).toMatch(/Empty: ok\. Every table in public is at 0 rows\. No other schema was touched\. Next: empty-bucket rehearsal\./);
    expect(await rowsPerTable()).toEqual(Object.fromEntries(Object.keys(rows).map((table) => [table, 0])));
    expect({ other: await otherSchemas(scratch.sql), folder: snapshotFolder(scratch.folder) }).toEqual(before);
    // Its sequence starts again.
    const [{ id }] = await scratch.sql`insert into public.made_up_later_413 (note) values ('after') returning id`;
    expect(id).toBe(1);
    await scratch.sql`delete from public.made_up_later_413`;
    expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "empty", result: "ok", export: expect.stringMatching(/^lane-rehearsal-/), counts: { tables: rows } });

    const rerun = await empty();

    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toMatch(/Empty: ok\./);
    expect(await rowsPerTable()).toEqual(Object.fromEntries(Object.keys(rows).map((table) => [table, 0])));
    expect({ other: await otherSchemas(scratch.sql), folder: snapshotFolder(scratch.folder) }).toEqual(before);
    expectNoSecret(run, rerun);
    await scratch.sql`drop table public.made_up_later_413`;
  });
});
