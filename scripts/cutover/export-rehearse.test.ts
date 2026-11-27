// #412: `export` and `rehearse`, run as the runbook runs them, against a scratch database at 0054 and a scratch
// folder standing in for request-attachments. Each test checks what is in the export folder, the throwaway copy and
// the step log, never how the kit got there.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  MADE_UP_PASSPHRASE,
  MADE_UP_PASSWORD,
  makeGnupg,
  makeScratch,
  makeWorkingFolder,
  onlyExport,
  openExport,
  putFile,
  runKit,
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
