import "dotenv/config";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL, { prepare: false });

async function run() {
  // Fetch all orgs
  const orgs = await client`SELECT id FROM organizations`;

  for (const org of orgs) {
    // Find first profile in the org to use as createdBy
    const [creator] = await client`
      SELECT id FROM profiles WHERE org_id = ${org.id} LIMIT 1
    `;
    if (!creator) continue;

    // Create General project for this org
    const [general] = await client`
      INSERT INTO projects (id, org_id, name, description, color, created_by, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${org.id},
        'General',
        'Default project for ungrouped requests.',
        '#71717a',
        ${creator.id},
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    // Assign all requests in this org that have no project
    await client`
      UPDATE requests
      SET project_id = ${general.id}
      WHERE org_id = ${org.id} AND project_id IS NULL
    `;

    console.log(`✓ Org ${org.id}: created General project, assigned requests`);
  }

  await client.end();
  console.log("Migration complete.");
}

run().catch((err) => { console.error(err); process.exit(1); });
