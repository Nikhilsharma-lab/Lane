/**
 * Nav seed — creates workspace, teams, users (admin/member/guest), and streams
 *
 * Usage:
 *   node scripts/seed-nav.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Safe to re-run: skips if workspace slug already exists.
 */

import postgres from "postgres";
import { readFileSync } from "fs";

// ── Load env ────────────────────────────────────────────────────────────────
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY not found in .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

// ── Auth helper ─────────────────────────────────────────────────────────────
async function ensureAuthUser(email, fullName) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      email,
      password: "seed1234",
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    if (err.msg?.includes("already been registered") || err.code === "email_exists") {
      const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
        },
      );
      const list = await listRes.json();
      const existing = list.users?.find((u) => u.email === email);
      if (existing) return existing.id;
      throw new Error(`Could not find existing user for ${email}`);
    }
    throw new Error(`Auth API error for ${email}: ${JSON.stringify(err)}`);
  }
  return (await res.json()).id;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Nav seed starting...\n");

  const WS_SLUG = "lane-nav-seed";

  // Check idempotency
  const existing = await sql`SELECT id FROM organizations WHERE slug = ${WS_SLUG} LIMIT 1`;
  if (existing.length > 0) {
    console.log(`⚡ Nav seed workspace "${WS_SLUG}" already exists — skipping.`);
    await sql.end();
    return;
  }

  // ── 1. Create three auth users ────────────────────────────────────────────
  const adminAuthId = await ensureAuthUser("admin@lane-nav.io", "Dana Admin");
  const memberAuthId = await ensureAuthUser("member@lane-nav.io", "Morgan Member");
  const guestAuthId = await ensureAuthUser("guest@lane-nav.io", "Riley Guest");

  console.log("✓ Auth users created");

  // ── 2. Create workspace ───────────────────────────────────────────────────
  const [ws] = await sql`
    INSERT INTO organizations (name, slug, owner_id, plan)
    VALUES ('Lane Nav Seed', ${WS_SLUG}, ${adminAuthId}, 'pro')
    RETURNING id
  `;
  console.log(`✓ Workspace: Lane Nav Seed (${ws.id})`);

  // ── 3. Create profiles ────────────────────────────────────────────────────
  await sql`
    INSERT INTO profiles (id, org_id, full_name, email, role)
    VALUES
      (${adminAuthId},  ${ws.id}, 'Dana Admin',    'admin@lane-nav.io',  'admin'),
      (${memberAuthId}, ${ws.id}, 'Morgan Member', 'member@lane-nav.io', 'designer'),
      (${guestAuthId},  ${ws.id}, 'Riley Guest',   'guest@lane-nav.io',  'designer')
    ON CONFLICT (id) DO NOTHING
  `;
  console.log("✓ Profiles created");

  // ── 4. Workspace memberships ──────────────────────────────────────────────
  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES
      (${ws.id}, ${adminAuthId},  'admin'),
      (${ws.id}, ${memberAuthId}, 'member'),
      (${ws.id}, ${guestAuthId},  'guest')
  `;
  console.log("✓ Workspace memberships created");

  // ── 5. Create two teams ───────────────────────────────────────────────────
  const [teamA] = await sql`
    INSERT INTO projects (org_id, name, slug, created_by)
    VALUES (${ws.id}, 'Consumer App', 'consumer-app', ${adminAuthId})
    RETURNING id
  `;
  const [teamB] = await sql`
    INSERT INTO projects (org_id, name, slug, created_by)
    VALUES (${ws.id}, 'Payments', 'payments', ${adminAuthId})
    RETURNING id
  `;
  console.log(`✓ Teams: Consumer App (${teamA.id}), Payments (${teamB.id})`);

  // ── 6. Team memberships ────────────────────────────────────────────────────
  await sql`
    INSERT INTO project_members (project_id, user_id, role, team_role, is_team_admin)
    VALUES
      (${teamA.id}, ${adminAuthId},  'lead',     'lead',     true),
      (${teamA.id}, ${memberAuthId}, 'member',   'designer', false),
      (${teamB.id}, ${adminAuthId},  'lead',     'lead',     true),
      (${teamB.id}, ${memberAuthId}, 'member',   'designer', false)
  `;
  console.log("✓ Team memberships created (member on both teams)");

  // ── 7. Create streams (requests) ──────────────────────────────────────────
  // Canonical phases: sense, explore, interrogate, validate, refine
  const streamDefs = [
    // Consumer App — 5 streams
    { team: teamA.id, title: "KYC friction audit",       phase: "design", stage: "sense"       },
    { team: teamA.id, title: "Onboarding redesign",      phase: "design", stage: "explore"     },
    { team: teamA.id, title: "Checkout flow v2",         phase: "design", stage: "interrogate" },
    { team: teamA.id, title: "Search results ranking",   phase: "design", stage: "validate"    },
    { team: teamA.id, title: "Account settings refresh", phase: "design", stage: "refine"      },
    // Payments — 4 streams
    { team: teamB.id, title: "Invoice PDF export",       phase: "design", stage: "sense"       },
    { team: teamB.id, title: "Subscription pause flow",  phase: "design", stage: "explore"     },
    { team: teamB.id, title: "Refund dispute UX",        phase: "design", stage: "interrogate" },
    { team: teamB.id, title: "Payment method selector",  phase: "design", stage: "validate"    },
  ];

  const streamIds = [];
  for (const s of streamDefs) {
    const [row] = await sql`
      INSERT INTO requests (
        org_id, project_id, requester_id, title, description,
        status, stage, phase, design_stage, designer_owner_id
      ) VALUES (
        ${ws.id}, ${s.team}, ${adminAuthId}, ${s.title}, ${"Seed stream for nav testing"},
        'in_progress', 'intake',
        ${s.phase}, ${s.stage}, ${s.team === teamA.id ? memberAuthId : adminAuthId}
      )
      RETURNING id
    `;
    streamIds.push(row.id);
    console.log(`  ↳ Stream: ${s.title} (${s.team === teamA.id ? "Consumer App" : "Payments"})`);
  }

  // ── 8. Guest access — invite to one Payments stream ───────────────────────
  await sql`
    INSERT INTO stream_guests (stream_id, user_id, invited_by, can_comment)
    VALUES (${streamIds[5]}, ${guestAuthId}, ${adminAuthId}, true)
  `;
  console.log("✓ Guest invited to 'Invoice PDF export'");

  console.log(`
✅ Nav seed complete!

Workspace: Lane Nav Seed  (slug: ${WS_SLUG})
Teams:     Consumer App, Payments
Users:     admin@lane-nav.io (admin), member@lane-nav.io (member), guest@lane-nav.io (guest)
Streams:   ${streamIds.length} across both teams (5 Consumer App, 4 Payments)
Password:  seed1234
`);

  await sql.end();
}

main().catch((err) => {
  console.error("Nav seed failed:", err);
  process.exit(1);
});
