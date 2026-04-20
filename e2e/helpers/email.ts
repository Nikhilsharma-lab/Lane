/**
 * Test helpers for querying the sent_emails capture table.
 *
 * These helpers READ from sent_emails — they do not require
 * NODE_ENV or ENABLE_TEST_EMAIL_CAPTURE to be set themselves.
 * What they require is that the process which CALLED sendEmail()
 * had those env vars set, so the capture branch in lib/email
 * actually wrote a row.
 *
 * Usage pattern (Phase D):
 *   1. Test triggers an action that calls sendEmail() (e.g., invite
 *      creation). The Next.js dev server's process must have
 *      ENABLE_TEST_EMAIL_CAPTURE=true and NODE_ENV!=production.
 *   2. Test calls waitForEmail() to poll until the email appears.
 *   3. Test asserts on the captured row's contents.
 *   4. Test optionally calls clearSentEmails() between tests.
 *
 * NOT for app code — e2e tests only. App code that needs to read
 * email history should use a different (modeled) abstraction.
 *
 * Connection: lazy-init postgres-js client matching the pattern in
 * lib/email/index.ts and scripts/run-sql-tests.mjs. Cheaper imports
 * for tests that don't use email helpers transitively.
 */

import postgres from "postgres";

export type SentEmailRow = {
  id: string;
  to_address: string;
  subject: string;
  body_html: string;
  template_name: string | null;
  created_at: Date;
};

let helperSql: ReturnType<typeof postgres> | null = null;

function getHelperClient() {
  if (!helperSql) {
    const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "e2e/helpers/email requires DIRECT_DATABASE_URL or DATABASE_URL " +
          "to query sent_emails. Set it in .env.local for local runs " +
          "or in CI env for CI runs.",
      );
    }
    helperSql = postgres(url, { max: 1, connect_timeout: 8 });
  }
  return helperSql;
}

/**
 * Returns the most recent captured email for a given recipient,
 * or null if none captured. Sorted by created_at descending.
 */
export async function getLastSentEmail(to: string): Promise<SentEmailRow | null> {
  const sql = getHelperClient();
  const rows = await sql<SentEmailRow[]>`
    SELECT id, to_address, subject, body_html, template_name, created_at
    FROM sent_emails
    WHERE to_address = ${to}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Truncates the sent_emails capture table. Use between tests to
 * keep assertions independent of prior captured emails.
 */
export async function clearSentEmails(): Promise<void> {
  const sql = getHelperClient();
  await sql`TRUNCATE sent_emails`;
}

/**
 * Polls sent_emails until an email for `to` appears or the timeout
 * elapses. Throws on timeout. Transient query errors during the
 * poll loop are logged and retried — only timeout aborts.
 *
 * Default timeout 5000ms (5s) is fine for local runs. CI may want
 * to bump to 10000ms by passing { timeoutMs: 10000 }.
 */
export async function waitForEmail(
  to: string,
  opts?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<SentEmailRow> {
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 200;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const email = await getLastSentEmail(to);
      if (email) return email;
    } catch (err) {
      // Transient query errors during poll: log and continue.
      // Only timeout aborts the wait. Test-runner DB hiccups should
      // not fail the test if the email arrives a moment later.
      console.warn(`[waitForEmail] transient query error (continuing to poll):`, err);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(
    `waitForEmail: no email captured for ${to} within ${timeoutMs}ms ` +
      `(polled every ${pollIntervalMs}ms). Verify the action under test ` +
      `actually triggered sendEmail() and that ENABLE_TEST_EMAIL_CAPTURE=true ` +
      `is set on the process running sendEmail.`,
  );
}
