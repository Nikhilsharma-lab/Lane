/**
 * #214, migration 0047: the database's own rules for paying. Only the first 50 workspaces to pay get the founding
 * discount: a workspace holds a founding place while its checkout is open (a reservation) and keeps it for good
 * once it pays with it. A 51st place is refused, an expired reservation frees its place, and a founding start is
 * set once.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";

const PREFIX = "org_founding_schema_";
const ORGS = Array.from({ length: 52 }, (_, i) => `${PREFIX}${String(i).padStart(2, "0")}`);
const url = new URL(process.env.DATABASE_URL!);
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  // This file needs all 50 places: every other test file gives back the places it takes.
  const [{ taken }] = await connection`select count(*)::int as taken from workspace_billing where founding_starts_at is not null or founding_reserved_until > now()`;
  if (taken > 0) throw Error("Founding places already taken outside this file");
  for (const id of ORGS) {
    await connection`insert into organizations(id,name,slug) values (${id},'Founding schema',${id})`;
    await connection`insert into workspace_billing(org_id) values (${id})`;
  }
});
afterAll(async () => {
  await connection`delete from organizations where id like ${PREFIX + "%"}`;
  await connection.end();
});

const reserve = (org: string, until = "now() + interval '1 hour'") =>
  connection.unsafe(`update workspace_billing set founding_reserved_until = ${until} where org_id = $1`, [org]);
const start = (org: string) => connection`update workspace_billing set founding_starts_at = now(), plan_state = 'paying', billing_period = 'yearly' where org_id = ${org}`;

describe("the founding discount places", () => {
  it("gives 50 places, counting open reservations and paid ones, and refuses a 51st", async () => {
    for (const org of ORGS.slice(0, 30)) await start(org);
    for (const org of ORGS.slice(30, 50)) await reserve(org);
    await expect(reserve(ORGS[50])).rejects.toMatchObject({ code: "23514" });
    await expect(start(ORGS[50])).rejects.toMatchObject({ code: "23514" });
  });

  it("lets a workspace renew its own reservation, and frees a place once a reservation expires", async () => {
    await reserve(ORGS[49], "now() + interval '2 hours'");
    await reserve(ORGS[49], "now() - interval '1 minute'");
    await reserve(ORGS[50]);
    await expect(reserve(ORGS[51])).rejects.toMatchObject({ code: "23514" });
  });

  it("starts a founding discount once", async () => {
    await expect(connection`update workspace_billing set founding_starts_at = now() + interval '1 day' where org_id = ${ORGS[0]}`).rejects.toThrow("founding discount starts once");
    await expect(connection`update workspace_billing set founding_starts_at = null where org_id = ${ORGS[0]}`).rejects.toThrow("founding discount starts once");
  });

  it("knows only yearly and monthly billing", async () => {
    await expect(connection`update workspace_billing set billing_period = 'weekly' where org_id = ${ORGS[51]}`).rejects.toMatchObject({ code: "23514" });
  });
});

describe("billed seats (#215, migration 0048)", () => {
  it("bills at least 3 seats, and knows none until the workspace pays", async () => {
    const [row] = await connection`select billed_seats, seats_checked_at from workspace_billing where org_id = ${ORGS[51]}`;
    expect(row).toEqual({ billed_seats: null, seats_checked_at: null });
    await connection`update workspace_billing set billed_seats = 3, seats_checked_at = now() where org_id = ${ORGS[51]}`;
    await expect(connection`update workspace_billing set billed_seats = 2 where org_id = ${ORGS[51]}`).rejects.toMatchObject({ code: "23514" });
  });
});
