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

describe("empty-bucket", () => {
  it("finishes on a rerun after a partial run, and leaves the folder standing in for the bucket", async () => {
    // More than one batch, at several depths, and two files it can't remove the first time.
    for (let index = 0; index < 150; index++) putFile(scratch.folder, `org_b/request_${index % 7}/${index}.txt`, `made-up ${index}`, "text/plain");
    putFile(scratch.folder, "org_c/locked/a.txt", "made-up locked");
    putFile(scratch.folder, "org_c/locked/b.txt", "made-up locked too");
    const locked = path.join(scratch.folder, "org_c/locked");
    chmodSync(locked, 0o500);
    let partial: KitRun;
    try {
      partial = await emptyBucket();
    } finally {
      chmodSync(locked, 0o700);
    }

    expect(partial.code).toBe(1);
    expect(partial.stdout).toMatch(/STOP: A batch of \d+ files wasn't all removed: 2 of \d+ couldn't be removed: org_c\/locked\/a\.txt \(EACCES\)/);
    expect(partial.stdout).toContain("Files left in request-attachments: 2");
    expect(partial.stdout).toContain("Empty bucket: stop. 2 files are left. Run empty-bucket rehearsal again until it reports 0.");
    expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "empty-bucket", result: "stop", counts: { found: 153, removed: 151, left: 2 } });

    const rerun = await emptyBucket();
    const again = await emptyBucket();

    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("Files left in request-attachments: 0");
    expect(rerun.stdout).toMatch(/Empty bucket: ok\. request-attachments holds 0 files; the bucket and its settings are as they were\. Next: promote the Better Auth build, then check-zero rehearsal\./);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("Files left in request-attachments: 0");
    expect(stepLog(dir, "rehearsal").slice(-2)).toEqual([
      expect.objectContaining({ step: "empty-bucket", result: "ok", counts: { found: 2, removed: 2, left: 0 } }),
      expect.objectContaining({ step: "empty-bucket", result: "ok", counts: { found: 0, removed: 0, left: 0 } }),
    ]);
    expect(existsSync(scratch.folder)).toBe(true);
    expect(Object.keys(snapshotFolder(scratch.folder))).toEqual([".content-types.json"]);
    expect(JSON.parse(readFileSync(path.join(scratch.folder, ".content-types.json"), "utf8"))).toEqual({});
    expectNoSecret(partial!, rerun, again);
  });
});

describe("check-zero", () => {
  const ROLL_BACK = "Check zero: stop. Something is in rehearsal after the emptying. Roll back with restore rehearsal, then repeat the cutover. Never delete rows or files by hand.";

  it("passes when every public table and the bucket are at 0, again on a rerun, and changes nothing", async () => {
    const before = { rows: await tableDigests(scratch.sql), folder: snapshotFolder(scratch.folder) };

    const first = await checkZero();
    const second = await checkZero();

    for (const run of [first, second]) {
      expect(run.code).toBe(0);
      expect(run.stdout).toContain("Check zero: ok. Every table in public is at 0 rows and request-attachments holds 0 files. Nothing was changed.");
    }
    expect(stepLog(dir, "rehearsal").slice(-2)).toEqual([
      expect.objectContaining({ step: "check-zero", result: "ok", counts: { tables: Object.keys(before.rows).length, rows: 0, files: 0, notEmpty: {} } }),
      expect.objectContaining({ step: "check-zero", result: "ok", counts: { tables: Object.keys(before.rows).length, rows: 0, files: 0, notEmpty: {} } }),
    ]);
    expect({ rows: await tableDigests(scratch.sql), folder: snapshotFolder(scratch.folder) }).toEqual(before);
    expectNoSecret(first, second);
  });

  it("stops on one row, saying to roll back", async () => {
    await scratch.sql`insert into public.profiles (id, full_name, email) values ('user_early_413', 'Early', 'early-413@example.test')`;
    try {
      const run = await checkZero();

      expect(run.code).toBe(1);
      expect(run.stdout).toContain("STOP: profiles holds 1 row(s).");
      expect(run.stdout).toContain(ROLL_BACK);
      expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "check-zero", result: "stop", counts: { rows: 1, files: 0, notEmpty: { profiles: 1 } } });
      expectNoSecret(run);
    } finally {
      await scratch.sql`delete from public.profiles where id = 'user_early_413'`;
    }
  });

  it("stops on one file, saying to roll back", async () => {
    putFile(scratch.folder, "org_d/request_1/early.txt", "made-up early");
    try {
      const run = await checkZero();

      expect(run.code).toBe(1);
      expect(run.stdout).toContain("STOP: request-attachments holds 1 file(s).");
      expect(run.stdout).toContain(ROLL_BACK);
      expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "check-zero", result: "stop", counts: { rows: 0, files: 1, notEmpty: {} } });
      expectNoSecret(run);
    } finally {
      rmSync(path.join(scratch.folder, "org_d"), { recursive: true, force: true });
    }
  });
});
