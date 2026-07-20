import postgres from "postgres";
import { randomUUID } from "node:crypto";

export async function cleanupTestWorkspace(
  userId: string
): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
  });

  try {
    const [profile] = await sql`
      SELECT org_id FROM profiles WHERE id = ${userId}
    `;

    if (profile?.org_id) {
      await sql`
        DELETE FROM notifications
        WHERE user_id = ${userId} OR actor_id = ${userId}
      `;
      await sql`DELETE FROM comments WHERE author_id = ${userId}`;
      await sql`UPDATE requests SET assigned_to = NULL WHERE assigned_to = ${userId}`;
      await sql`DELETE FROM requests WHERE created_by = ${userId}`;
    }

    await sql`DELETE FROM invites WHERE invited_by = ${userId}`;
    await sql`DELETE FROM workspace_members WHERE user_id = ${userId}`;
    await sql`DELETE FROM profiles WHERE id = ${userId}`;

    if (profile?.org_id) {
      const [remaining] = await sql`
        SELECT count(*)::int AS c FROM workspace_members
        WHERE workspace_id = ${profile.org_id}
      `;
      if (remaining.c === 0) {
        await sql`DELETE FROM invites WHERE org_id = ${profile.org_id}`;
        await sql`DELETE FROM organizations WHERE id = ${profile.org_id}`;
      }
    }
  } finally {
    await sql.end();
  }
}

export async function cleanupTestInvite(token: string): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
  });

  try {
    await sql`DELETE FROM invites WHERE token = ${token}`;
  } finally {
    await sql.end();
  }
}

export async function seedPendingInvite(
  orgId: string,
  email: string,
  token: string,
  role = "member"
): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
  });

  try {
    await sql`
      INSERT INTO invites (org_id, email, token, role, status, expires_at)
      VALUES (${orgId}, ${email}, ${token}, ${role}, 'pending',
              now() + interval '24 hours')
    `;
  } finally {
    await sql.end();
  }
}

export async function createTestWorkspace(
  name: string,
  slug: string
): Promise<string> {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
  });

  try {
    const [row] = await sql`
      INSERT INTO organizations (name, slug)
      VALUES (${name}, ${slug})
      RETURNING id
    `;
    return row.id;
  } finally {
    await sql.end();
  }
}

export async function getProfileFullName(
  userId: string
): Promise<string | null> {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
  });

  try {
    const [row] = await sql`
      SELECT full_name FROM profiles WHERE id = ${userId}
    `;
    return row?.full_name ?? null;
  } finally {
    await sql.end();
  }
}

export async function getProfileRole(userId: string): Promise<string | null> {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
  });

  try {
    const [row] = await sql`
      SELECT role FROM profiles WHERE id = ${userId}
    `;
    return row?.role ?? null;
  } finally {
    await sql.end();
  }
}

export async function getTestWorkspaceId(
  userId: string
): Promise<string> {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
  });

  try {
    const [row] = await sql`
      SELECT org_id FROM profiles WHERE id = ${userId}
    `;
    if (!row?.org_id) throw new Error("[e2e] profile workspace not found");
    return row.org_id;
  } finally {
    await sql.end();
  }
}

export async function seedTestRequest(
  userId: string,
  title: string
): Promise<{ id: string; orgId: string }> {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
  });

  try {
    const [profile] = await sql`
      SELECT org_id FROM profiles WHERE id = ${userId}
    `;
    if (!profile?.org_id) throw new Error("[e2e] profile workspace not found");

    const id = randomUUID();
    await sql`
      INSERT INTO requests (id, org_id, title, description, status, created_by)
      VALUES (${id}, ${profile.org_id}, ${title},
              'Only members of workspace A may read this request.', 'open', ${userId})
    `;
    return { id, orgId: profile.org_id };
  } finally {
    await sql.end();
  }
}

export async function seedRowIdentityFixtures(
  userId: string
): Promise<{ requestId: string }> {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
  });

  try {
    const [profile] = await sql`
      SELECT org_id FROM profiles WHERE id = ${userId}
    `;
    if (!profile?.org_id) throw new Error("[e2e] profile workspace not found");

    await sql`
      UPDATE profiles
      SET email = 'row.identity@lane-e2e-test.local'
      WHERE id = ${userId}
    `;

    await sql`
      INSERT INTO invites (
        org_id, email, token, role, status, invited_by, expires_at
      )
      VALUES (
        ${profile.org_id},
        'maya.longlastname@northstar-studio.example',
        ${`e2e-row-${randomUUID()}`},
        'admin',
        'pending',
        ${userId},
        '2030-07-24T12:00:00.000Z'
      ), (
        ${profile.org_id},
        'maya1.longlastname@northstar-studio.example',
        ${`e2e-row-${randomUUID()}`},
        'member',
        'pending',
        ${userId},
        '2030-07-24T12:00:00.000Z'
      ), (
        ${profile.org_id},
        'maya2.longlastname@northstar-studio.example',
        ${`e2e-row-${randomUUID()}`},
        'member',
        'pending',
        ${userId},
        '2030-07-24T12:00:00.000Z'
      )
    `;

    const requestId = randomUUID();
    await sql`
      INSERT INTO requests (
        id, org_id, title, description, classification, reframed_problem,
        status, created_by
      )
      VALUES (
        ${requestId},
        ${profile.org_id},
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
        ${profile.org_id},
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
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
  });

  try {
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${orgId}`;
    await sql`DELETE FROM profiles WHERE org_id = ${orgId}`;
    await sql`DELETE FROM organizations WHERE id = ${orgId}`;
  } finally {
    await sql.end();
  }
}
