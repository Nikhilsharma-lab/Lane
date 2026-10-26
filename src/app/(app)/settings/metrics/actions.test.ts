/**
 * #197: the Metrics library's actions on Settings → Metrics, against the real test database, with the
 * session's role switched between Admin, Member and Guest. Results are read back through the library.
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";

const session = vi.hoisted(() => ({ userId: "" as string | null, orgId: "", orgRole: "org:member" }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ ...session }) }));

const PREFIX = "org_metrics_actions_";
const ADMIN = "user_metrics_actions_admin", MEMBER = "user_metrics_actions_member", GUEST = "user_metrics_actions_guest";
const ROLES = { admin: [ADMIN, "org:admin"], member: [MEMBER, "org:member"], guest: [GUEST, "org:guest"] } as const;
let connection: ReturnType<typeof postgres>;
let workspaces = 0;
let orgId = "";

const actions = () => import("./actions");
const library = () => import("@/lib/metrics-library");
const actAs = (role: keyof typeof ROLES) => Object.assign(session, { userId: ROLES[role][0], orgRole: ROLES[role][1], orgId });
const context = () => ({ orgId });
const all = async () => (await library()).listMetricDefinitions({ orgId }, { includeArchived: true });
const active = async () => (await library()).listMetricDefinitions({ orgId });
const historyOf = async (id: string) => (await library()).readMetricDefinitionHistory({ orgId }, id);
const named = async (name: string) => (await all()).find(definition => definition.name === name)!;
const trialStarts = { name: "Trial starts", unit: "count", link: "https://analytics.example.test/trials", howCounted: "Trials started per week." };

async function add(input: Record<string, unknown> = trialStarts) {
  const result = await (await actions()).addMetricDefinition(input as never, context());
  if (!("ok" in result)) throw new Error(`add refused: ${result.error}`);
  return result.id;
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !TEST_DATABASE_PATH.test(url.pathname)) throw new Error("Metrics actions tests require disposable local PostgreSQL");
  connection = postgres(url.toString(), { max: 1, prepare: false });
  for (const id of [ADMIN, MEMBER, GUEST]) await connection`insert into profiles (id,full_name,email) values (${id},${id},${id + "@example.test"})`;
});
beforeEach(async () => {
  orgId = `${PREFIX}${++workspaces}`;
  await connection`insert into organizations (id,name,slug) values (${orgId},'Metrics actions',${orgId.replaceAll("_", "-")})`;
  actAs("member");
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id like ${PREFIX + "%"}`;
  await connection`delete from profiles where id in (${ADMIN},${MEMBER},${GUEST})`;
  await connection.end();
});

describe("Adding a Metric definition", () => {
  it.each(["member", "admin"] as const)("lets a %s add one, recorded in its history with them as author", async (role) => {
    actAs(role);
    const id = await add();
    expect(await named("Trial starts")).toMatchObject({ id, unit: "count", link: trialStarts.link, howCounted: trialStarts.howCounted, createdBy: ROLES[role][0], archivedAt: null });
    const history = await historyOf(id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ revision: 1, kind: "created", before: null, authorId: ROLES[role][0], after: { name: "Trial starts", unit: "count", link: trialStarts.link, howCounted: trialStarts.howCounted } });
    expect(history[0].createdAt).toBeInstanceOf(Date);
  });

  it("refuses a Guest and saves nothing", async () => {
    actAs("guest");
    expect(await (await actions()).addMetricDefinition(trialStarts, context())).toEqual({ error: "You can't change the Metrics library in this workspace." });
    expect((await all()).map(definition => definition.name)).not.toContain("Trial starts");
  });

  it("refuses someone signed out, or acting in another workspace, with the usual messages", async () => {
    const { addMetricDefinition } = await actions();
    session.orgId = `${PREFIX}elsewhere`;
    expect(await addMetricDefinition(trialStarts, context())).toEqual({ error: "You can't change the Metrics library in this workspace." });
    session.userId = null;
    expect(await addMetricDefinition(trialStarts, context())).toEqual({ error: "Your session ended. Sign in again to continue." });
    expect((await all()).map(definition => definition.name)).not.toContain("Trial starts");
  });

  it("refuses a name an active definition already has, ignoring case, and says which", async () => {
    await add();
    const result = await (await actions()).addMetricDefinition({ ...trialStarts, name: "  TRIAL starts " }, context());
    expect(result).toMatchObject({ error: "A metric called “Trial starts” already exists. Use that one, or choose another name." });
    expect((await all()).filter(definition => definition.name.toLowerCase() === "trial starts")).toHaveLength(1);
  });

  it("keeps only the name and unit required, and saves blank link and how-it's-counted as nothing", async () => {
    const id = await add({ name: "Signups", unit: "count", link: "  ", howCounted: "" });
    expect(await named("Signups")).toMatchObject({ id, link: null, howCounted: null });
  });

  it("explains each field it can't accept", async () => {
    const result = await (await actions()).addMetricDefinition({ name: " ", unit: "furlongs", link: "analytics.example.test", howCounted: "x".repeat(501) }, context());
    expect(result).toMatchObject({ fields: {
      name: "Give the metric a name.", unit: "Choose a unit.",
      link: "Enter a link that starts with https:// or http://.", howCounted: "Keep how it's counted to 500 characters or fewer.",
    } });
  });
});

describe("Editing a Metric definition", () => {
  it.each(["member", "admin"] as const)("lets a %s change the name, link and how-it's-counted line, with the before and after in history", async (role) => {
    actAs("admin");
    const id = await add();
    actAs(role);
    const result = await (await actions()).editMetricDefinition({ id, name: "Trials started", unit: "count", link: "https://analytics.example.test/trials-v2", howCounted: "" }, context());
    expect(result).toEqual({ ok: true });
    expect(await named("Trials started")).toMatchObject({ id, link: "https://analytics.example.test/trials-v2", howCounted: null });
    const history = await historyOf(id);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({
      revision: 2, kind: "edited", authorId: ROLES[role][0],
      before: { name: "Trial starts", unit: "count", link: "https://analytics.example.test/trials", howCounted: "Trials started per week." },
      after: { name: "Trials started", unit: "count", link: "https://analytics.example.test/trials-v2", howCounted: null },
    });
    expect(history[1].createdAt.getTime()).toBeGreaterThanOrEqual(history[0].createdAt.getTime());
  });

  it("changes the unit of a definition no Request uses", async () => {
    const id = await add();
    expect(await (await actions()).editMetricDefinition({ ...trialStarts, id, unit: "percent" }, context())).toEqual({ ok: true });
    expect((await named("Trial starts")).unit).toBe("percent");
    expect((await historyOf(id))[1]).toMatchObject({ before: { unit: "count" }, after: { unit: "percent" } });
  });

  it("edits a starter metric Lane added", async () => {
    const conversion = (await active()).find(definition => definition.name === "Conversion rate")!;
    expect(await (await actions()).editMetricDefinition({ id: conversion.id, name: "Checkout conversion", unit: "percent", link: "https://analytics.example.test/checkout", howCounted: conversion.howCounted }, context())).toEqual({ ok: true });
    expect((await historyOf(conversion.id)).map(entry => [entry.kind, entry.authorId])).toEqual([["created", null], ["edited", MEMBER]]);
  });

  it("records nothing when nothing changed", async () => {
    const id = await add();
    expect(await (await actions()).editMetricDefinition({ ...trialStarts, id, name: " Trial starts " }, context())).toEqual({ ok: true });
    expect(await historyOf(id)).toHaveLength(1);
  });

  it("lets a definition change the case of its own name, but not take another active definition's name", async () => {
    const id = await add();
    await add({ name: "Signups", unit: "count" });
    const { editMetricDefinition } = await actions();
    expect(await editMetricDefinition({ ...trialStarts, id, name: "Trial Starts" }, context())).toEqual({ ok: true });
    expect(await editMetricDefinition({ ...trialStarts, id, name: "signups" }, context())).toMatchObject({ error: "A metric called “Signups” already exists. Use that one, or choose another name." });
    expect((await named("Trial Starts")).id).toBe(id);
    expect(await historyOf(id)).toHaveLength(2);
  });

  it("refuses a Guest, and a definition from another workspace", async () => {
    const id = await add();
    const { editMetricDefinition } = await actions();
    actAs("guest");
    expect(await editMetricDefinition({ ...trialStarts, id, name: "Guest edit" }, context())).toEqual({ error: "You can't change the Metrics library in this workspace." });
    const mine = orgId;
    orgId = `${PREFIX}${++workspaces}`;
    await connection`insert into organizations (id,name,slug) values (${orgId},'Other metrics',${orgId.replaceAll("_", "-")})`;
    actAs("admin");
    expect(await editMetricDefinition({ ...trialStarts, id, name: "Their edit" }, context())).toEqual({ error: "That metric isn't in this workspace." });
    expect(await editMetricDefinition({ ...trialStarts, id: "not-an-id", name: "Their edit" }, context())).toEqual({ error: "That metric isn't in this workspace." });
    orgId = mine;
    expect((await named("Trial starts")).id).toBe(id);
    expect(await historyOf(id)).toHaveLength(1);
  });
});

describe("Archiving and restoring a Metric definition", () => {
  it("lets an Admin archive one: it leaves the active library, stays in the full one, and history keeps the change", async () => {
    const id = await add();
    actAs("admin");
    expect(await (await actions()).archiveMetricDefinition({ id }, context())).toEqual({ ok: true });
    expect((await active()).map(definition => definition.id)).not.toContain(id);
    const archived = await named("Trial starts");
    expect(archived.archivedAt).toBeInstanceOf(Date);
    const [, entry] = await historyOf(id);
    expect(entry).toMatchObject({ revision: 2, kind: "archived", authorId: ADMIN, before: { name: "Trial starts", archivedAt: null }, after: { name: "Trial starts", archivedAt: archived.archivedAt!.toISOString() } });
  });

  it("lets an Admin restore an archived one, recorded in history", async () => {
    const id = await add();
    actAs("admin");
    const { archiveMetricDefinition, restoreMetricDefinition } = await actions();
    await archiveMetricDefinition({ id }, context());
    expect(await restoreMetricDefinition({ id }, context())).toEqual({ ok: true });
    expect((await active()).find(definition => definition.id === id)).toMatchObject({ archivedAt: null });
    expect((await historyOf(id)).map(entry => [entry.kind, entry.authorId])).toEqual([["created", MEMBER], ["archived", ADMIN], ["restored", ADMIN]]);
    expect((await historyOf(id))[2]).toMatchObject({ before: { archivedAt: expect.any(String) }, after: { archivedAt: null } });
  });

  it.each(["member", "guest"] as const)("refuses archive and restore from a %s, even when asked directly", async (role) => {
    const id = await add();
    const other = await add({ name: "Signups", unit: "count" });
    actAs("admin");
    const { archiveMetricDefinition, restoreMetricDefinition } = await actions();
    await archiveMetricDefinition({ id: other }, context());
    actAs(role);
    const message = role === "member" ? "Only Admins can archive or restore metrics." : "You can't change the Metrics library in this workspace.";
    expect(await archiveMetricDefinition({ id }, context())).toEqual({ error: message });
    expect(await restoreMetricDefinition({ id: other }, context())).toEqual({ error: message });
    expect((await named("Trial starts")).archivedAt).toBeNull();
    expect((await named("Signups")).archivedAt).toBeInstanceOf(Date);
    expect(await historyOf(id)).toHaveLength(1);
    expect(await historyOf(other)).toHaveLength(2);
  });

  it("lets a new definition reuse an archived one's name", async () => {
    const archived = await add();
    actAs("admin");
    await (await actions()).archiveMetricDefinition({ id: archived }, context());
    actAs("member");
    const reused = await add({ ...trialStarts, name: "trial starts" });
    expect(reused).not.toBe(archived);
    expect((await active()).filter(definition => definition.name.toLowerCase() === "trial starts").map(definition => definition.id)).toEqual([reused]);
  });

  it("won't restore one whose name an active definition now has, and says what to do", async () => {
    const archived = await add();
    actAs("admin");
    const { archiveMetricDefinition, restoreMetricDefinition } = await actions();
    await archiveMetricDefinition({ id: archived }, context());
    await add({ ...trialStarts, name: "Trial Starts" });
    expect(await restoreMetricDefinition({ id: archived }, context())).toEqual({ error: "An active metric is already called “Trial Starts”. Rename this one or that one first." });
    expect((await all()).find(definition => definition.id === archived)?.archivedAt).toBeInstanceOf(Date);
  });

  it("keeps an archived definition editable, and records nothing for archiving or restoring twice", async () => {
    const id = await add();
    actAs("admin");
    const { archiveMetricDefinition, editMetricDefinition, restoreMetricDefinition } = await actions();
    await archiveMetricDefinition({ id }, context());
    expect(await archiveMetricDefinition({ id }, context())).toEqual({ ok: true });
    actAs("member");
    expect(await editMetricDefinition({ ...trialStarts, id, howCounted: "Trials started per day." }, context())).toEqual({ ok: true });
    actAs("admin");
    await restoreMetricDefinition({ id }, context());
    expect(await restoreMetricDefinition({ id }, context())).toEqual({ ok: true });
    expect((await historyOf(id)).map(entry => entry.kind)).toEqual(["created", "archived", "edited", "restored"]);
  });

  it("leaves a merged-away definition alone", async () => {
    const id = await add();
    const kept = await add({ name: "Signups", unit: "count" });
    // Merging arrives with #202; set it up directly here.
    await connection`update metric_definitions set merged_into_id = ${kept} where id = ${id}`;
    actAs("admin");
    const { archiveMetricDefinition, editMetricDefinition, restoreMetricDefinition } = await actions();
    const merged = { error: "This metric was merged into another one, so it can't be changed." };
    expect(await editMetricDefinition({ ...trialStarts, id, name: "Renamed" }, context())).toEqual(merged);
    expect(await archiveMetricDefinition({ id }, context())).toEqual(merged);
    expect(await restoreMetricDefinition({ id }, context())).toEqual(merged);
    expect(await historyOf(id)).toHaveLength(1);
  });

  it("refuses a definition from another workspace", async () => {
    const id = await add();
    const mine = orgId;
    orgId = `${PREFIX}${++workspaces}`;
    await connection`insert into organizations (id,name,slug) values (${orgId},'Other metrics',${orgId.replaceAll("_", "-")})`;
    actAs("admin");
    expect(await (await actions()).archiveMetricDefinition({ id }, context())).toEqual({ error: "That metric isn't in this workspace." });
    orgId = mine;
    expect((await named("Trial starts")).archivedAt).toBeNull();
  });
});

describe("Merging Metric definitions", () => {
  it("lets an Admin merge a duplicate into the one they keep: the kept one is unchanged, the other leaves the active library, and both histories record it", async () => {
    const kept = await add({ ...trialStarts, name: "Trials started" });
    const merged = await add();
    const keptBefore = await named("Trials started");
    actAs("admin");
    expect(await (await actions()).mergeMetricDefinitions({ keptId: kept, mergedId: merged }, context())).toEqual({ ok: true });

    expect((await active()).map(definition => definition.id)).toContain(kept);
    expect((await active()).map(definition => definition.id)).not.toContain(merged);
    expect(await named("Trials started")).toEqual(keptBefore);
    expect(await named("Trial starts")).toMatchObject({ mergedIntoId: kept, archivedAt: null });
    const picker = (await (await library()).predictionMetricChoices({ orgId }, null)).metrics.map(choice => choice.id);
    expect(picker).toContain(kept);
    expect(picker).not.toContain(merged);

    const away = await historyOf(merged);
    expect(away.map(entry => [entry.kind, entry.authorId])).toEqual([["created", MEMBER], ["merged_away", ADMIN]]);
    expect(away[1]).toMatchObject({ before: { name: "Trial starts", mergedIntoId: null }, after: { name: "Trial starts", mergedIntoId: kept, merge: { keptId: kept, keptName: "Trials started", mergedId: merged, mergedName: "Trial starts" } } });
    const into = await historyOf(kept);
    expect(into.map(entry => [entry.kind, entry.authorId])).toEqual([["created", MEMBER], ["merged_into", ADMIN]]);
    expect(into[1]).toMatchObject({ before: { name: "Trials started", mergedIntoId: null }, after: { name: "Trials started", mergedIntoId: null, merge: { keptId: kept, keptName: "Trials started", mergedId: merged, mergedName: "Trial starts" } } });
  });

  it("lets the Admin choose which one is kept", async () => {
    const first = await add({ ...trialStarts, name: "Trials started" });
    const second = await add();
    actAs("admin");
    expect(await (await actions()).mergeMetricDefinitions({ keptId: second, mergedId: first }, context())).toEqual({ ok: true });
    expect((await active()).map(definition => definition.name)).toContain("Trial starts");
    expect((await active()).map(definition => definition.name)).not.toContain("Trials started");
    expect(await named("Trials started")).toMatchObject({ mergedIntoId: second });
  });

  it("refuses to merge definitions with different units, and saves nothing", async () => {
    const kept = await add();
    const other = await add({ name: "Trial start rate", unit: "percent" });
    actAs("admin");
    expect(await (await actions()).mergeMetricDefinitions({ keptId: kept, mergedId: other }, context())).toEqual({
      error: "“Trial start rate” is counted in percentage and “Trial starts” in count. Only metrics with the same unit can be merged.",
    });
    expect((await active()).map(definition => definition.id)).toEqual(expect.arrayContaining([kept, other]));
    expect(await historyOf(kept)).toHaveLength(1);
    expect(await historyOf(other)).toHaveLength(1);
  });

  it.each(["member", "guest"] as const)("refuses a merge from a %s, even when asked directly", async (role) => {
    const kept = await add({ ...trialStarts, name: "Trials started" });
    const merged = await add();
    actAs(role);
    expect(await (await actions()).mergeMetricDefinitions({ keptId: kept, mergedId: merged }, context())).toEqual({
      error: role === "member" ? "Only Admins can merge metrics." : "You can't change the Metrics library in this workspace.",
    });
    expect(await named("Trial starts")).toMatchObject({ mergedIntoId: null });
    expect(await historyOf(merged)).toHaveLength(1);
  });

  it("can't be undone: a merged-away definition can't be merged again, kept, or merged into itself", async () => {
    const kept = await add({ ...trialStarts, name: "Trials started" });
    const merged = await add();
    const third = await add({ name: "Trials begun", unit: "count" });
    actAs("admin");
    const { mergeMetricDefinitions } = await actions();
    await mergeMetricDefinitions({ keptId: kept, mergedId: merged }, context());
    const already = { error: "“Trial starts” was already merged into another metric. Merges can't be undone." };
    expect(await mergeMetricDefinitions({ keptId: merged, mergedId: kept }, context())).toEqual(already);
    expect(await mergeMetricDefinitions({ keptId: third, mergedId: merged }, context())).toEqual(already);
    expect(await mergeMetricDefinitions({ keptId: third, mergedId: third }, context())).toEqual({ error: "Choose two different metrics to merge." });
    expect(await named("Trial starts")).toMatchObject({ mergedIntoId: kept });
    expect(await historyOf(merged)).toHaveLength(2);
    expect(await historyOf(third)).toHaveLength(1);
  });

  it("follows a later merge: what was merged into a definition counts under wherever that one goes", async () => {
    const a = await add({ name: "Signups", unit: "count" });
    const b = await add({ name: "Sign-ups", unit: "count" });
    const c = await add({ name: "New accounts", unit: "count" });
    actAs("admin");
    const { mergeMetricDefinitions } = await actions();
    expect(await mergeMetricDefinitions({ keptId: b, mergedId: a }, context())).toEqual({ ok: true });
    expect(await mergeMetricDefinitions({ keptId: c, mergedId: b }, context())).toEqual({ ok: true });
    const resolved = await (await library()).resolveSavedMetrics({ orgId }, [{
      kind: "measurement", version: 5, guardrails: [],
      measurement: { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
      primary: { key: "definition", definitionId: a, name: "Signups", unit: "count", current: 1, target: 2, noBaseline: false, check: "" },
    }]);
    expect(resolved[0][0].definition?.id).toBe(c);
  });

  it("merges an archived duplicate away", async () => {
    const kept = await add({ ...trialStarts, name: "Trials started" });
    const archived = await add();
    actAs("admin");
    const { archiveMetricDefinition, mergeMetricDefinitions } = await actions();
    await archiveMetricDefinition({ id: archived }, context());
    expect(await mergeMetricDefinitions({ keptId: kept, mergedId: archived }, context())).toEqual({ ok: true });
    expect((await all()).find(definition => definition.id === archived)).toMatchObject({ mergedIntoId: kept });
  });

  it("refuses a definition from another workspace, and one that doesn't exist", async () => {
    const theirs = await add();
    const mine = orgId;
    orgId = `${PREFIX}${++workspaces}`;
    await connection`insert into organizations (id,name,slug) values (${orgId},'Other metrics',${orgId.replaceAll("_", "-")})`;
    actAs("admin");
    const ours = await add();
    const { mergeMetricDefinitions } = await actions();
    const notHere = { error: "That metric isn't in this workspace." };
    expect(await mergeMetricDefinitions({ keptId: ours, mergedId: theirs }, context())).toEqual(notHere);
    expect(await mergeMetricDefinitions({ keptId: theirs, mergedId: ours }, context())).toEqual(notHere);
    expect(await mergeMetricDefinitions({ keptId: ours, mergedId: "not-an-id" }, context())).toEqual(notHere);
    expect(await historyOf(ours)).toHaveLength(1);
    orgId = mine;
    expect(await named("Trial starts")).toMatchObject({ id: theirs, mergedIntoId: null });
  });
});

describe("Metric definition history", () => {
  it("can't be edited or removed, even directly in the database", async () => {
    const id = await add();
    await (await actions()).editMetricDefinition({ ...trialStarts, id, name: "Trials started" }, context());
    await expect(connection`update metric_definition_history set after = '{}'::jsonb where definition_id = ${id}`).rejects.toThrow("immutable");
    await expect(connection`delete from metric_definition_history where definition_id = ${id}`).rejects.toThrow("kept");
    expect((await historyOf(id)).map(entry => entry.after.name)).toEqual(["Trial starts", "Trials started"]);
  });

  it("offers no action that edits or removes history", async () => {
    expect(Object.keys(await actions()).sort()).toEqual(["addMetricDefinition", "archiveMetricDefinition", "editMetricDefinition", "mergeMetricDefinitions", "restoreMetricDefinition"]);
  });
});
