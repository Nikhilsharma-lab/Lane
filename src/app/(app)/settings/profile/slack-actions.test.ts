/**
 * #207 seam 1: connecting and disconnecting Slack, and the Slack DM choice that depends on it. An Admin connects
 * Slack once per workspace through Slack's standard install flow (out to Slack, back to `GET /api/slack/callback`)
 * and can disconnect it; nobody else can. Slack DM is a choice only while Slack is connected. Real database,
 * mocked Clerk session, and Slack answered by a stubbed `fetch`, so nothing reaches the network.
 */
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_ENDED } from "@/lib/auth-guard";
import { TEST_DATABASE_PATH } from "@/test/test-database";

const ORG = "org_slack_connect";
const OTHER = "org_slack_connect_other";
const ADMIN = "slack_connect_admin";
const MEMBER = "slack_connect_member";
const APP = "https://lane.example.test";
const TOKEN = "xoxb-7777-8888-connectedtoken";
const session = vi.hoisted(() => ({ userId: "slack_connect_admin" as string | null, orgId: "org_slack_connect", orgRole: "org:admin" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ ...session }) }));

const url = new URL(process.env.DATABASE_URL!);
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

/** What the stubbed Slack has been asked, and what it answers to the code exchange. */
const slack = { calls: [] as { url: string; body: string; headers: HeadersInit | undefined }[], exchange: { ok: true, token_type: "bot", access_token: TOKEN, team: { id: "T0ACME", name: "Acme Slack" } } as Record<string, unknown> };
const switchOn = () => {
  vi.stubEnv("LANE_SLACK_DELIVERY", "1");
  vi.stubEnv("SLACK_CLIENT_ID", "111.222");
  vi.stubEnv("SLACK_CLIENT_SECRET", "client-secret");
  vi.stubEnv("LANE_SLACK_TOKEN_KEY", randomKey);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP);
};
const randomKey = randomBytes(32).toString("base64");

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Acme','slack-connect'), (${OTHER},'Other','slack-connect-other')`;
  await connection`insert into profiles(id,full_name,email) values (${ADMIN},'Ada Admin','ada@slack-connect.test'), (${MEMBER},'Max Member','max@slack-connect.test')`;
});
beforeEach(() => {
  slack.calls = [];
  vi.stubGlobal("fetch", async (target: string, init: RequestInit = {}) => {
    slack.calls.push({ url: String(target), body: String(init.body ?? ""), headers: init.headers });
    const answer = String(target).endsWith("/oauth.v2.access") ? slack.exchange : String(target).endsWith("/auth.revoke") ? { ok: true, revoked: true } : { ok: false, error: "unknown_method" };
    return new Response(JSON.stringify(answer), { status: 200 });
  });
  switchOn();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Object.assign(session, { userId: ADMIN, orgId: ORG, orgRole: "org:admin" });
  await connection`delete from slack_connections where org_id in (${ORG}, ${OTHER})`;
  await connection`delete from delivery_preferences where org_id in (${ORG}, ${OTHER})`;
});
afterAll(async () => {
  await connection`delete from organizations where id in (${ORG}, ${OTHER})`;
  await connection`delete from profiles where id in (${ADMIN}, ${MEMBER})`;
  await connection.end();
});

const actions = () => import("./slack-actions");
const start = async (orgId = ORG) => (await actions()).startSlackConnect({}, { orgId });
const disconnect = async (orgId = ORG) => (await actions()).disconnectSlack({}, { orgId });
const callback = async (query: Record<string, string>) => {
  const { GET } = await import("@/app/api/slack/callback/route");
  return GET(new Request(`${APP}/api/slack/callback?${new URLSearchParams(query)}`));
};
const landing = (response: Response) => {
  const to = new URL(response.headers.get("location")!);
  return `${to.pathname}?${to.searchParams}`;
};
const stateOf = (result: Awaited<ReturnType<typeof start>>) => new URL((result as { url: string }).url).searchParams.get("state")!;
const connected = async (orgId = ORG) => (await import("@/lib/slack-connection")).readSlackConnection(orgId);
/** The Admin goes out to Slack, approves, and comes back. */
async function connectAsAdmin() {
  const state = stateOf(await start());
  return callback({ code: "c0de", state });
}

describe("connecting Slack", () => {
  it("sends an Admin to Slack's install page for this workspace, returning to Lane's callback", async () => {
    const result = await start();
    expect(result).toMatchObject({ ok: true });
    const to = new URL((result as { url: string }).url);
    expect(`${to.origin}${to.pathname}`).toBe("https://slack.com/oauth/v2/authorize");
    expect(to.searchParams.get("client_id")).toBe("111.222");
    expect(to.searchParams.get("redirect_uri")).toBe(`${APP}/api/slack/callback`);
    expect(slack.calls).toEqual([]);
  });

  it("connects once Slack sends the Admin back: the workspace, its Slack team and who connected it are kept", async () => {
    const response = await connectAsAdmin();
    expect(response.status).toBe(307);
    expect(landing(response)).toBe("/settings/profile?section=slack&slack=connected");
    expect(await connected()).toMatchObject({ teamName: "Acme Slack", connectedByName: "Ada Admin" });
    expect(await connected(OTHER)).toBeNull();
    expect(Object.fromEntries(new URLSearchParams(slack.calls[0].body))).toMatchObject({ code: "c0de", redirect_uri: `${APP}/api/slack/callback` });
  });

  it("stores the token encrypted: the saved row never holds Slack's token", async () => {
    await connectAsAdmin();
    const [row] = await connection`select token_ciphertext from slack_connections where org_id = ${ORG}`;
    expect(row.token_ciphertext).toMatch(/^v1:/);
    expect(JSON.stringify(row)).not.toContain(TOKEN);
    expect(JSON.stringify(row)).not.toContain("xoxb");
  });

  it("connecting again replaces the earlier connection", async () => {
    await connectAsAdmin();
    slack.exchange = { ...slack.exchange, team: { id: "T0NEW", name: "New Slack" } };
    await connectAsAdmin();
    expect(await connection`select team_id from slack_connections where org_id = ${ORG}`).toEqual([{ team_id: "T0NEW" }]);
    slack.exchange = { ...slack.exchange, team: { id: "T0ACME", name: "Acme Slack" } };
  });

  it("refuses a Member, a Guest, another workspace and a signed-out caller", async () => {
    session.orgRole = "org:member";
    expect(await start()).toEqual({ error: "Only Admins can connect Slack to this workspace." });
    session.orgRole = "org:guest";
    expect(await start()).toEqual({ error: "Only Admins can connect Slack to this workspace." });
    session.orgRole = "org:admin";
    expect(await start(OTHER)).toEqual({ error: "Only Admins can connect Slack to this workspace." });
    session.userId = null;
    expect(await start()).toEqual({ error: SESSION_ENDED });
  });

  it("refuses the return trip for anyone but the Admin who started it, and keeps nothing", async () => {
    const state = stateOf(await start());
    Object.assign(session, { userId: MEMBER, orgRole: "org:member" });
    expect(landing(await callback({ code: "c0de", state }))).toBe("/settings/profile?section=slack&slack=refused");
    Object.assign(session, { userId: ADMIN, orgRole: "org:member" });
    expect(landing(await callback({ code: "c0de", state }))).toBe("/settings/profile?section=slack&slack=refused");
    expect(await connected()).toBeNull();
    expect(slack.calls).toEqual([]);
  });

  it("says what happened when the Admin cancels on Slack, the link is stale, or Slack refuses the code", async () => {
    const state = stateOf(await start());
    expect(landing(await callback({ error: "access_denied", state }))).toBe("/settings/profile?section=slack&slack=cancelled");
    expect(landing(await callback({ code: "c0de", state: "forged.state" }))).toBe("/settings/profile?section=slack&slack=expired");
    expect(landing(await callback({ code: "c0de" }))).toBe("/settings/profile?section=slack&slack=expired");
    slack.exchange = { ok: false, error: "invalid_code" };
    expect(landing(await callback({ code: "c0de", state }))).toBe("/settings/profile?section=slack&slack=failed");
    slack.exchange = { ok: true, token_type: "bot", access_token: TOKEN, team: { id: "T0ACME", name: "Acme Slack" } };
    expect(await connected()).toBeNull();
  });

  it("degrades cleanly while Slack is switched off: no install link, no callback, no Slack traffic", async () => {
    vi.unstubAllEnvs();
    expect(await start()).toEqual({ error: "Slack isn't available in Lane yet." });
    expect(landing(await callback({ code: "c0de", state: "anything.at-all" }))).toBe("/settings/profile?section=slack&slack=unavailable");
    expect(await connected()).toBeNull();
    expect(slack.calls).toEqual([]);
  });
});

describe("disconnecting Slack", () => {
  it("lets an Admin disconnect, and tells Slack to revoke the token", async () => {
    await connectAsAdmin();
    slack.calls = [];
    expect(await disconnect()).toEqual({ success: true });
    expect(await connected()).toBeNull();
    expect(slack.calls.map(c => [c.url, c.headers])).toEqual([["https://slack.com/api/auth.revoke", expect.objectContaining({ Authorization: `Bearer ${TOKEN}` })]]);
  });

  it("refuses a Member and a Guest, and leaves Slack connected", async () => {
    await connectAsAdmin();
    session.orgRole = "org:member";
    expect(await disconnect()).toEqual({ error: "Only Admins can disconnect Slack from this workspace." });
    session.orgRole = "org:guest";
    expect(await disconnect()).toEqual({ error: "Only Admins can disconnect Slack from this workspace." });
    expect(await connected()).not.toBeNull();
  });

  it("still disconnects while Slack is switched off, without calling Slack", async () => {
    await connectAsAdmin();
    vi.unstubAllEnvs();
    slack.calls = [];
    expect(await disconnect()).toEqual({ success: true });
    expect(await connected()).toBeNull();
    expect(slack.calls).toEqual([]);
  });
});

describe("the Slack DM choice", () => {
  const choose = async (channel: string, as = { userId: MEMBER, orgRole: "org:member" }) => {
    Object.assign(session, as);
    return (await import("./delivery-actions")).updateDeliveryPreference({ channel }, { orgId: ORG });
  };
  const state = async () => (await import("@/lib/delivery-preferences")).readDeliveryState({ orgId: ORG, userId: MEMBER });

  it("is not offered, and can't be chosen, while Slack is not connected", async () => {
    expect(await state()).toEqual({ choice: "email", slackOffered: false, choseSlack: false });
    expect(await choose("slack")).toEqual({ error: "Slack isn't connected to this workspace. Choose Email or Off, or ask an Admin to connect Slack." });
    expect(await connection`select 1 from delivery_preferences where org_id = ${ORG}`).toEqual([]);
  });

  it("is offered and saved once an Admin connects Slack", async () => {
    await connectAsAdmin();
    expect(await state()).toMatchObject({ choice: "email", slackOffered: true });
    expect(await choose("slack")).toEqual({ success: true });
    expect(await state()).toEqual({ choice: "slack", slackOffered: true, choseSlack: true });
  });

  it("shows Email after Slack is disconnected, remembering the person chose Slack DM", async () => {
    await connectAsAdmin();
    await choose("slack");
    Object.assign(session, { userId: ADMIN, orgRole: "org:admin" });
    await disconnect();
    expect(await state()).toEqual({ choice: "email", slackOffered: false, choseSlack: true });
  });

  it("is not offered while Slack is switched off, even with a connection saved", async () => {
    await connectAsAdmin();
    vi.unstubAllEnvs();
    expect(await state()).toMatchObject({ choice: "email", slackOffered: false });
    expect(await choose("slack")).toMatchObject({ error: expect.stringContaining("Slack isn't connected") });
  });
});
