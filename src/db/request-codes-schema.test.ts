import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTriageToken } from "@/lib/triage-token";

const session = vi.hoisted(() => ({ userId: "user_request_codes_schema", orgId: "", orgRole: "org:member" }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));

const ORG_PREFIX = "org_request_codes_";
const USER = "user_request_codes_schema";
const OLD_TIMESTAMP = "2000-01-01T00:00:00.000Z";
const MIGRATION_PATH = path.resolve(__dirname, "migrations/0017_request_codes.sql");
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/lane_test") {
    throw new Error("Request code tests require disposable local lane_test PostgreSQL");
  }
  connection = postgres(databaseUrl, { max: 6, prepare: false });
  await connection`insert into profiles (id,full_name,email) values (${USER},'Request codes','request-codes@example.test')`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (!connection) return;
  await connection`delete from organizations where id like ${ORG_PREFIX + "%"}`;
  await connection`delete from profiles where id = ${USER}`;
  await connection.end();
});

async function workspace(suffix: string) {
  const id = ORG_PREFIX + suffix;
  await connection`insert into organizations (id,name,slug,updated_at) values (${id},${suffix},${"request-codes-" + suffix},${OLD_TIMESTAMP})`;
  return id;
}

async function insertRequest(orgId: string) {
  const [row] = await connection`
    insert into requests (org_id,title,description,created_by)
    values (${orgId},'Request code probe','A saved Request',${USER})
    returning id, to_jsonb(requests)->'request_number' as request_number
  `;
  return row as { id: string; request_number: number | null };
}

describe("permanent workspace Request numbers", () => {
  it("allocates a saved positive number when an ordinary insert omits the field", async () => {
    const orgId = await workspace("first");
    const created = await insertRequest(orgId);
    expect(created.request_number).toBe(1);
    const [saved] = await connection`select to_jsonb(requests)->'request_number' as request_number from requests where id = ${created.id}`;
    expect(saved.request_number).toBe(1);
  });

  it("serializes concurrent creation without duplicate numbers", async () => {
    const orgId = await workspace("concurrent");
    const created = await Promise.all(Array.from({ length: 12 }, () => insertRequest(orgId)));
    expect(created.map(row => row.request_number).sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("keeps separate workspaces' counters independent", async () => {
    const first = await workspace("independent-a");
    const second = await workspace("independent-b");
    expect((await insertRequest(first)).request_number).toBe(1);
    expect((await insertRequest(first)).request_number).toBe(2);
    expect((await insertRequest(second)).request_number).toBe(1);
  });

  it("rolls back allocation when a Request fails validation or its transaction aborts", async () => {
    const orgId = await workspace("rollback");
    await expect(connection`insert into requests (org_id,title,description,created_by) values (${orgId},NULL,'Invalid Request',${USER})`).rejects.toMatchObject({ code: "23502" });
    const rollback = new Error("Rollback Request creation");
    await expect(connection.begin(async transaction => {
      await transaction`insert into requests (org_id,title,description,created_by) values (${orgId},'Rolled back','Discarded transaction',${USER})`;
      throw rollback;
    })).rejects.toBe(rollback);
    expect((await insertRequest(orgId)).request_number).toBe(1);
  });

  it("never reuses a deleted Request's number", async () => {
    const orgId = await workspace("deletion");
    const first = await insertRequest(orgId);
    await connection`delete from requests where id = ${first.id}`;
    expect((await insertRequest(orgId)).request_number).toBe(2);
  });

  it("rejects changing a saved number or its workspace", async () => {
    const first = await workspace("immutable-a");
    const second = await workspace("immutable-b");
    const created = await insertRequest(first);
    await expect(connection`update requests set request_number = 27 where id = ${created.id}`).rejects.toMatchObject({ code: "23514" });
    await expect(connection`update requests set org_id = ${second} where id = ${created.id}`).rejects.toMatchObject({ code: "23514" });
    const [saved] = await connection`select org_id, to_jsonb(requests)->'request_number' as request_number from requests where id = ${created.id}`;
    expect(saved).toEqual({ org_id: first, request_number: 1 });
  });

  it.each([1, 27, -1, null])("rejects a supplied Request number %s without advancing allocation", async supplied => {
    const orgId = await workspace(`supplied-${supplied}`);
    await expect(connection`insert into requests (org_id,title,description,created_by,request_number) values (${orgId},'Forged code','Invalid supplied number',${USER},${supplied})`).rejects.toMatchObject({ code: "23514" });
    expect((await insertRequest(orgId)).request_number).toBe(1);
  });

  it("preserves workspace metadata timestamps when only allocating a number", async () => {
    const orgId = await workspace("timestamps");
    const [created] = await connection`insert into requests (org_id,title,description,created_by,updated_at) values (${orgId},'Timestamp probe','A saved Request',${USER},${OLD_TIMESTAMP}) returning id`;
    const [workspaceBefore] = await connection`select updated_at from organizations where id = ${orgId}`;
    expect(workspaceBefore.updated_at.toISOString()).toBe(OLD_TIMESTAMP);
    const [changedWorkspace] = await connection`update organizations set name = 'Renamed workspace' where id = ${orgId} returning updated_at`;
    expect(changedWorkspace.updated_at.getTime()).toBeGreaterThan(new Date(OLD_TIMESTAMP).getTime());
    const [changedRequest] = await connection`update requests set title = 'Edited Request' where id = ${created.id} returning request_number, updated_at`;
    expect(changedRequest.request_number).toBe(1);
    expect(changedRequest.updated_at.getTime()).toBeGreaterThan(new Date(OLD_TIMESTAMP).getTime());
  });

  it("rejects a negative workspace counter", async () => {
    const orgId = await workspace("counter-boundary");
    await expect(connection`update organizations set last_request_number = -1 where id = ${orgId}`).rejects.toMatchObject({ code: "23514" });
    expect((await insertRequest(orgId)).request_number).toBe(1);
  });

  it("prevents lowering the counter after the highest numbered Request is deleted", async () => {
    const orgId = await workspace("monotonic-counter");
    const first = await insertRequest(orgId);
    await connection`delete from requests where id = ${first.id}`;
    await expect(connection`update organizations set last_request_number = 0 where id = ${orgId}`).rejects.toMatchObject({ code: "23514" });
    expect((await insertRequest(orgId)).request_number).toBe(2);
  });

  it("fails integer overflow without saving a partial Request or changing the counter", async () => {
    const orgId = await workspace("overflow");
    await connection`update organizations set last_request_number = 2147483647 where id = ${orgId}`;
    await expect(insertRequest(orgId)).rejects.toMatchObject({ code: "22003" });
    const [workspaceAfter] = await connection`select last_request_number,updated_at from organizations where id = ${orgId}`;
    expect(workspaceAfter.last_request_number).toBe(2147483647);
    expect(workspaceAfter.updated_at.toISOString()).toBe(OLD_TIMESTAMP);
    expect(await connection`select id from requests where org_id = ${orgId}`).toHaveLength(0);
  });

  it("keeps the original number when concurrent signed saves retry the same Request", async () => {
    const orgId = await workspace("signed-retry");
    session.orgId = orgId;
    vi.stubEnv("TRIAGE_TOKEN_SECRET", "request-codes-signed-retry-secret".repeat(3));
    const { saveRequest } = await import("@/app/(app)/intake/actions");
    const token = createTriageToken({
      title: "A retry must not change a Request code",
      description: "The original saved Request remains the same after a network retry.",
      affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "",
      projectId: null, requestType: null,
      expectedImpact: { kind: "verification", result: "Repeated save returns the original Request", source: "Saved Request inspection", reviewAfterDays: 7 },
    }, { classification: "problem", reframedProblem: null, extractedSolution: null }, { orgId, userId: USER });
    const original = await saveRequest({ token, editedProblemText: null }, { orgId });
    expect(original.success).toBe(true);
    const repeated = await Promise.all([
      saveRequest({ token, editedProblemText: null }, { orgId }),
      saveRequest({ token, editedProblemText: null }, { orgId }),
    ]);
    expect(repeated).toEqual([original, original]);
    const saved = await connection`select id, to_jsonb(requests)->'request_number' as request_number from requests where org_id = ${orgId}`;
    expect(saved).toEqual([{ id: original.success ? original.requestId : "", request_number: 1 }]);
    // Conflict retries may consume numbers, but cannot reuse or change the original.
    expect((await insertRequest(orgId)).request_number).toBeGreaterThan(1);
  });
});

describe("existing Request code backfill", () => {
  it("orders each workspace by creation time then UUID and preserves all timestamps", async () => {
    expect(existsSync(MIGRATION_PATH), "The canonical Request code migration must exist").toBe(true);
    const schema = `request_codes_${randomUUID().replaceAll("-", "")}`;
    const migration = readFileSync(MIGRATION_PATH, "utf8")
      .replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, "")
      .replaceAll("public.", `${schema}.`);
    const rollback = new Error("Rollback isolated migration probe");
    try {
      await connection.begin(async transaction => {
        await transaction.unsafe(`create schema ${schema}`);
        const [timestampFunction] = await transaction`select pg_get_functiondef('public.set_updated_at()'::regprocedure) as source`;
        await transaction.unsafe(timestampFunction.source.replaceAll("public.", `${schema}.`));
        await transaction.unsafe(`
          create table ${schema}.organizations (
            id text primary key, name text not null, slug text not null unique,
            owner_id text, plan text not null default 'free',
            created_at timestamptz not null default now(), updated_at timestamptz not null default now()
          );
          create table ${schema}.requests (
            id uuid primary key default gen_random_uuid(), org_id text not null references ${schema}.organizations(id),
            title text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
          );
          create trigger set_updated_at_organizations before update on ${schema}.organizations
            for each row execute function ${schema}.set_updated_at();
          create trigger set_updated_at_requests before update on ${schema}.requests
            for each row execute function ${schema}.set_updated_at();
          insert into ${schema}.organizations (id,name,slug,created_at,updated_at)
            values ('a','A','a','1999-01-01','2000-01-01'), ('b','B','b','1998-01-01','2001-01-01');
          insert into ${schema}.requests (id,org_id,title,created_at,updated_at) values
            ('00000000-0000-4000-a000-000000001703','a','Newest','2003-01-01','2006-01-01'),
            ('00000000-0000-4000-a000-000000001702','a','Tied second','2002-01-01','2005-01-01'),
            ('00000000-0000-4000-a000-000000001704','b','Other workspace','2001-01-01','2007-01-01'),
            ('00000000-0000-4000-a000-000000001701','a','Tied first','2002-01-01','2004-01-01');
        `);
        const beforeRequests = await transaction.unsafe(`select id,created_at,updated_at from ${schema}.requests order by id`);
        const beforeWorkspaces = await transaction.unsafe(`select id,created_at,updated_at from ${schema}.organizations order by id`);
        await transaction.unsafe(migration);
        const numbered = await transaction.unsafe(`select title,request_number from ${schema}.requests order by org_id,request_number`);
        expect(numbered).toEqual([
          { title: "Tied first", request_number: 1 }, { title: "Tied second", request_number: 2 },
          { title: "Newest", request_number: 3 }, { title: "Other workspace", request_number: 1 },
        ]);
        expect(await transaction.unsafe(`select id,created_at,updated_at from ${schema}.requests order by id`)).toEqual(beforeRequests);
        expect(await transaction.unsafe(`select id,created_at,updated_at from ${schema}.organizations order by id`)).toEqual(beforeWorkspaces);
        const [next] = await transaction.unsafe(`insert into ${schema}.requests (org_id,title) values ('a','After backfill') returning request_number`);
        expect(next.request_number).toBe(4);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
