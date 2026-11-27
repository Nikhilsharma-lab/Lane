// #412: `export` and `rehearse`, run as the runbook runs them, against a scratch database at 0054 and a scratch
// folder standing in for request-attachments. Each test checks what is in the export folder, the throwaway copy and
// the step log, never how the kit got there.
import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  MADE_UP_PASSPHRASE,
  MADE_UP_PASSWORD,
  databaseExists,
  localServerUrl,
  makeGnupg,
  makeScratch,
  makeWorkingFolder,
  onlyExport,
  openExport,
  putFile,
  rewriteDump,
  runKit,
  sealExport,
  sha256,
  snapshotFolder,
  stepLog,
  tableDigests,
  type Gnupg,
  type Scratch,
} from "./test-kit";

const BRIEF = "%PDF-1.7 made-up brief 412";
const NOTES = "made-up notes 412, two levels down";
// The newest profile, inserted with made-up times in the future so it is the newest by both columns.
const NEWEST = "2031-01-02 03:04:05.678901+00";

let source: Scratch;
let gnupg: Gnupg;
let dir: string;

beforeAll(async () => {
  source = await makeScratch({ before0055: true });
  gnupg = makeGnupg();
  await source.sql`insert into public.profiles (id, full_name, email, created_at, updated_at)
    values ('user_newest_412', 'Newest', 'newest-412@example.test', ${NEWEST}::text::timestamptz, ${NEWEST}::text::timestamptz)`;
  putFile(source.folder, "org_a/request_1/brief.pdf", BRIEF, "application/pdf");
  putFile(source.folder, "org_a/request_2/deep/notes.txt", NOTES, "text/plain");
}, 60_000);
afterAll(async () => {
  await source?.drop();
  gnupg?.close();
});
beforeEach(() => {
  dir = makeWorkingFolder();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const exportSource = () => runKit(["export", "rehearsal", "--folder", source.folder], { dir, clipboard: [source.url], env: gnupg.env });

describe("export", () => {
  it("leaves only the encrypted archive and its manifest, and the archive opens by hand to the dump, every file and the manifest", async () => {
    const rows = Object.fromEntries(Object.entries(await tableDigests(source.sql)).map(([table, digest]) => [table, Number(digest.split(":")[0])]));

    const run = await exportSource();

    expect(run.code).toBe(0);
    const { folder, name, entries } = onlyExport(dir, "rehearsal");
    expect(name).toMatch(/^lane-rehearsal-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/);
    expect(entries).toEqual([`${name}.tar.gpg`, "manifest.json"]);
    // Nothing plain anywhere else in the working folder either.
    expect(Object.keys(snapshotFolder(dir)).sort()).toEqual([`rehearsal/${name}/${name}.tar.gpg`, `rehearsal/${name}/manifest.json`, "rehearsal/steps.log"]);
    const archive = readFileSync(path.join(folder, `${name}.tar.gpg`));
    expect(archive.includes(BRIEF)).toBe(false);

    const opened = openExport(folder, gnupg);
    try {
      expect(Object.keys(snapshotFolder(opened)).sort()).toEqual(["files/org_a/request_1/brief.pdf", "files/org_a/request_2/deep/notes.txt", "manifest.json", "public.dump"]);
      expect(readFileSync(path.join(opened, "files/org_a/request_2/deep/notes.txt"), "utf8")).toBe(NOTES);
      const inside = JSON.parse(readFileSync(path.join(opened, "manifest.json"), "utf8"));
      const beside = JSON.parse(readFileSync(path.join(folder, "manifest.json"), "utf8"));
      expect(beside).toEqual({ ...inside, archive: { file: `${name}.tar.gpg`, sha256: sha256(archive), bytes: archive.length } });
      expect(inside).toMatchObject({
        environment: "rehearsal",
        latestMigration: "0054",
        dump: { file: "public.dump", sha256: sha256(readFileSync(path.join(opened, "public.dump"))) },
        files: [
          { path: "org_a/request_1/brief.pdf", size: BRIEF.length, contentType: "application/pdf", sha256: sha256(BRIEF) },
          { path: "org_a/request_2/deep/notes.txt", size: NOTES.length, contentType: "text/plain", sha256: sha256(NOTES) },
        ],
      });
      expect(Object.fromEntries(Object.entries(inside.tables).map(([table, summary]) => [table, (summary as { rows: number }).rows]))).toEqual(rows);
      expect(inside.tables.profiles).toEqual({ rows: rows.profiles, newestCreatedAt: NEWEST, newestUpdatedAt: NEWEST });
      // A table holds only the timestamps it has.
      expect(Object.keys(inside.tables.same_problem_members)).toEqual(["rows"]);
      expect(Object.keys(inside.tables.comments)).toEqual(["rows", "newestCreatedAt"]);
      // A custom-format dump of public, grants included.
      const listed = execFileSync("pg_restore", ["--list", path.join(opened, "public.dump")], { encoding: "utf8" });
      expect(listed).toMatch(/Format: CUSTOM/);
      expect(listed).toMatch(/ TABLE DATA public profiles /);
      expect(listed).toMatch(/ ACL public /);
      const takenAt = new Date(inside.takenAt);
      expect(inside.deleteBy).toBe(new Date(takenAt.getTime() + 28 * 86_400_000).toISOString().slice(0, 10));
    } finally {
      rmSync(path.dirname(opened), { recursive: true, force: true });
    }

    const [line] = stepLog(dir, "rehearsal");
    expect(line).toMatchObject({ step: "export", result: "ok", export: name, counts: { tables: rows, files: 2 }, sha256: { archive: sha256(archive) } });
    expect(run.stdout).toContain(`Archive SHA256: ${sha256(archive)}`);
    const log = readFileSync(path.join(dir, "rehearsal", "steps.log"), "utf8");
    for (const output of [run.stdout, run.stderr, log]) {
      expect(output).not.toContain(MADE_UP_PASSPHRASE);
      expect(output).not.toContain(MADE_UP_PASSWORD);
    }
  }, 60_000);
});

const rehearseSource = (env: Readonly<Record<string, string>> = gnupg.env) => runKit(["rehearse", "rehearsal"], { dir, clipboard: [localServerUrl()], env });
const MIGRATION_0055 = path.resolve(__dirname, "../../src/db/migrations/0055_better_auth.sql");

/** The throwaway copy a rehearsal named, whether that database is still there, and anything left beside the export. */
async function leftBehind(stdout: string): Promise<{ copy: string; database: boolean; plain: string[] }> {
  const copy = /^Throwaway copy: (lane_rehearsal_kit_\w+)/m.exec(stdout)?.[1] ?? "";
  const plain = Object.keys(snapshotFolder(dir)).filter((file) => !/^rehearsal\/(steps\.log|lane-rehearsal-[^/]+\/(lane-rehearsal-[^/]+\.tar\.gpg|manifest\.json))$/.test(file));
  return { copy, database: await databaseExists(source.sql, copy), plain };
}

/** Changes the export as a test needs, then seals it again so that only that change is wrong with it. */
async function alterExport(change: (opened: string, manifest: Record<string, unknown>) => void | Promise<void>): Promise<void> {
  const { folder } = onlyExport(dir, "rehearsal");
  const opened = openExport(folder, gnupg);
  const manifestFile = path.join(opened, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  await change(opened, manifest);
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  sealExport(folder, opened, gnupg);
}

describe("rehearse", () => {
  it("restores the export into a throwaway copy that matches every count and checksum, brings the copy to 0055, and drops it", async () => {
    expect((await exportSource()).code).toBe(0);
    const { name, folder } = onlyExport(dir, "rehearsal");
    const record = JSON.parse(readFileSync(path.join(folder, "manifest.json"), "utf8"));

    const run = await rehearseSource();

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Rehearse: ok/);
    expect(await leftBehind(run.stdout)).toEqual({ copy: expect.stringMatching(/^lane_rehearsal_kit_/), database: false, plain: [] });
    const rows = Object.fromEntries(Object.entries(record.tables).map(([table, summary]) => [table, (summary as { rows: number }).rows]));
    expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({
      step: "rehearse",
      result: "ok",
      export: name,
      counts: { tables: rows, files: 2, copyMigration: "0055" },
      sha256: { archive: record.archive.sha256, dump: record.dump.sha256, migration: sha256(readFileSync(MIGRATION_0055)) },
    });
    const log = readFileSync(path.join(dir, "rehearsal", "steps.log"), "utf8");
    for (const output of [run.stdout, run.stderr, log]) {
      expect(output).not.toContain(MADE_UP_PASSPHRASE);
      expect(output).not.toContain(MADE_UP_PASSWORD);
    }
  }, 60_000);

  it.each([
    {
      change: "a changed byte in one exported file",
      alter: (opened: string) => {
        const file = path.join(opened, "files/org_a/request_1/brief.pdf");
        const bytes = readFileSync(file);
        bytes[3] ^= 1;
        writeFileSync(file, bytes);
      },
      reported: /STOP: org_a\/request_1\/brief\.pdf: a different SHA256/,
    },
    {
      change: "a missing row",
      alter: async (opened: string, manifest: Record<string, unknown>) => {
        const dump = path.join(opened, "public.dump");
        await rewriteDump(dump, (sql) => sql`delete from public.profiles where id = 'user_newest_412'`);
        manifest.dump = { file: "public.dump", sha256: sha256(readFileSync(dump)), bytes: readFileSync(dump).length };
      },
      reported: /STOP: profiles: \d+ rows in the export, \d+ now/,
    },
  ])("fails on $change, and still drops the copy", async ({ alter, reported }) => {
    expect((await exportSource()).code).toBe(0);
    await alterExport(alter);

    const run = await rehearseSource();

    expect(run.code).toBe(1);
    expect(run.stdout).toMatch(reported);
    expect(run.stdout).toMatch(/Rehearse: stop/);
    expect(await leftBehind(run.stdout)).toEqual({ copy: expect.stringMatching(/^lane_rehearsal_kit_/), database: false, plain: [] });
    expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "rehearse", result: "stop" });
  }, 60_000);

  it("drops the copy when the restore itself fails", async () => {
    expect((await exportSource()).code).toBe(0);
    await alterExport((opened, manifest) => {
      writeFileSync(path.join(opened, "public.dump"), "not a dump");
      manifest.dump = { file: "public.dump", sha256: sha256("not a dump"), bytes: 10 };
    });

    const run = await rehearseSource();

    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/FAILED: pg_restore failed/);
    expect(await leftBehind(run.stdout)).toEqual({ copy: expect.stringMatching(/^lane_rehearsal_kit_/), database: false, plain: [] });
    expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "rehearse", result: "failed" });
  }, 60_000);

  it("gives the same result on a rerun, as export does", async () => {
    const exports = [await exportSource(), await exportSource()];
    const rehearsals = [await rehearseSource(), await rehearseSource()];

    expect([...exports, ...rehearsals].map((run) => run.code)).toEqual([0, 0, 0, 0]);
    const names = readdirSync(path.join(dir, "rehearsal")).filter((entry) => entry !== "steps.log").sort();
    expect(names).toHaveLength(2);
    // Each export has its own time and encryption; what it holds is the same.
    const held = names.map((name) => {
      const { environment, latestMigration, tables, files } = JSON.parse(readFileSync(path.join(dir, "rehearsal", name, "manifest.json"), "utf8"));
      return { environment, latestMigration, tables, files };
    });
    expect(held[1]).toEqual(held[0]);
    const [first, second] = stepLog(dir, "rehearsal").filter((line) => line.step === "rehearse");
    expect(first).toMatchObject({ result: "ok", export: names[1] });
    expect({ ...second, at: first.at }).toEqual(first);
  }, 120_000);

  it("stops before restoring anything when the archive changed after it was exported", async () => {
    expect((await exportSource()).code).toBe(0);
    const { folder, name } = onlyExport(dir, "rehearsal");
    appendFileSync(path.join(folder, `${name}.tar.gpg`), "x");

    const run = await rehearseSource();

    expect(run.code).toBe(1);
    expect(run.stdout).toMatch(/STOP: The archive's SHA256 isn't the one exported/);
    expect(run.stdout).not.toMatch(/Throwaway copy:/);
    expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "rehearse", result: "stop" });
  }, 60_000);
});
