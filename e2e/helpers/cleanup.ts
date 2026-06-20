import postgres from "postgres";

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

    await sql`DELETE FROM workspace_members WHERE user_id = ${userId}`;
    await sql`DELETE FROM profiles WHERE id = ${userId}`;

    if (profile?.org_id) {
      const [remaining] = await sql`
        SELECT count(*)::int AS c FROM workspace_members
        WHERE workspace_id = ${profile.org_id}
      `;
      if (remaining.c === 0) {
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
