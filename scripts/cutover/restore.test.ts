// #413: `restore`, the rollback, run as the runbook runs it: on an environment that went through the whole cutover
// (export, rehearse, apply, check-writes, empty, empty-bucket) and then took Better Auth sign-ups. It checks what the
// database, the folder standing in for the bucket and the step log hold afterwards, never how the kit got there.
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  localServerUrl,
  MADE_UP_PASSPHRASE,
  makeGnupg,
  makeScratch,
  makeWorkingFolder,
  onlyExport,
  putFile,
  runKit,
  stepLog,
  tableDigests,
  type Gnupg,
  type KitRun,
  type Scratch,
} from "./test-kit";

const NEWEST = "2031-01-02 03:04:05.678901+00";

let scratch: Scratch;
let gnupg: Gnupg;
let dir: string;
/** What the environment held when check-writes passed: what a rollback must bring back. */
let atCutover: { rows: Record<string, string>; bucket: Record<string, string> };

/** Each file in the folder standing in for the bucket, with its content type and bytes. */
function bucketState(folder: string): Record<string, string> {
  let types: Record<string, string> = {};
  try {
    types = JSON.parse(readFileSync(path.join(folder, ".content-types.json"), "utf8"));
  } catch {}
  return Object.fromEntries(
    (readdirSync(folder, { recursive: true, withFileTypes: true }) as import("node:fs").Dirent[])
      .filter((entry) => entry.isFile() && entry.name !== ".content-types.json")
      .map((entry) => {
        const objectPath = path.relative(folder, path.join(entry.parentPath, entry.name));
        return [objectPath, `${types[objectPath] ?? "(no type)"} ${readFileSync(path.join(folder, objectPath), "base64")}`];
      })
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

beforeAll(async () => {
  scratch = await makeScratch({ before0055: true });
  gnupg = makeGnupg();
  dir = makeWorkingFolder();
  await scratch.sql`insert into public.profiles (id, full_name, email, created_at, updated_at)
    values ('user_clerk_era_413', 'Clerk era', 'clerk-era-413@example.test', ${NEWEST}::text::timestamptz, ${NEWEST}::text::timestamptz)`;
  putFile(scratch.folder, "org_a/request_1/brief.pdf", "%PDF made-up 413", "application/pdf");
  putFile(scratch.folder, "org_a/request_2/deep/notes.txt", "made-up notes 413", "text/plain");
  putFile(scratch.folder, "org_b/request_3/photo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]), "image/png");
  const kit = (args: string[], clipboard: string[], env?: Readonly<Record<string, string>>) => runKit(args, { dir, clipboard, env });
  // The whole cutover, as the runbook runs it.
  expect((await kit(["export", "rehearsal", "--folder", scratch.folder], [scratch.url], gnupg.env)).code).toBe(0);
  expect((await kit(["rehearse", "rehearsal"], [localServerUrl()], gnupg.env)).code).toBe(0);
  expect((await kit(["apply", "rehearsal"], [scratch.url])).code).toBe(0);
  expect((await kit(["check-writes", "rehearsal", "--folder", scratch.folder], [scratch.url])).code).toBe(0);
  atCutover = { rows: await tableDigests(scratch.sql), bucket: bucketState(scratch.folder) };
  expect((await kit(["empty", "rehearsal"], [scratch.url])).code).toBe(0);
  expect((await kit(["empty-bucket", "rehearsal", "--folder", scratch.folder], [scratch.url])).code).toBe(0);
  // Then Better Auth's era: a sign-up with a password, a session, a code and an attachment.
  await scratch.sql`insert into public.profiles (id, full_name, email, email_verified) values ('user_better_auth_413', 'After', 'after-413@example.test', true)`;
  await scratch.sql`insert into public.account (id, account_id, provider_id, user_id, password, updated_at)
    values ('account_413', 'user_better_auth_413', 'credential', 'user_better_auth_413', 'made-up-password-hash-413', now())`;
  await scratch.sql`insert into public.session (id, expires_at, token, updated_at, user_id)
    values ('session_413', now() + interval '1 day', 'made-up-session-token-413', now(), 'user_better_auth_413')`;
  await scratch.sql`insert into public.verification (id, identifier, value, expires_at) values ('verification_413', 'after-413@example.test', '123456', now())`;
  putFile(scratch.folder, "org_new/request_9/after.txt", "made-up Better Auth era file", "text/plain");
}, 240_000);
afterAll(async () => {
  await scratch?.drop();
  gnupg?.close();
  rmSync(dir, { recursive: true, force: true });
});

const restore = () => runKit(["restore", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [scratch.url], env: gnupg.env });

function expectNoSecret(...runs: KitRun[]): void {
  const log = readFileSync(path.join(dir, "rehearsal", "steps.log"), "utf8");
  for (const output of [...runs.flatMap((run) => [run.stdout, run.stderr]), log]) {
    expect(output).not.toContain(decodeURIComponent(new URL(scratch.url).password));
    expect(output).not.toContain(MADE_UP_PASSPHRASE);
  }
}

describe("restore", () => {
  it("stops before emptying anything when the archive changed after it was exported", async () => {
    const { folder, name } = onlyExport(dir, "rehearsal");
    const archive = path.join(folder, `${name}.tar.gpg`);
    const bytes = readFileSync(archive);
    writeFileSync(archive, Buffer.concat([bytes, Buffer.from("x")]));
    try {
      const before = { rows: await tableDigests(scratch.sql), bucket: bucketState(scratch.folder) };

      const run = await restore();

      expect(run.code).toBe(1);
      expect(run.stdout).toMatch(/STOP: The archive's SHA256 isn't the one exported/);
      expect(run.stdout).toContain("Restore: stop. Nothing was emptied or restored.");
      expect({ rows: await tableDigests(scratch.sql), bucket: bucketState(scratch.folder) }).toEqual(before);
      expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "restore", result: "stop", export: name });
      expectNoSecret(run);
    } finally {
      writeFileSync(archive, bytes);
    }
  }, 60_000);

  it("brings back exactly what the export holds on the schema with 0055, every file with its type, and no Better Auth row; a rerun does the same", async () => {
    const { folder, name } = onlyExport(dir, "rehearsal");
    const record = JSON.parse(readFileSync(path.join(folder, "manifest.json"), "utf8"));

    const run = await restore();

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(new RegExp(`Restore: ok\\. rehearsal holds exactly what ${name} holds`));
    // Row for row as it was when check-writes passed, 0055's columns included; Better Auth's tables empty.
    expect(await tableDigests(scratch.sql)).toEqual(atCutover.rows);
    for (const table of ["account", "session", "verification", "member", "invitation", "rate_limit"]) expect(atCutover.rows[table]).toBe("0:");
    expect(bucketState(scratch.folder)).toEqual(atCutover.bucket);
    expect(Object.keys(atCutover.bucket)).toEqual(["org_a/request_1/brief.pdf", "org_a/request_2/deep/notes.txt", "org_b/request_3/photo.png"]);
    const [{ columns }] = await scratch.sql`select count(*)::int as columns from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email_verified'`;
    expect(columns).toBe(1);
    const rows = Object.fromEntries(Object.entries(record.tables).map(([table, summary]) => [table, (summary as { rows: number }).rows]));
    expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({
      step: "restore",
      result: "ok",
      export: name,
      counts: { tables: rows, files: 3 },
      sha256: { archive: record.archive.sha256, dump: record.dump.sha256 },
    });

    const rerun = await restore();

    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toMatch(/Restore: ok\./);
    expect(await tableDigests(scratch.sql)).toEqual(atCutover.rows);
    expect(bucketState(scratch.folder)).toEqual(atCutover.bucket);
    const [first, second] = stepLog(dir, "rehearsal").filter((line) => line.step === "restore" && line.result === "ok");
    expect({ ...second, at: first.at }).toEqual(first);
    expectNoSecret(run, rerun);
    for (const output of [run.stdout, run.stderr]) expect(output).not.toContain("made-up-password-hash-413");
  }, 120_000);
});
