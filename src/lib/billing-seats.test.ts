/**
 * #215 (spec #195, seam 5: billing). Automatic seat counting through the billing module, against the real test
 * database and its member rows, with the payment provider as a stand-in. Seats are
 * Admins plus Members, at least 3; Guests and Viewers are free. A paying workspace's seats follow its
 * memberships: an added seat is charged part-month from that day, a removed one lowers the next bill.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMembers } from "@/test/member-fixtures";
import { requireTestDatabase } from "@/test/test-database";
import { queryCounter } from "@/db";
import { recordingPaymentProvider } from "./payment-provider";

/** The member rows can't be read, for as long as a test says so. */
const roster = vi.hoisted(() => ({ down: false }));
vi.mock("./workspace-roster", async (original) => {
  const real = await original<typeof import("./workspace-roster")>();
  return { ...real, workspaceRoster: async (orgId: string) => { if (roster.down) throw new Error("The members can't be read"); return real.workspaceRoster(orgId); } };
});

const PREFIX = "org_billing_seats_";
const [COUNTED, FREE, PAYING, SMALL, OFF, FAILS, DUE] = ["counted", "free", "paying", "small", "off", "fails", "due"].map((name) => PREFIX + name);
const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  for (const id of [COUNTED, FREE, PAYING, SMALL, OFF, FAILS, DUE]) await connection`insert into organizations(id,name,slug) values (${id},'Seats',${id})`;
});
beforeEach(() => vi.stubEnv("LANE_BILLING_ENFORCED", "1"));
afterEach(() => { vi.unstubAllEnvs(); roster.down = false; });
afterAll(async () => {
  // Paying here holds founding places; deleting the workspaces frees them for billing-payment.test.ts.
  await connection`delete from organizations where id like ${PREFIX + "%"}`;
  await connection`delete from profiles where id like ${PREFIX + "%"}`;
  await connection.end();
});

const billing = () => import("./billing");
/** Makes the workspace's only members this many Admins and Members, and anyone else by role. */
const team = (orgId: string, admins: number, members: number, others: string[] = []) => {
  const roles: string[] = [...Array(admins).fill("admin"), ...Array(members).fill("member"), ...others];
  return setMembers(orgId, Object.fromEntries(roles.map((role, i) => [`${orgId}_person_${i}`, role])));
};

/** Pays for `orgId` through the stand-in's hosted checkout, for the seats counted now. */
async function pay(orgId: string, provider = recordingPaymentProvider()) {
  const { readSeats, recordPaymentEvent, startCheckout } = await billing();
  const { paid } = await readSeats({ orgId });
  const started = await startCheckout({ orgId }, { period: "monthly", seats: paid, email: "admin@seats.test", origin: "https://lane.test" }, provider);
  if (!started.ok) throw Error(started.error);
  const reading = await provider.readEvent(provider.complete(), provider.headers(), new Date());
  if (!reading.ok || !reading.event) throw Error("No event");
  await recordPaymentEvent(reading.event);
  return provider;
}

describe("counting seats", () => {
  it("counts Admins and Members as paid seats, and Guests and Viewers as free", async () => {
    await team(COUNTED, 2, 3, ["guest", "viewer", "viewer"]);
    expect(await (await billing()).readSeats({ orgId: COUNTED })).toEqual({ adminsAndMembers: 5, paid: 5, billed: null });
  });

  it("gives no seat to a role Lane doesn't know", async () => {
    await team(COUNTED, 2, 3, ["owner", "org:admin", "admin,member"]);
    expect(await (await billing()).readSeats({ orgId: COUNTED })).toMatchObject({ adminsAndMembers: 5, paid: 5 });
  });

  it("never counts fewer than 3 paid seats", async () => {
    const { readSeats } = await billing();
    await team(SMALL, 1, 0, ["viewer", "viewer", "viewer"]);
    expect(await readSeats({ orgId: SMALL })).toEqual({ adminsAndMembers: 1, paid: 3, billed: null });
    await team(SMALL, 1, 2);
    expect(await readSeats({ orgId: SMALL })).toMatchObject({ adminsAndMembers: 3, paid: 3 });
  });

  it("pays for the seats counted at checkout, and knows that is what the provider bills", async () => {
    await team(PAYING, 1, 3, ["guest"]);
    const provider = await pay(PAYING);
    expect(provider.checkouts[0].seats).toBe(4);
    expect(await (await billing()).readSeats({ orgId: PAYING })).toEqual({ adminsAndMembers: 4, paid: 4, billed: 4 });
  });
});

describe("following membership changes", () => {
  it("charges an added seat part-month from that day, once", async () => {
    await team(PAYING, 1, 4, ["guest"]);
    const { followSeatChanges, readSeats } = await billing();
    const provider = recordingPaymentProvider();
    const at = new Date("2026-11-10T09:00:00Z");
    expect(await followSeatChanges({ orgId: PAYING }, { provider, now: at })).toEqual({ kind: "added", from: 4, to: 5 });
    expect(provider.seatChanges).toEqual([{ subscriptionId: expect.stringContaining(PAYING), seats: 5, charge: "part_month_now", at }]);
    expect(await readSeats({ orgId: PAYING })).toMatchObject({ paid: 5, billed: 5 });
    expect(await followSeatChanges({ orgId: PAYING }, { provider })).toEqual({ kind: "unchanged", seats: 5 });
    expect(provider.seatChanges).toHaveLength(1);
  });

  it("lowers the next bill when a seat is removed or a Member is made a Viewer, with nothing charged now", async () => {
    await team(PAYING, 1, 3, ["guest", "viewer"]);
    const { followSeatChanges } = await billing();
    const provider = recordingPaymentProvider();
    expect(await followSeatChanges({ orgId: PAYING }, { provider })).toEqual({ kind: "removed", from: 5, to: 4 });
    expect(provider.seatChanges).toEqual([expect.objectContaining({ seats: 4, charge: "next_bill" })]);
  });

  it("bills at least 3 seats however few Admins and Members are left", async () => {
    await team(PAYING, 1, 0, ["viewer", "viewer", "viewer"]);
    const { followSeatChanges } = await billing();
    const provider = recordingPaymentProvider();
    expect(await followSeatChanges({ orgId: PAYING }, { provider })).toEqual({ kind: "removed", from: 4, to: 3 });
    // Adding Members up to the minimum costs nothing more.
    await team(PAYING, 1, 2, ["viewer"]);
    expect(await followSeatChanges({ orgId: PAYING }, { provider })).toEqual({ kind: "unchanged", seats: 3 });
    expect(provider.seatChanges.map((change) => change.seats)).toEqual([3]);
  });

  it("charges nothing for a workspace that doesn't pay", async () => {
    await team(FREE, 1, 6);
    const provider = recordingPaymentProvider();
    expect(await (await billing()).followSeatChanges({ orgId: FREE }, { provider })).toEqual({ kind: "not_paying" });
    expect(provider.seatChanges).toEqual([]);
  });

  it("does nothing at all while billing isn't enforced", async () => {
    await team(OFF, 1, 3);
    await pay(OFF);
    await team(OFF, 1, 5);
    vi.stubEnv("LANE_BILLING_ENFORCED", "");
    const provider = recordingPaymentProvider();
    const { followSeatChanges } = await billing();
    const { result, statements } = await queryCounter.measure(() => followSeatChanges({ orgId: OFF }, { provider }));
    expect(result).toEqual({ kind: "off" });
    expect(statements).toBe(0);
    expect(provider.seatChanges).toEqual([]);
  });

  it("tries again later when the provider can't be reached or the members can't be read, and never charges twice", async () => {
    await team(FAILS, 1, 2);
    await pay(FAILS);
    await team(FAILS, 2, 2);
    const { followSeatChanges, readSeats } = await billing();
    expect(await followSeatChanges({ orgId: FAILS }, { provider: recordingPaymentProvider({ failSeatChanges: true }) })).toEqual({ kind: "failed" });
    expect((await readSeats({ orgId: FAILS })).billed).toBe(3);
    roster.down = true;
    expect(await followSeatChanges({ orgId: FAILS }, { provider: recordingPaymentProvider() })).toEqual({ kind: "failed" });
    roster.down = false;
    const provider = recordingPaymentProvider();
    expect(await followSeatChanges({ orgId: FAILS }, { provider })).toEqual({ kind: "added", from: 3, to: 4 });
    expect(provider.seatChanges).toHaveLength(1);
  });

  it("checks a paying workspace's seats at most every 10 minutes when asked only if due", async () => {
    await team(DUE, 1, 2);
    await pay(DUE);
    await team(DUE, 1, 3);
    const { followSeatChanges } = await billing();
    const provider = recordingPaymentProvider();
    const start = new Date(Date.now() + 60_000);
    expect(await followSeatChanges({ orgId: DUE }, { provider, now: start, onlyIfDue: true })).toEqual({ kind: "added", from: 3, to: 4 });
    await team(DUE, 1, 4);
    expect(await followSeatChanges({ orgId: DUE }, { provider, now: new Date(start.getTime() + 5 * 60_000), onlyIfDue: true })).toEqual({ kind: "not_due" });
    expect(provider.seatChanges).toHaveLength(1);
    expect(await followSeatChanges({ orgId: DUE }, { provider, now: new Date(start.getTime() + 11 * 60_000), onlyIfDue: true })).toEqual({ kind: "added", from: 4, to: 5 });
    // A change Lane makes itself is followed straight away.
    await team(DUE, 1, 5);
    expect(await followSeatChanges({ orgId: DUE }, { provider, now: new Date(start.getTime() + 12 * 60_000) })).toEqual({ kind: "added", from: 5, to: 6 });
  });
});
