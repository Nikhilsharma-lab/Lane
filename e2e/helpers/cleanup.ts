import { clerkClient } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

type FunctionalRole = "pm" | "designer" | "developer";

function database() {
  if (!process.env.DATABASE_URL) {
    throw new Error("[e2e] DATABASE_URL is required");
  }

  return postgres(process.env.DATABASE_URL, {
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : "require",
    max: 1,
    idle_timeout: 5,
  });
}

export async function provisionTestWorkspace(options: {
  userId: string;
  email: string;
  name: string;
  workspaceName: string;
  role?: FunctionalRole;
}): Promise<string> {
  const client = await clerkClient();
  const organization = await client.organizations.createOrganization({
    name: options.workspaceName,
    createdBy: options.userId,
  });
  const sql = database();

  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO profiles (id, full_name, email, role)
        VALUES (
          ${options.userId},
          ${options.name},
          ${options.email},
          ${options.role ?? "designer"}
        )
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          updated_at = now()
      `;
      await tx`
        INSERT INTO organizations (id, name, slug, owner_id)
        VALUES (
          ${organization.id},
          ${organization.name},
          ${organization.slug ?? organization.id},
          ${options.userId}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          owner_id = EXCLUDED.owner_id,
          updated_at = now()
      `;
    });
    return organization.id;
  } catch (error) {
    await client.organizations
      .deleteOrganization(organization.id)
      .catch(() => undefined);
    throw error;
  } finally {
    await sql.end();
  }
}

export async function cleanupTestWorkspace(userId: string): Promise<void> {
  const sql = database();

  try {
    const organizations = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE owner_id = ${userId}
    `;

    for (const organization of organizations) {
      await sql`DELETE FROM organizations WHERE id = ${organization.id}`;
    }
    await sql`DELETE FROM profiles WHERE id = ${userId}`;
  } finally {
    await sql.end();
  }
}

export async function getProfileFullName(
  userId: string
): Promise<string | null> {
  const sql = database();
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
  const sql = database();
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
  const sql = database();
  try {
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE owner_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!row?.id) throw new Error("[e2e] test workspace not found");
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
  const sql = database();

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
  const sql = database();

  try {
    await sql`
      UPDATE profiles
      SET email = 'row.identity+clerk_test@example.com'
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
  const sql = database();
  try {
    await sql`DELETE FROM organizations WHERE id = ${orgId}`;
  } finally {
    await sql.end();
  }

  const client = await clerkClient();
  await client.organizations.deleteOrganization(orgId).catch(() => undefined);
}
