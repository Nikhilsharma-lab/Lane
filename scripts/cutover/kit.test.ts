// The cutover kit's seam (#410 Testing Decisions): each test runs a subcommand the way the runbook does, against a
// scratch database and folder, and checks what changed in the database, the folder and the step log.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MADE_UP_PASSWORD, makeScratch, makeWorkingFolder, putFile, runKit, snapshotFolder, stepLog, tableRows, type Scratch } from "./test-kit";

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
  it.each([
    {
      stop: "two profiles emails that differ only in case",
      message: /STOP: profiles has 1 email\(s\) that differ only in case[\s\S]*case\.probe@example\.test \(2 profiles\)/,
      counts: { caseDuplicateEmails: 1, stripeIds: 0, slackIds: 0 },
      arrange: async (sql: Scratch["sql"]) => {
        await sql`insert into public.profiles (id, full_name, email) values
          ('user_case_probe_1', 'Case probe', 'Case.Probe@example.test'), ('user_case_probe_2', 'Case probe', 'case.probe@example.test')`;
        return async () => void (await sql`delete from public.profiles where id like 'user_case_probe_%'`);
      },
    },
    {
      stop: "a Stripe ID in workspace_billing",
      message: /STOP: workspace_billing holds a Stripe ID for workspace\(s\) org_agreement_legacy/,
      counts: { caseDuplicateEmails: 0, stripeIds: 1, slackIds: 0 },
      arrange: async (sql: Scratch["sql"]) => {
        await sql`update public.workspace_billing set provider_customer_id = 'cus_made_up_411' where org_id = 'org_agreement_legacy'`;
        return async () => void (await sql`update public.workspace_billing set provider_customer_id = null where org_id = 'org_agreement_legacy'`);
      },
    },
    {
      stop: "a Slack ID in slack_connections",
      message: /STOP: slack_connections holds a Slack ID for workspace\(s\) org_agreement_seats/,
      counts: { caseDuplicateEmails: 0, stripeIds: 0, slackIds: 1 },
      arrange: async (sql: Scratch["sql"]) => {
        await sql`insert into public.slack_connections (org_id, team_id, team_name, token_ciphertext, connected_by)
          values ('org_agreement_seats', 'T0MADEUP', 'Made up', 'v1:a:b:c', 'user_made_up')`;
        return async () => void (await sql`delete from public.slack_connections where org_id = 'org_agreement_seats'`);
      },
    },
  ])("stops the runbook on $stop", async ({ message, counts, arrange }) => {
    const undo = await arrange(scratch.sql);
    try {
      const run = await runKit(["state", "rehearsal", "--folder", scratch.folder], { dir, clipboard: [scratch.url] });

      expect(run.code).toBe(1);
      expect(run.stdout).toMatch(message);
      expect(run.stdout).toMatch(/State: stop/);
      expect(stepLog(dir, "rehearsal")).toEqual([expect.objectContaining({ step: "state", result: "stop", counts: expect.objectContaining(counts) })]);
    } finally {
      await undo();
    }
  });
});

// Made-up values in the shapes Supabase gives. None of them is real, and none may be printed.
const STAGING = "jznepeqghjixcrpuddym";
const PRODUCTION = "tcfwabpoiydvfqxhtkur";
const SECRET = "made-up-hosted-password-411";
const pooler = (ref: string, port = 5432) => `postgresql://postgres.${ref}:${SECRET}@aws-0-ap-northeast-1.pooler.supabase.com:${port}/postgres`;
const jwt = (claims: object) => ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "made-up-signature-411"].join(".");

describe("refusals", () => {
  it.each([
    { refusal: "production's database named as staging", args: ["state", "staging"], clipboard: [pooler(PRODUCTION)], message: /That is Lane production's database/ },
    { refusal: "staging's direct connection named as production", args: ["state", "production"], clipboard: [`postgresql://postgres:${SECRET}@db.${STAGING}.supabase.co:5432/postgres`], message: /That is Lane Staging's database/ },
    { refusal: "the transaction pooler", args: ["state", "staging"], clipboard: [pooler(STAGING, 6543)], message: /transaction pooler/ },
    { refusal: "a project that is neither", args: ["state", "staging"], clipboard: [pooler("abcdefghijklmnopqrst")], message: /isn't Lane Staging's database/ },
    { refusal: "a local database for staging", args: ["state", "staging"], clipboard: ["LOCAL_REHEARSAL"], message: /isn't Lane Staging's database/ },
    { refusal: "the shared local test database as a rehearsal", args: ["state", "rehearsal", "--folder", "FOLDER"], clipboard: ["LOCAL_LANE_TEST"], message: /throwaway local database named lane_rehearsal_/ },
    { refusal: "a local database that isn't a rehearsal one", args: ["state", "rehearsal", "--folder", "FOLDER"], clipboard: ["LOCAL_POSTGRES"], message: /throwaway local database named lane_rehearsal_/ },
    { refusal: "an empty connection string", args: ["state", "staging"], clipboard: ["  \n"], message: /no connection string/ },
    { refusal: "the [YOUR-PASSWORD] placeholder", args: ["state", "staging"], clipboard: [`postgresql://postgres.${STAGING}:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`], message: /placeholder/ },
    { refusal: "production's storage key for staging", args: ["state", "staging"], clipboard: [pooler(STAGING), jwt({ iss: "supabase", ref: PRODUCTION, role: "service_role" })], message: /That is Lane production's storage key/ },
    { refusal: "a publishable key for storage", args: ["state", "staging"], clipboard: [pooler(STAGING), "sb_publishable_made_up_411"], message: /isn't Lane Staging's Supabase secret key/ },
    { refusal: "a placeholder storage key", args: ["state", "staging"], clipboard: [pooler(STAGING), "[YOUR-SECRET-KEY]"], message: /placeholder/ },
    { refusal: "a rehearsal folder that isn't a throwaway one", args: ["state", "rehearsal", "--folder", "OTHER_FOLDER"], clipboard: [], message: /throwaway one named lane_rehearsal_/ },
    { refusal: "nothing copied before the input closed", args: ["state", "rehearsal", "--folder", "FOLDER"], clipboard: [], message: /input closed/ },
  ])("refuses $refusal, exiting non-zero and touching nothing", async ({ args, clipboard, message }) => {
    const localAt = (database: string) => Object.assign(new URL(scratch.url), { pathname: `/${database}` }).toString();
    const values: Record<string, string> = {
      LOCAL_REHEARSAL: scratch.url,
      LOCAL_LANE_TEST: localAt(new URL(process.env.DATABASE_URL!).pathname.slice(1)),
      LOCAL_POSTGRES: localAt("postgres"),
    };
    const otherFolder = path.join(dir, "attachments");
    mkdirSync(otherFolder);
    const folders: Record<string, string> = { FOLDER: scratch.folder, OTHER_FOLDER: otherFolder };
    // An earlier session's line in every log, which a refusal must leave as it was.
    for (const environment of ["staging", "production", "rehearsal"]) {
      mkdirSync(path.join(dir, environment));
      writeFileSync(path.join(dir, environment, "steps.log"), `{"at":"2026-11-27T00:00:00.000Z","environment":"${environment}","step":"state","result":"ok"}\n`);
    }
    const before = { rows: await tableRows(scratch.sql), folder: snapshotFolder(scratch.folder), dir: snapshotFolder(dir) };

    const run = await runKit(args.map((arg) => folders[arg] ?? arg), { dir, clipboard: clipboard.map((value) => values[value] ?? value) });

    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(message);
    expect(run.stderr).toMatch(/Nothing was done/);
    expect({ rows: await tableRows(scratch.sql), folder: snapshotFolder(scratch.folder), dir: snapshotFolder(dir) }).toEqual(before);
    for (const secret of [SECRET, MADE_UP_PASSWORD, "made-up-signature-411", "sb_publishable_made_up_411"]) {
      expect(run.stdout + run.stderr).not.toContain(secret);
    }
  });
});

describe("check-blanks", () => {
  it("passes when no profile image, workspace logo or workspace metadata holds a value", async () => {
    const run = await runKit(["check-blanks", "rehearsal"], { dir, clipboard: [scratch.url] });

    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Check blanks: ok/);
    expect(stepLog(dir, "rehearsal")).toEqual([
      expect.objectContaining({ environment: "rehearsal", step: "check-blanks", result: "ok", counts: { profileImages: 0, workspaceLogos: 0, workspaceMetadata: 0 } }),
    ]);
  });

  it.each([
    {
      column: "profiles.image",
      set: (sql: Scratch["sql"]) => sql`update public.profiles set image = 'https://lh3.googleusercontent.com/a/made-up' where id = (select min(id) from public.profiles)`,
      counts: { profileImages: 1, workspaceLogos: 0, workspaceMetadata: 0 },
    },
    {
      column: "organizations.logo",
      set: (sql: Scratch["sql"]) => sql`update public.organizations set logo = 'https://example.test/logo.png' where id = 'org_agreement_legacy'`,
      counts: { profileImages: 0, workspaceLogos: 1, workspaceMetadata: 0 },
    },
    {
      column: "organizations.metadata",
      set: (sql: Scratch["sql"]) => sql`update public.organizations set metadata = '' where id = 'org_agreement_legacy'`,
      counts: { profileImages: 0, workspaceLogos: 0, workspaceMetadata: 1 },
    },
  ])("fails when $column holds a value", async ({ column, set, counts }) => {
    await set(scratch.sql);
    try {
      const run = await runKit(["check-blanks", "rehearsal"], { dir, clipboard: [scratch.url] });

      expect(run.code).toBe(1);
      expect(run.stdout).toContain(`STOP: ${column} holds a value in 1 row`);
      expect(stepLog(dir, "rehearsal")).toEqual([expect.objectContaining({ step: "check-blanks", result: "stop", counts })]);
    } finally {
      await scratch.sql`update public.profiles set image = null`;
      await scratch.sql`update public.organizations set logo = null, metadata = null`;
    }
  });
});
