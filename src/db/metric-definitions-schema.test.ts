import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireTestDatabase } from "@/test/test-database";

// #196: the Metrics library's two tables (migration 0037).
const ORG = "org_metric_definitions_a";
const OTHER_ORG = "org_metric_definitions_b";
const USER = "user_metric_definitions";
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = process.env.DATABASE_URL!;
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(url, { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Metrics A','metric-definitions-a'), (${OTHER_ORG},'Metrics B','metric-definitions-b')`;
  await connection`insert into profiles (id,full_name,email) values (${USER},'Maker','metric-definitions@example.test')`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG}, ${OTHER_ORG})`;
  await connection`delete from profiles where id = ${USER}`;
  await connection.end();
});

let names = 0;
const uniqueName = (base = "Signup completion") => `${base} ${++names}`;
const addDefinition = async (values: { org?: string; name?: string; unit?: string; link?: string | null; howCounted?: string | null; createdBy?: string | null; starterKey?: string | null } = {}) => {
  const [row] = await connection`insert into metric_definitions (org_id,name,unit,link,how_counted,created_by,starter_key)
    values (${values.org ?? ORG}, ${values.name ?? uniqueName()}, ${values.unit ?? "percent"}, ${values.link ?? null}, ${values.howCounted ?? null},
      ${values.createdBy === undefined ? USER : values.createdBy}, ${values.starterKey ?? null}) returning *`;
  return row;
};
const addHistory = (definitionId: string, values: { org?: string; revision?: number; kind?: string; before?: unknown; after?: unknown; author?: string | null } = {}) =>
  connection`insert into metric_definition_history (org_id,definition_id,revision,kind,before,after,author_id)
    values (${values.org ?? ORG}, ${definitionId}, ${values.revision ?? 1}, ${values.kind ?? "created"},
      ${values.before === undefined || values.before === null ? null : connection.json(values.before as never)}::jsonb,
      ${connection.json((values.after ?? { name: "Signup completion", unit: "percent" }) as never)}::jsonb,
      ${values.author === undefined ? USER : values.author}) returning *`;

describe("Metric definitions", () => {
  it("keep a name, a unit and optional link and how-it's-counted line, with who made them and when", async () => {
    const plain = await addDefinition({ name: "Checkout completion" });
    expect(plain).toMatchObject({ org_id: ORG, name: "Checkout completion", unit: "percent", link: null, how_counted: null, archived_at: null, merged_into_id: null, created_by: USER, starter_key: null });
    expect(plain.created_at).toBeInstanceOf(Date);
    expect(plain.updated_at).toBeInstanceOf(Date);
    const described = await addDefinition({ unit: "seconds", link: "https://analytics.example.test/boards/1", howCounted: "Median seconds from first visit to purchase." });
    expect(described).toMatchObject({ unit: "seconds", link: "https://analytics.example.test/boards/1", how_counted: "Median seconds from first visit to purchase." });
  });

  it("accept only percentage, count, seconds and minutes as units", async () => {
    for (const unit of ["percent", "count", "seconds", "minutes"]) await expect(addDefinition({ unit })).resolves.toMatchObject({ unit });
    for (const unit of ["", "%", "check", "hours"]) await expect(addDefinition({ unit })).rejects.toMatchObject({ code: "23514" });
  });

  it("refuse a blank, padded or overlong name, a non-web link and a blank how-it's-counted line", async () => {
    for (const name of ["", " ", " Padded", "x".repeat(121)]) await expect(addDefinition({ name })).rejects.toMatchObject({ code: "23514" });
    await expect(addDefinition({ name: "x".repeat(120) })).resolves.toBeTruthy();
    for (const link of ["", "javascript:alert(1)", "ftp://files.example.test", `https://example.test/${"x".repeat(2048)}`]) await expect(addDefinition({ link })).rejects.toMatchObject({ code: "23514" });
    for (const howCounted of ["", "  ", "x".repeat(501)]) await expect(addDefinition({ howCounted })).rejects.toMatchObject({ code: "23514" });
  });

  it("keep names unique, ignoring case, among a workspace's active definitions only", async () => {
    const name = uniqueName("Activation");
    await addDefinition({ name });
    await expect(addDefinition({ name: name.toUpperCase() })).rejects.toMatchObject({ code: "23505" });
    await expect(addDefinition({ org: OTHER_ORG, name })).resolves.toBeTruthy();

    const archived = uniqueName("Retention");
    const old = await addDefinition({ name: archived });
    await connection`update metric_definitions set archived_at = now() where id = ${old.id}`;
    await expect(addDefinition({ name: archived })).resolves.toBeTruthy();
  });

  it("let a merged-away definition free its name, and merge only within the workspace", async () => {
    const kept = await addDefinition();
    const away = await addDefinition({ name: uniqueName("Merged") });
    await connection`update metric_definitions set merged_into_id = ${kept.id} where id = ${away.id}`;
    await expect(addDefinition({ name: away.name })).resolves.toBeTruthy();

    const elsewhere = await addDefinition({ org: OTHER_ORG });
    const local = await addDefinition();
    await expect(connection`update metric_definitions set merged_into_id = ${elsewhere.id} where id = ${local.id}`).rejects.toMatchObject({ code: "23503" });
    await expect(connection`update metric_definitions set merged_into_id = ${local.id} where id = ${local.id}`).rejects.toMatchObject({ code: "23514" });
  });

  it("hold each of the seven starter metrics at most once per workspace, and only starters have no maker", async () => {
    const own = "org_metric_definitions_starters";
    await connection`insert into organizations (id,name,slug) values (${own},'Starters','metric-definitions-starters')`;
    try {
      await addDefinition({ org: own, name: "Conversion rate", starterKey: "conversion", createdBy: null });
      await expect(addDefinition({ org: own, name: "Conversions", starterKey: "conversion", createdBy: null })).rejects.toMatchObject({ code: "23505" });
      await expect(addDefinition({ org: OTHER_ORG, name: "Conversion rate", starterKey: "conversion", createdBy: null })).resolves.toBeTruthy();
      await expect(addDefinition({ org: own, starterKey: "check", createdBy: null })).rejects.toMatchObject({ code: "23514" });
      await expect(addDefinition({ org: own, createdBy: null })).rejects.toMatchObject({ code: "23514" });
    } finally {
      await connection`delete from organizations where id = ${own}`;
    }
  });

  it("update their updated time on change", async () => {
    const row = await addDefinition();
    const [changed] = await connection`update metric_definitions set how_counted = 'Counted daily.', updated_at = '2000-01-01' where id = ${row.id} returning updated_at`;
    expect(changed.updated_at.getTime()).toBeGreaterThan(new Date("2001-01-01").getTime());
  });
});

describe("Metric definition history", () => {
  it("records numbered entries with a kind, before and after, an author and a time", async () => {
    const definition = await addDefinition();
    const [created] = await addHistory(definition.id, { after: { name: definition.name, unit: "percent" } });
    expect(created).toMatchObject({ org_id: ORG, definition_id: definition.id, revision: 1, kind: "created", before: null, after: { name: definition.name, unit: "percent" }, author_id: USER });
    expect(created.created_at).toBeInstanceOf(Date);
    for (const [revision, kind] of [[2, "edited"], [3, "archived"], [4, "restored"], [5, "merged_away"], [6, "merged_into"]] as const)
      await expect(addHistory(definition.id, { revision, kind, before: { name: "Before" }, after: { name: "After" } })).resolves.toHaveLength(1);
  });

  it("refuses an unknown kind, a missing or extra before, a non-object entry, a repeated revision and a missing author after creation", async () => {
    const definition = await addDefinition();
    await addHistory(definition.id);
    await expect(addHistory(definition.id, { revision: 2, kind: "renamed", before: {} })).rejects.toMatchObject({ code: "23514" });
    await expect(addHistory(definition.id, { revision: 2, kind: "edited" })).rejects.toMatchObject({ code: "23514" });
    await expect(addHistory(definition.id, { revision: 2, kind: "created", before: {} })).rejects.toMatchObject({ code: "23514" });
    await expect(addHistory(definition.id, { revision: 2, kind: "edited", before: {}, after: "text" })).rejects.toMatchObject({ code: "23514" });
    await expect(addHistory(definition.id, { revision: 0, kind: "edited", before: {} })).rejects.toMatchObject({ code: "23514" });
    await expect(addHistory(definition.id, { revision: 1, kind: "edited", before: {} })).rejects.toMatchObject({ code: "23505" });
    await expect(addHistory(definition.id, { revision: 2, kind: "edited", before: {}, author: null })).rejects.toMatchObject({ code: "23514" });
    await expect(addHistory(definition.id, { revision: 2, kind: "edited", before: {} })).resolves.toHaveLength(1);
  });

  it("lets Lane record a starter metric's creation without an author", async () => {
    const own = "org_metric_definitions_starter_history";
    await connection`insert into organizations (id,name,slug) values (${own},'Starter history','metric-definitions-starter-history')`;
    try {
      const starter = await addDefinition({ org: own, name: "Action count", unit: "count", starterKey: "events", createdBy: null });
      await expect(addHistory(starter.id, { org: own, author: null })).resolves.toHaveLength(1);
    } finally {
      await connection`delete from organizations where id = ${own}`;
    }
  });

  it("belongs to the definition's own workspace", async () => {
    const elsewhere = await addDefinition({ org: OTHER_ORG });
    await expect(addHistory(elsewhere.id, { org: ORG })).rejects.toMatchObject({ code: "23503" });
  });

  it("refuses edits to recorded entries", async () => {
    const definition = await addDefinition();
    await addHistory(definition.id);
    await expect(connection`update metric_definition_history set after = '{"name":"Rewritten"}'::jsonb where definition_id = ${definition.id}`).rejects.toThrow("immutable");
    await expect(connection`update metric_definition_history set author_id = null where definition_id = ${definition.id}`).rejects.toThrow("immutable");
    const [entry] = await connection`select after from metric_definition_history where definition_id = ${definition.id}`;
    expect(entry.after).toEqual({ name: "Signup completion", unit: "percent" });
  });

  it("refuses to delete entries while their definition exists", async () => {
    const definition = await addDefinition();
    await addHistory(definition.id);
    await expect(connection`delete from metric_definition_history where definition_id = ${definition.id}`).rejects.toThrow("kept");
    expect(await connection`select 1 from metric_definition_history where definition_id = ${definition.id}`).toHaveLength(1);
  });

  it("goes with its workspace when the workspace is removed", async () => {
    const own = "org_metric_definitions_removed";
    await connection`insert into organizations (id,name,slug) values (${own},'Removed','metric-definitions-removed')`;
    const kept = await addDefinition({ org: own });
    const away = await addDefinition({ org: own });
    await connection`update metric_definitions set merged_into_id = ${kept.id} where id = ${away.id}`;
    await addHistory(kept.id, { org: own });
    await addHistory(away.id, { org: own });
    await connection`delete from organizations where id = ${own}`;
    expect(await connection`select 1 from metric_definitions where org_id = ${own}`).toHaveLength(0);
    expect(await connection`select 1 from metric_definition_history where org_id = ${own}`).toHaveLength(0);
  });
});

describe("Metrics library tables", () => {
  it("are closed to the Data API: row security on and no public grants", async () => {
    const tables = await connection`select relname, relrowsecurity from pg_class where relname in ('metric_definitions','metric_definition_history') order by relname`;
    expect(tables).toEqual([{ relname: "metric_definition_history", relrowsecurity: true }, { relname: "metric_definitions", relrowsecurity: true }]);
    const grants = await connection`select table_name from information_schema.role_table_grants where table_name in ('metric_definitions','metric_definition_history') and grantee in ('PUBLIC','anon','authenticated')`;
    expect(grants).toHaveLength(0);
  });
});
