import path from "path";
import { describe, expect, it } from "vitest";
import { migrationPlan } from "./migration-plan";

const names = (plan: string[]) => plan.map((file) => path.relative(path.resolve(__dirname, ".."), file));
const folder = ["0001_rls_policies.sql", "0012_evidence_rich_intake.sql", "meta", "manual",
  ...Array.from({ length: 19 }, (_, i) => `00${13 + i}_m${13 + i}.sql`)];
const withTargets = (files: string[]) => files.map((file) => file.replace(/^0028_m28/, "0028_request_agreements").replace(/^0031_m31/, "0031_simple_request_agreement"));

describe("migrationPlan", () => {
  it("runs the folder in the order the hand-kept reset did, then anything newer", () => {
    expect(names(migrationPlan()).slice(0, 22)).toEqual([
      "db/migrations/0013_clerk_clean_cutover.sql", "db/migrations/0014_restore_clerk_table_safeguards.sql",
      "db/migrations/0015_request_projects_and_types.sql", "db/migrations/0016_request_expected_impact.sql",
      "db/migrations/0017_request_codes.sql", "db/migrations/0018_request_design_reviews.sql",
      "db/migrations/0019_request_priority.sql", "db/migrations/0020_attachment_capability_accounting.sql",
      "db/migrations/0021_request_impact_optional_source.sql", "db/migrations/0022_request_measurement_plan.sql",
      "db/migrations/0023_request_measurement_draft.sql", "db/migrations/0024_workspace_labels.sql",
      "db/migrations/0025_project_labels.sql", "db/migrations/0026_guardrail_thresholds.sql",
      "db/migrations/0027_measurement_value_units.sql",
      "db/test-fixtures.sql", "test/agreement-migration-fixtures.sql", "db/migrations/0028_request_agreements.sql",
      "db/migrations/0029_request_release.sql", "db/migrations/0030_request_outcome_closure.sql",
      "test/agreement-seat-fixtures.sql", "db/migrations/0031_simple_request_agreement.sql",
    ]);
  });
  it("includes a new migration without editing the reset", () => {
    const plan = names(migrationPlan(withTargets([...folder, "0032_next_change.sql"])));
    expect(plan.at(-1)).toBe("db/migrations/0032_next_change.sql");
    expect(plan[0]).toBe("db/migrations/0013_m13.sql");
  });
  it("stops at a gap, a repeated number or a misnamed file", () => {
    expect(() => migrationPlan(withTargets([...folder, "0033_skipped_one.sql"]))).toThrow("Expected migration 0032 next; found 0033_skipped_one.sql.");
    expect(() => migrationPlan(withTargets([...folder, "0031_twice.sql"]))).toThrow("Expected migration 0032 next");
    expect(() => migrationPlan(withTargets([...folder, "0032-next-change.sql"]))).toThrow("0032-next-change.sql is not named");
  });
  it("stops when fixtures wait for a migration that isn't there", () => {
    expect(() => migrationPlan(folder)).toThrow("Fixtures wait for 0028_request_agreements.sql");
  });
});
