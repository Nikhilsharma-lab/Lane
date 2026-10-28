import { readdirSync } from "node:fs";
import path from "path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../db/migrations");

/**
 * 0013 replaces every Lane table from the local baseline (see local-baseline.ts),
 * so a fresh lane_test starts there. Earlier files describe the pre-Clerk schema.
 */
export const FIRST_LOCAL_MIGRATION = 13;

/**
 * Test data a migration must find already in place, so its tests can check
 * what it does to existing rows. Paths are relative to this folder.
 */
export const FIXTURES_BEFORE: Record<string, string[]> = {
  "0028_request_agreements.sql": ["../db/test-fixtures.sql", "agreement-migration-fixtures.sql"],
  "0031_simple_request_agreement.sql": ["agreement-seat-fixtures.sql"],
  "0034_reminders_and_done_time.sql": ["done-time-fixtures.sql"],
  "0035_expected_impact_history.sql": ["expected-impact-history-fixtures.sql"],
  "0038_saved_metrics_into_library.sql": ["metrics-migration-fixtures.sql"],
  "0040_retire_reminder_types.sql": ["retired-reminders-fixtures.sql"],
  "0044_retire_invitation_reviewers.sql": ["invitation-reviewers-fixtures.sql"],
  "0046_free_requests.sql": ["free-requests-fixtures.sql"],
};

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * The SQL files a fresh lane_test runs after the baseline, in order: every
 * migration from 0013 in the migrations folder, each preceded by its fixtures.
 * A new migration joins the reset by being added to the folder. A gap, a
 * repeated number or a fixture whose migration is missing stops the reset
 * instead of testing an incomplete schema.
 */
export function migrationPlan(files: string[] = readdirSync(MIGRATIONS_DIR)): string[] {
  const migrations = files
    .map((file) => ({ file, number: Number(/^(\d{4})\D/.exec(file)?.[1]) }))
    .filter(({ number }) => number >= FIRST_LOCAL_MIGRATION)
    .sort((a, b) => a.number - b.number);
  // A numbered file the reset can't run is a mistake, never something to skip.
  for (const { file } of migrations)
    if (!MIGRATION_FILE.test(file)) throw new Error(`[test-setup] ${file} is not named NNNN_lower_snake_case.sql.`);
  migrations.forEach(({ file, number }, index) => {
    const expected = FIRST_LOCAL_MIGRATION + index;
    if (number !== expected)
      throw new Error(`[test-setup] Expected migration ${String(expected).padStart(4, "0")} next; found ${file}.`);
  });
  const names = migrations.map(({ file }) => file);
  for (const target of Object.keys(FIXTURES_BEFORE))
    if (!names.includes(target)) throw new Error(`[test-setup] Fixtures wait for ${target}, which is not in the migrations folder.`);
  return names.flatMap((file) => [
    ...(FIXTURES_BEFORE[file] ?? []).map((fixture) => path.resolve(__dirname, fixture)),
    path.join(MIGRATIONS_DIR, file),
  ]);
}
