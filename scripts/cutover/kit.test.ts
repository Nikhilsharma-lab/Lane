// The cutover kit's seam (#410 Testing Decisions): each test runs a subcommand the way the runbook does, against a
// scratch database and folder, and checks what changed in the database, the folder and the step log.
import { rmSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeScratch, makeWorkingFolder, putFile, runKit, stepLog, type Scratch } from "./test-kit";

let scratch: Scratch;
let dir: string;

beforeAll(async () => {
  scratch = await makeScratch();
  putFile(scratch.folder, "org_a/request_1/brief.pdf", "%PDF one");
  putFile(scratch.folder, "org_a/request_2/deep/notes.txt", "two");
});
afterAll(async () => scratch?.drop());
beforeEach(() => {
  dir = makeWorkingFolder();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("state", () => {
  it("reports the migrations, every public table's rows and the folder's files, and logs them", async () => {
    // Copied from a dashboard with a character nobody sees on its end (2026-10-26).
    const run = await runKit(["state", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [`${scratch.url}\u2028\n`] });

    expect(run.code).toBe(0);
    expect(run.clipboard).toBe("");
    expect(run.stdout).toMatch(/Latest migration: 0055/);
    expect(run.stdout).toMatch(/^ {2}profiles +11$/m);
    expect(run.stdout).toMatch(/^ {2}workspace_billing +12$/m);
    expect(run.stdout).toMatch(/Files in request-attachments: 2/);
    const [line] = stepLog(dir, "rehearsal");
    expect(line).toMatchObject({
      environment: "rehearsal",
      step: "state",
      result: "ok",
      counts: { files: 2, caseDuplicateEmails: 0, stripeIds: 0, slackIds: 0, tables: expect.objectContaining({ profiles: 11, workspace_billing: 12 }) },
    });
    expect(new Date(line.at as string).toISOString()).toBe(line.at);
  });
});
