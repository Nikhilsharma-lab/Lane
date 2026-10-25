import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMetricDefinitions, resolveSavedMetrics } from "@/lib/metrics-library";
import { TEST_DATABASE_PATH } from "@/test/test-database";

// #200: migration 0038 moves the metrics saved on existing Requests into each workspace's Metrics library.
// Its input is src/test/metrics-migration-fixtures.sql, applied just before it.
const ORG = "org_metrics_migration";
const OTHER_ORG = "org_metrics_migration_b";
let connection: ReturnType<typeof postgres>;

beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !TEST_DATABASE_PATH.test(url.pathname)) throw new Error("Metrics migration tests require disposable local PostgreSQL");
  connection = postgres(url.toString(), { max: 1, prepare: false });
});
afterAll(async () => { await connection?.end(); });

const STARTER_NAMES = ["Action count", "Conversion rate", "Customer satisfaction", "Feature adoption rate", "Median time to convert", "Support contact rate", "User error rate"];

async function definitionsOf(orgId: string) {
  return connection`select id, name, unit, starter_key, created_by, archived_at, merged_into_id from metric_definitions where org_id = ${orgId} order by lower(name), name`;
}

/** The current definition name each saved metric resolves to, in saved order. */
async function resolvedNames(impacts: unknown[]) {
  const resolved = await resolveSavedMetrics({ orgId: ORG }, impacts);
  return resolved.map((metrics) => metrics.map((metric) => metric.definition?.name ?? null));
}

describe("Moving saved metrics into the Metrics library", () => {
  it("gives each workspace its starter metrics, and maps built-in metrics to them", async () => {
    const definitions = await definitionsOf(ORG);
    const starters = definitions.filter((definition) => definition.starter_key);
    expect(starters.map((definition) => definition.name)).toEqual(STARTER_NAMES);
    const [plan] = await connection`select expected_impact from requests where org_id = ${ORG} and title = 'Built-in plan'`;
    const [[main, , errors]] = await resolveSavedMetrics({ orgId: ORG }, [plan.expected_impact]);
    expect(main.definition?.id).toBe(starters.find((definition) => definition.starter_key === "conversion")?.id);
    expect(errors.definition?.id).toBe(starters.find((definition) => definition.starter_key === "error")?.id);
  });

  it("adds the same starter metrics the library adds to a new workspace", async () => {
    const fresh = "org_metrics_migration_fresh";
    await connection`insert into organizations (id,name,slug) values (${fresh},'Fresh','metrics-migration-fresh')`;
    try {
      const shape = (definitions: { name: string; unit: string; howCounted: string | null }[]) => definitions.map(({ name, unit, howCounted }) => ({ name, unit, howCounted }));
      const migrated = await listMetricDefinitions({ orgId: ORG });
      const added = await listMetricDefinitions({ orgId: fresh });
      expect(shape(migrated.filter((definition) => STARTER_NAMES.includes(definition.name)))).toEqual(shape(added));
    } finally {
      await connection`delete from organizations where id = ${fresh}`;
    }
  });

  it("makes one definition per typed name and unit, adding the unit to names that clash across units", async () => {
    const typed = (await definitionsOf(ORG)).filter((definition) => !definition.starter_key);
    expect(typed.map(({ name, unit }) => ({ name, unit }))).toEqual([
      { name: "Activation rate", unit: "percent" },
      { name: "Checkout errors", unit: "count" },
      { name: "Conversion rate (count)", unit: "count" },
      { name: "Conversions", unit: "count" },
      { name: "Median time to convert (minutes)", unit: "minutes" },
      { name: "Page load time", unit: "seconds" },
      { name: "Refund requests", unit: "count" },
      { name: "Repeat orders", unit: "count" },
      { name: "Retention", unit: "percent" },
      { name: "Signups (%)", unit: "percent" },
      { name: "Signups (count)", unit: "count" },
      { name: "Signups (users)", unit: "count" },
      { name: "Trial starts", unit: "count" },
      { name: `${"x".repeat(112)} (count)`, unit: "count" },
      { name: `${"x".repeat(116)} (%)`, unit: "percent" },
    ]);
    // Typed metrics belong to whoever first typed them; nothing is archived or merged for the Admin.
    expect(typed.every((definition) => definition.created_by === "user_test_admin_a" && !definition.archived_at && !definition.merged_into_id)).toBe(true);
    const history = await connection`select kind, before, author_id, after from metric_definition_history where org_id = ${ORG} and definition_id = ${typed[0].id}`;
    expect(history).toEqual([{ kind: "created", before: null, author_id: null, after: { name: "Activation rate", unit: "percent", link: null, howCounted: null, archivedAt: null, mergedIntoId: null } }]);
  });

  it("keeps each workspace's metrics to itself", async () => {
    const definitions = await definitionsOf(OTHER_ORG);
    expect(definitions.filter((definition) => !definition.starter_key).map(({ name, unit }) => ({ name, unit }))).toEqual([{ name: "Signups", unit: "count" }]);
    const [request] = await connection`select expected_impact from requests where org_id = ${OTHER_ORG}`;
    const [[signups]] = await resolveSavedMetrics({ orgId: OTHER_ORG }, [request.expected_impact]);
    expect(signups.definition).toMatchObject({ name: "Signups", unit: "count" });
    expect((await resolveSavedMetrics({ orgId: ORG }, [request.expected_impact]))[0][0].definition?.name).toBe("Signups (count)");
  });

  it("resolves predictions, guardrails, drafts, closed results and older revisions to a definition", async () => {
    const requests = await connection`select title, expected_impact, measurement_draft, outcome_closure from requests where org_id = ${ORG} order by created_at`;
    const byTitle = Object.fromEntries(requests.map((request) => [request.title, request]));
    const current = await resolvedNames(requests.map((request) => request.expected_impact));
    expect(Object.fromEntries(requests.map((request, index) => [request.title, current[index]]))).toEqual({
      "Built-in plan": ["Conversion rate", "Checkout errors", "User error rate"],
      "Typed plan": ["Signups (count)", "Signups (%)", "Conversion rate", "Conversion rate (count)"],
      "Older plan": ["Conversions", "Median time to convert (minutes)"],
      "Legacy metric": ["Signups (users)", "Page load time", "Checkout errors"],
      "Legacy verification": ["Refund requests"],
      "Pass/fail plan": [],
      "Long names": [`${"x".repeat(112)} (count)`, `${"x".repeat(116)} (%)`],
      "Draft only": [],
      "Revised plan": ["Feature adoption rate"],
      "Closed plan": ["Retention"],
    });
    expect(await resolvedNames([byTitle["Draft only"].measurement_draft])).toEqual([["Activation rate"]]);
    expect(await resolvedNames([byTitle["Closed plan"].outcome_closure.expected])).toEqual([["Retention", "Repeat orders"]]);
    const revisions = await connection`select v.expected_impact from request_expected_impact_revisions v join requests r on r.id = v.request_id where r.org_id = ${ORG} and r.title = 'Revised plan' order by v.revision`;
    expect(await resolvedNames(revisions.map((revision) => revision.expected_impact))).toEqual([["Trial starts"], ["Feature adoption rate"]]);
  });

  it("records each saved metric's mapping once per workspace", async () => {
    const aliases = await connection`select count(*)::int as n, count(distinct (builtin_key, typed_name, unit))::int as distinct_n from metric_definition_aliases where org_id = ${ORG}`;
    expect(aliases[0].n).toBe(aliases[0].distinct_n);
    await expect(connection`insert into metric_definition_aliases (org_id, definition_id, builtin_key, unit) select org_id, definition_id, builtin_key, unit from metric_definition_aliases where org_id = ${ORG} and builtin_key = 'conversion' and unit = 'percent'`).rejects.toMatchObject({ code: "23505" });
    const [foreign] = await connection`select id from metric_definitions where org_id = ${OTHER_ORG} limit 1`;
    await expect(connection`insert into metric_definition_aliases (org_id, definition_id, typed_name, unit) values (${ORG}, ${foreign.id}, 'borrowed', 'count')`).rejects.toMatchObject({ code: "23503" });
  });

  it("changes no Request row and no Expected impact revision", async () => {
    const changedRequests = await connection`select b.id, e.key from metrics_migration_before.requests b
      cross join lateral jsonb_each(b.saved) e(key, value)
      left join requests r on r.id = b.id
      where r.id is null or to_jsonb(r) -> e.key is distinct from e.value`;
    expect(changedRequests).toEqual([]);
    const changedRevisions = await connection`select b.id from metrics_migration_before.revisions b
      left join request_expected_impact_revisions v on v.id = b.id
      where v.id is null or to_jsonb(v) is distinct from b.saved`;
    expect(changedRevisions).toEqual([]);
    const [{ count }] = await connection`select count(*)::int from metrics_migration_before.requests`;
    expect(count).toBeGreaterThan(10);
  });

  it("keeps the mapping table away from the Data API", async () => {
    const [table] = await connection`select relrowsecurity from pg_class where oid = 'public.metric_definition_aliases'::regclass`;
    expect(table.relrowsecurity).toBe(true);
    const grants = await connection`select grantee from information_schema.role_table_grants where table_name = 'metric_definition_aliases' and grantee in ('PUBLIC','anon','authenticated')`;
    expect(grants).toEqual([]);
  });
});
