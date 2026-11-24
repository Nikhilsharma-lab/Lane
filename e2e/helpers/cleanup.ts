import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { e2eDatabase } from "./database";
import { assertOwnedOrganization, assertOwnedUser, forgetOrganization, ownedUserScope, testEmail } from "./fixtures";
import { deleteEmailCodes } from "./email-codes";
import { createTestWorkspace } from "./workspaces";

export { e2eDatabase } from "./database";

type FunctionalRole = "pm" | "designer" | "developer";

/**
 * #217: marks these people's first runs in the workspace as finished, so journeys that don't test the first run
 * see the page as an existing team does. Skipped where migration 0050 isn't applied yet (staging before it).
 */
export async function finishFirstRuns(sql: postgres.Sql | postgres.TransactionSql, orgId: string, userIds: string[], guide: "first_request" | "joined") {
  const [{ ready }] = await sql`SELECT to_regclass('public.first_run_progress') IS NOT NULL AS ready`;
  if (!ready) return;
  for (const userId of userIds) await sql`
    INSERT INTO first_run_progress (org_id, user_id, guide, completed_at)
    VALUES (${orgId}, ${userId}, ${guide}, now())
    ON CONFLICT (org_id, user_id) DO UPDATE SET completed_at = now(), skipped_at = NULL
  `;
}

/** A workspace for the person, as its Admin, with their name and profile label saved and its first run finished. */
export async function provisionTestWorkspace(options: {
  userId: string;
  /** The person's own address, which createTestUser saved. */
  email: string;
  name: string;
  workspaceName: string;
  role?: FunctionalRole;
  /** #217: leave the creator's first run to start fresh, as a new workspace's does. Finished by default. */
  freshFirstRun?: boolean;
}): Promise<string> {
  const orgId = await createTestWorkspace(options.userId, options.workspaceName);
  const sql = e2eDatabase();
  try {
    await sql`
      UPDATE profiles SET full_name = ${options.name}, role = ${options.role ?? "designer"}, updated_at = now()
      WHERE id = ${options.userId}
    `;
    if (!options.freshFirstRun) await finishFirstRuns(sql, orgId, [options.userId], "first_request");
    return orgId;
  } finally {
    await sql.end();
  }
}

/** Deletes the workspaces this run made for the person, then the person. `deleteTestUser` may still follow. */
export async function cleanupTestWorkspace(userId: string): Promise<void> {
  const { user, orgIds } = await ownedUserScope(userId);
  if (!user) return;
  const sql = e2eDatabase();

  try {
    for (const orgId of orgIds) {
      await sql`DELETE FROM organizations WHERE id = ${orgId} AND owner_id = ${userId}`;
      forgetOrganization(orgId);
    }
    await sql`DELETE FROM profiles WHERE id = ${userId}`;
    await deleteEmailCodes(sql, user.email);
  } finally {
    await sql.end();
  }
}

export async function getProfileFullName(
  userId: string
): Promise<string | null> {
  const sql = e2eDatabase();
  try {
    const [row] = await sql<{ full_name: string }[]>`
      SELECT full_name FROM profiles WHERE id = ${userId}
    `;
    return row?.full_name ?? null;
  } finally {
    await sql.end();
  }
}

export async function getProfileRole(userId: string): Promise<string | null> {
  const sql = e2eDatabase();
  try {
    const [row] = await sql<{ role: string }[]>`
      SELECT role FROM profiles WHERE id = ${userId}
    `;
    return row?.role ?? null;
  } finally {
    await sql.end();
  }
}

export async function getTestWorkspaceId(userId: string): Promise<string> {
  await assertOwnedUser(userId);
  const sql = e2eDatabase();
  try {
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE owner_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!row?.id) throw new Error("[e2e] test workspace not found");
    await assertOwnedOrganization(row.id);
    return row.id;
  } finally {
    await sql.end();
  }
}

export async function seedTestRequest(
  userId: string,
  title: string
): Promise<{ id: string; orgId: string }> {
  const orgId = await getTestWorkspaceId(userId);
  const sql = e2eDatabase();

  try {
    const id = randomUUID();
    await sql`
      INSERT INTO requests (id, org_id, title, description, status, created_by)
      VALUES (
        ${id},
        ${orgId},
        ${title},
        'Only members of workspace A may read this request.',
        'open',
        ${userId}
      )
    `;
    return { id, orgId };
  } finally {
    await sql.end();
  }
}

export async function seedRowIdentityFixtures(
  userId: string
): Promise<{ requestId: string }> {
  const orgId = await getTestWorkspaceId(userId);
  const sql = e2eDatabase();

  try {
    await sql`
      UPDATE profiles
      SET email = ${testEmail("row-identity")}
      WHERE id = ${userId}
    `;

    const requestId = randomUUID();
    await sql`
      INSERT INTO requests (
        id, org_id, title, description, classification, reframed_problem,
        status, created_by
      )
      VALUES (
        ${requestId},
        ${orgId},
        'Add a changelog panel to every workspace',
        'Customers cannot tell why a Request changed after it was submitted.',
        'solution',
        'Help customers understand why their Requests changed',
        'open',
        ${userId}
      )
    `;

    await sql`
      INSERT INTO comments (request_id, author_id, body)
      VALUES (
        ${requestId},
        ${userId},
        'The problem statement is clear. Could we add one customer example before pickup?'
      )
    `;

    await sql`
      INSERT INTO notifications (
        user_id, org_id, type, request_id, actor_id, read_at
      )
      VALUES (
        ${userId},
        ${orgId},
        'comment_added',
        ${requestId},
        ${userId},
        NULL
      )
    `;

    return { requestId };
  } finally {
    await sql.end();
  }
}

export async function deleteTestWorkspace(orgId: string): Promise<void> {
  await assertOwnedOrganization(orgId);
  const sql = e2eDatabase();
  try {
    await sql`DELETE FROM organizations WHERE id = ${orgId}`;
  } finally {
    await sql.end();
  }

  forgetOrganization(orgId);
}

/** #258: Open Requests with one unread For-your-information item each, so both the Requests list and the Inbox have several rows to preview. */
export async function seedPreviewFixtures(userId: string, titles: string[]): Promise<string[]> {
  const requests = [];
  for (const title of titles) requests.push(await seedTestRequest(userId, title));
  const sql = e2eDatabase();
  try {
    await sql`
      INSERT INTO notifications ${sql(requests.map(({ id, orgId }) => ({ user_id: userId, org_id: orgId, type: "comment_added", request_id: id, actor_id: userId, read_at: null })))}
    `;
    return requests.map(({ id }) => id);
  } finally {
    await sql.end();
  }
}
