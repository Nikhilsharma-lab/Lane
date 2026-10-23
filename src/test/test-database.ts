/**
 * The disposable local databases tests may reset: `lane_test` for the main
 * checkout, or `lane_test_<copy>` for one git worktree, so two sessions'
 * runs never reset each other's database mid-run. Nothing else is ever
 * dropped or written by the suite.
 */
export const TEST_DATABASE_PATH = /^\/lane_test(_[a-z0-9_]{1,48})?$/;

/** The worktree's own test database name, or lane_test outside a worktree. */
export function testDatabaseFor(cwd: string): string {
  const copy = /\/\.claude\/worktrees\/([^/]+)/.exec(cwd)?.[1];
  if (!copy) return "lane_test";
  return `lane_test_${copy.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "copy"}`;
}

/** Whether `databaseUrl` is a loopback test database the suite may reset. */
export function isLocalTestDatabase(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  const url = new URL(databaseUrl);
  return ["localhost", "127.0.0.1"].includes(url.hostname) && TEST_DATABASE_PATH.test(url.pathname);
}
