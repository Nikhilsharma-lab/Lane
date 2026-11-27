// #412: `check-writes`, run as the runbook runs it: after export, rehearse and apply, the target must still hold
// exactly what the export holds. Any write since is a stop that sends Nikhil back to export and rehearse again.
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localServerUrl, makeGnupg, makeScratch, makeWorkingFolder, putFile, runKit, snapshotFolder, stepLog, tableDigests, type Gnupg, type Scratch } from "./test-kit";

let scratch: Scratch;
let gnupg: Gnupg;
let dir: string;

beforeAll(async () => {
  scratch = await makeScratch({ before0055: true });
  gnupg = makeGnupg();
  dir = makeWorkingFolder();
  putFile(scratch.folder, "org_a/request_1/brief.pdf", "%PDF made-up 412", "application/pdf");
  // As the runbook goes: export, rehearse, then 0055 on the target, which adds empty tables the export doesn't have.
  expect((await runKit(["export", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [scratch.url], env: gnupg.env })).code).toBe(0);
  expect((await runKit(["rehearse", "rehearsal"], { dir, clipboard: [localServerUrl()], env: gnupg.env })).code).toBe(0);
  expect((await runKit(["apply", "rehearsal"], { dir, clipboard: [scratch.url] })).code).toBe(0);
}, 120_000);
afterAll(async () => {
  await scratch?.drop();
  gnupg?.close();
  rmSync(dir, { recursive: true, force: true });
});

const checkWrites = () => runKit(["check-writes", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [scratch.url] });
const REDO = /Check writes: stop\. Something was written after the export\. Export rehearsal again and rehearse it before going on\./;

describe("check-writes", () => {
  it("passes on a target unchanged since the export, again on a rerun, and writes nothing", async () => {
    const before = { rows: await tableDigests(scratch.sql), folder: snapshotFolder(scratch.folder) };

    const first = await checkWrites();
    const second = await checkWrites();

    for (const run of [first, second]) {
      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/Check writes: ok\. Nothing was written since lane-rehearsal-/);
    }
    expect(stepLog(dir, "rehearsal").slice(-2)).toEqual([
      expect.objectContaining({ step: "check-writes", result: "ok", counts: { differences: 0 } }),
      expect.objectContaining({ step: "check-writes", result: "ok", counts: { differences: 0 } }),
    ]);
    expect({ rows: await tableDigests(scratch.sql), folder: snapshotFolder(scratch.folder) }).toEqual(before);
  }, 60_000);

  it.each([
    {
      write: "a new row",
      make: async () => {
        await scratch.sql`insert into public.profiles (id, full_name, email) values ('user_late_412', 'Late', 'late-412@example.test')`;
        return async () => void (await scratch.sql`delete from public.profiles where id = 'user_late_412'`);
      },
      reported: /STOP: profiles: (\d+) rows in the export, \d+ now/,
    },
    {
      write: "an extra file",
      make: async () => {
        putFile(scratch.folder, "org_a/request_9/late.txt", "late");
        return async () => rmSync(path.join(scratch.folder, "org_a/request_9"), { recursive: true });
      },
      reported: /STOP: 1 files in the export, 2 now\nSTOP: not in the export: org_a\/request_9\/late\.txt/,
    },
    {
      // Last: the trigger's updated_at can't be put back.
      write: "a newer updated_at",
      make: async () => {
        await scratch.sql`update public.organizations set name = name || ' (renamed)' where id = (select min(id) from public.organizations)`;
        return async () => {};
      },
      reported: /STOP: organizations: newest updated_at \S+ \S+ in the export, \S+ \S+ now/,
    },
  ])("stops on $write, saying to export and rehearse again", async ({ make, reported }) => {
    const undo = await make();
    try {
      const run = await checkWrites();

      expect(run.code).toBe(1);
      expect(run.stdout).toMatch(reported);
      expect(run.stdout).toMatch(REDO);
      expect(stepLog(dir, "rehearsal").at(-1)).toMatchObject({ step: "check-writes", result: "stop", counts: { differences: expect.any(Number) } });
    } finally {
      await undo();
    }
  }, 60_000);
});
