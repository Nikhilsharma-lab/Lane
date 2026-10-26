import postgres from "postgres";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 0042 (#207): one Slack connection per workspace, made by an Admin. The bot token Slack hands back is
 * kept only in Lane's sealed form, so a plain token can't be stored even by mistake.
 */
const ORG = "org_slack_connection_schema";
const OTHER = "org_slack_connection_schema_other";
const ADMIN = "slack_connection_schema_admin";
const SEALED = "v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:CCCCCCCCCCCC";
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
  sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await sql`insert into organizations(id,name,slug) values (${ORG},'Slack','slack-connection-schema'), (${OTHER},'Other','slack-connection-schema-other')`;
});
afterAll(async () => {
  await sql`delete from organizations where id in (${ORG}, ${OTHER})`;
  await sql.end();
});

const connect = (over: { org?: string; token?: string; teamId?: string; teamName?: string } = {}) => sql`
  insert into slack_connections(org_id,team_id,team_name,token_ciphertext,connected_by)
  values (${over.org ?? ORG},${over.teamId ?? "T0123ABCD"},${over.teamName ?? "Acme"},${over.token ?? SEALED},${ADMIN})`;

describe("Slack connections", () => {
  it("keeps one connection per workspace, with the Slack team, who connected it and when", async () => {
    await connect();
    await expect(connect({ teamId: "T999" })).rejects.toMatchObject({ code: "23505" });
    const [row] = await sql`select team_id, team_name, connected_by, connected_at from slack_connections where org_id=${ORG}`;
    expect(row).toMatchObject({ team_id: "T0123ABCD", team_name: "Acme", connected_by: ADMIN });
    expect(row.connected_at).toBeInstanceOf(Date);
  });

  it("lets two workspaces connect the same Slack team", async () => {
    await connect({ org: OTHER });
    expect(await sql`select org_id from slack_connections where team_id='T0123ABCD' order by org_id`).toHaveLength(2);
  });

  it("stores the token only sealed, never as Slack's plain token", async () => {
    await sql`delete from slack_connections where org_id=${OTHER}`;
    await expect(connect({ org: OTHER, token: "xoxb-1234-5678-abcdefabcdef" })).rejects.toMatchObject({ code: "23514" });
    await expect(connect({ org: OTHER, token: "" })).rejects.toMatchObject({ code: "23514" });
    await expect(connect({ org: OTHER, token: "v1:only-one-part" })).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses a blank Slack team", async () => {
    await expect(connect({ org: OTHER, teamId: "" })).rejects.toMatchObject({ code: "23514" });
    await expect(connect({ org: OTHER, teamName: " " })).rejects.toMatchObject({ code: "23514" });
  });

  it("is removed by disconnecting, and goes with the workspace", async () => {
    await connect({ org: OTHER });
    await sql`delete from slack_connections where org_id=${OTHER}`;
    expect(await sql`select 1 from slack_connections where org_id=${OTHER}`).toEqual([]);
    await connect({ org: OTHER });
    await sql`delete from organizations where id=${OTHER}`;
    expect(await sql`select 1 from slack_connections where org_id=${OTHER}`).toEqual([]);
  });

  it("only names a workspace Lane knows", async () => {
    await expect(connect({ org: "org_slack_connection_schema_missing" })).rejects.toMatchObject({ code: "23503" });
  });

  it("is closed to the public database roles", async () => {
    expect(await sql`select relrowsecurity from pg_class where relname='slack_connections'`).toEqual([{ relrowsecurity: true }]);
    const grants = await sql`select 1 from information_schema.role_table_grants where table_name='slack_connections' and grantee in ('PUBLIC','anon','authenticated')`;
    expect(grants).toEqual([]);
  });
});
