/**
 * #216, migration 0049: what the database holds about a plan the payment provider changed. Only a paying plan can
 * have a day it ends (a cancellation that runs to the end of its period); a lapsed or free one has none.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireTestDatabase } from "@/test/test-database";

const ORG = "org_billing_subscription_schema";
const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Subscription schema',${ORG})`;
  await connection`insert into workspace_billing(org_id) values (${ORG})`;
});
afterAll(async () => {
  await connection`delete from organizations where id = ${ORG}`;
  await connection.end();
});

describe("a plan's end", () => {
  it("is held for a paying plan, with when the provider last changed it", async () => {
    await connection`update workspace_billing set plan_state = 'paying', plan_ends_at = now() + interval '30 days', subscription_changed_at = now() where org_id = ${ORG}`;
    const [row] = await connection`select plan_ends_at, subscription_changed_at from workspace_billing where org_id = ${ORG}`;
    expect(row.plan_ends_at).toBeInstanceOf(Date);
    expect(row.subscription_changed_at).toBeInstanceOf(Date);
  });

  it("is refused for a plan that isn't paying", async () => {
    await expect(connection`update workspace_billing set plan_state = 'lapsed' where org_id = ${ORG}`).rejects.toMatchObject({ code: "23514" });
    await expect(connection`update workspace_billing set plan_state = 'free' where org_id = ${ORG}`).rejects.toMatchObject({ code: "23514" });
    await connection`update workspace_billing set plan_state = 'lapsed', plan_ends_at = null where org_id = ${ORG}`;
  });
});
