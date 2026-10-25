/**
 * #215 (spec #195, seam 5: billing). Automatic seat counting through the billing module, against the real test
 * database, with Clerk (who is in the workspace, and as what) and the payment provider as stand-ins. Seats are
 * Admins plus Members, at least 3; Guests and Viewers are free. A paying workspace's seats follow its Clerk
 * memberships: an added seat is charged part-month from that day, a removed one lowers the next bill.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { recordingPaymentProvider } from "./payment-provider";

const clerk = vi.hoisted(() => ({ roles: {} as Record<string, string[]>, reads: 0, down: false }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async ({ organizationId }: { organizationId: string }) => {
        clerk.reads++;
        if (clerk.down) throw new Error("Clerk is unavailable");
        const data = (clerk.roles[organizationId] ?? []).map((role, i) => ({
          organization: { id: organizationId }, role, publicUserData: { userId: `${organizationId}_person_${i}`, identifier: `p${i}@seats.test` },
        }));
        return { data, totalCount: data.length };
      },
    },
  }),
}));

const PREFIX = "org_billing_seats_";
const [COUNTED, FREE, PAYING, SMALL, OFF, FAILS, DUE] = ["counted", "free", "paying", "small", "off", "fails", "due"].map((name) => PREFIX + name);
const url = new URL(process.env.DATABASE_URL!);
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  for (const id of [COUNTED, FREE, PAYING, SMALL, OFF, FAILS, DUE]) await connection`insert into organizations(id,name,slug) values (${id},'Seats',${id})`;
});
beforeEach(() => {
  vi.stubEnv("LANE_BILLING_ENFORCED", "1");
  clerk.reads = 0;
});
afterEach(() => { vi.unstubAllEnvs(); clerk.down = false; });
afterAll(async () => {
  // Paying here holds founding places; deleting the workspaces frees them for billing-payment.test.ts.
  await connection`delete from organizations where id like ${PREFIX + "%"}`;
  await connection.end();
});

const billing = () => import("./billing");
const team = (admins: number, members: number, free: string[] = []) => [...Array(admins).fill("org:admin"), ...Array(members).fill("org:member"), ...free];

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
    clerk.roles[COUNTED] = team(2, 3, ["org:guest", "org:viewer", "org:viewer"]);
    expect(await (await billing()).readSeats({ orgId: COUNTED })).toEqual({ adminsAndMembers: 5, paid: 5, billed: null });
  });

  it("never counts fewer than 3 paid seats", async () => {
    const { readSeats } = await billing();
    clerk.roles[SMALL] = team(1, 0, ["org:viewer", "org:viewer", "org:viewer"]);
    expect(await readSeats({ orgId: SMALL })).toEqual({ adminsAndMembers: 1, paid: 3, billed: null });
    clerk.roles[SMALL] = team(1, 2);
    expect(await readSeats({ orgId: SMALL })).toMatchObject({ adminsAndMembers: 3, paid: 3 });
  });

  it("pays for the seats counted at checkout, and knows that is what the provider bills", async () => {
    clerk.roles[PAYING] = team(1, 3, ["org:guest"]);
    const provider = await pay(PAYING);
    expect(provider.checkouts[0].seats).toBe(4);
    expect(await (await billing()).readSeats({ orgId: PAYING })).toEqual({ adminsAndMembers: 4, paid: 4, billed: 4 });
  });
});

describe("following membership changes", () => {
  it("charges an added seat part-month from that day, once", async () => {
    clerk.roles[PAYING] = team(1, 4, ["org:guest"]);
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
    clerk.roles[PAYING] = team(1, 3, ["org:guest", "org:viewer"]);
    const { followSeatChanges } = await billing();
    const provider = recordingPaymentProvider();
    expect(await followSeatChanges({ orgId: PAYING }, { provider })).toEqual({ kind: "removed", from: 5, to: 4 });
    expect(provider.seatChanges).toEqual([expect.objectContaining({ seats: 4, charge: "next_bill" })]);
  });

  it("bills at least 3 seats however few Admins and Members are left", async () => {
    clerk.roles[PAYING] = team(1, 0, ["org:viewer", "org:viewer", "org:viewer"]);
    const { followSeatChanges } = await billing();
    const provider = recordingPaymentProvider();
    expect(await followSeatChanges({ orgId: PAYING }, { provider })).toEqual({ kind: "removed", from: 4, to: 3 });
    // Adding Members up to the minimum costs nothing more.
    clerk.roles[PAYING] = team(1, 2, ["org:viewer"]);
    expect(await followSeatChanges({ orgId: PAYING }, { provider })).toEqual({ kind: "unchanged", seats: 3 });
    expect(provider.seatChanges.map((change) => change.seats)).toEqual([3]);
  });

  it("charges nothing for a workspace that doesn't pay", async () => {
    clerk.roles[FREE] = team(1, 6);
    const provider = recordingPaymentProvider();
    expect(await (await billing()).followSeatChanges({ orgId: FREE }, { provider })).toEqual({ kind: "not_paying" });
    expect(provider.seatChanges).toEqual([]);
  });

  it("does nothing at all while billing isn't enforced", async () => {
    clerk.roles[OFF] = team(1, 3);
    await pay(OFF);
    clerk.roles[OFF] = team(1, 5);
    vi.stubEnv("LANE_BILLING_ENFORCED", "");
    clerk.reads = 0;
    const provider = recordingPaymentProvider();
    expect(await (await billing()).followSeatChanges({ orgId: OFF }, { provider })).toEqual({ kind: "off" });
    expect(provider.seatChanges).toEqual([]);
    expect(clerk.reads).toBe(0);
  });

  it("tries again later when the provider or Clerk can't be reached, and never charges twice", async () => {
    clerk.roles[FAILS] = team(1, 2);
    await pay(FAILS);
    clerk.roles[FAILS] = team(2, 2);
    const { followSeatChanges, readSeats } = await billing();
    expect(await followSeatChanges({ orgId: FAILS }, { provider: recordingPaymentProvider({ failSeatChanges: true }) })).toEqual({ kind: "failed" });
    expect((await readSeats({ orgId: FAILS })).billed).toBe(3);
    clerk.down = true;
    expect(await followSeatChanges({ orgId: FAILS }, { provider: recordingPaymentProvider() })).toEqual({ kind: "failed" });
    clerk.down = false;
    const provider = recordingPaymentProvider();
    expect(await followSeatChanges({ orgId: FAILS }, { provider })).toEqual({ kind: "added", from: 3, to: 4 });
    expect(provider.seatChanges).toHaveLength(1);
  });

  it("checks a paying workspace's seats at most every 10 minutes when asked only if due", async () => {
    clerk.roles[DUE] = team(1, 2);
    await pay(DUE);
    clerk.roles[DUE] = team(1, 3);
    const { followSeatChanges } = await billing();
    const provider = recordingPaymentProvider();
    const start = new Date(Date.now() + 60_000);
    clerk.reads = 0;
    expect(await followSeatChanges({ orgId: DUE }, { provider, now: start, onlyIfDue: true })).toEqual({ kind: "added", from: 3, to: 4 });
    clerk.roles[DUE] = team(1, 4);
    expect(await followSeatChanges({ orgId: DUE }, { provider, now: new Date(start.getTime() + 5 * 60_000), onlyIfDue: true })).toEqual({ kind: "not_due" });
    expect(clerk.reads).toBe(1);
    expect(await followSeatChanges({ orgId: DUE }, { provider, now: new Date(start.getTime() + 11 * 60_000), onlyIfDue: true })).toEqual({ kind: "added", from: 4, to: 5 });
    // A change Lane makes itself is followed straight away.
    clerk.roles[DUE] = team(1, 5);
    expect(await followSeatChanges({ orgId: DUE }, { provider, now: new Date(start.getTime() + 12 * 60_000) })).toEqual({ kind: "added", from: 5, to: 6 });
  });
});
