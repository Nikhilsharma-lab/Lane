/**
 * #206 seam 1: the delivery preference. Each person chooses, per workspace, whether Needs-you items reach them
 * by Email (the default) or not at all; Slack DM is covered with Slack (#207, slack-actions.test.ts). Identity and role come from the
 * session through the shared guards. Real database, mocked Clerk session.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";

const ORG = "org_delivery_preference";
const OTHER = "org_delivery_preference_other";
const PERSON = "delivery_preference_person";
const session = vi.hoisted(() => ({ userId: "delivery_preference_person" as string | null, orgId: "org_delivery_preference", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ ...session }) }));

const url = new URL(process.env.DATABASE_URL!);
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Preference','delivery-preference'), (${OTHER},'Other','delivery-preference-other')`;
  await connection`insert into profiles(id,full_name,email) values (${PERSON},'Person','person@delivery-preference.test')`;
});
afterEach(() => Object.assign(session, { userId: PERSON, orgId: ORG, orgRole: "org:member" }));
afterAll(async () => {
  await connection`delete from organizations where id in (${ORG}, ${OTHER})`;
  await connection`delete from profiles where id = ${PERSON}`;
  await connection.end();
});

const choose = async (channel: unknown, orgId = ORG) => (await import("./delivery-actions")).updateDeliveryPreference({ channel } as never, { orgId });
const choiceIn = async (orgId: string) => (await import("@/lib/delivery-preferences")).readDeliveryChoice({ orgId, userId: PERSON });

describe("choosing how Needs-you items reach you", () => {
  it("starts at Email, with nothing saved", async () => {
    expect(await choiceIn(ORG)).toBe("email");
  });

  it("saves Off, then Email again, for the signed-in person in this workspace only", async () => {
    expect(await choose("off")).toEqual({ success: true });
    expect(await choiceIn(ORG)).toBe("off");
    expect(await choiceIn(OTHER)).toBe("email");
    expect(await choose("email")).toEqual({ success: true });
    expect(await choiceIn(ORG)).toBe("email");
    expect(await connection`select user_id, channel from delivery_preferences where org_id = ${ORG}`).toEqual([{ user_id: PERSON, channel: "email" }]);
  });

  it("works the same for an Admin", async () => {
    session.orgRole = "org:admin";
    expect(await choose("off")).toEqual({ success: true });
    expect(await choiceIn(ORG)).toBe("off");
    await choose("email");
  });

  it("does not offer Slack DM while Slack isn't connected, nor anything else", async () => {
    expect(await choose("slack")).toEqual({ error: "Slack isn't connected to this workspace. Choose Email or Off, or ask an Admin to connect Slack." });
    expect(await choose("sms")).toEqual({ error: "Choose Email, Slack DM or Off." });
    expect(await choiceIn(ORG)).toBe("email");
  });

  it("refuses a Guest, who has no Needs-you items to deliver", async () => {
    session.orgRole = "org:guest";
    expect(await choose("off")).toEqual({ error: "Guests get Lane email only about their own submissions, so there is nothing to choose here." });
    expect(await choiceIn(ORG)).toBe("email");
  });

  it("refuses a workspace that isn't the session's, and a signed-out caller", async () => {
    expect(await choose("off", OTHER)).toMatchObject({ error: expect.any(String) });
    expect(await choiceIn(OTHER)).toBe("email");
    session.userId = null;
    expect(await choose("off")).toMatchObject({ error: expect.any(String) });
    expect(await choiceIn(ORG)).toBe("email");
  });
});
