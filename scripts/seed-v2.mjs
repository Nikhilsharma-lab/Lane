/**
 * Seed V2 — Comprehensive dummy data for all built features.
 *
 * Must run AFTER seed.mjs (which creates org + base users + requests).
 *
 * Seeds:
 *   • 5 new users (Ananya, Riya, Deepak, Sam, Nina)
 *   • Manager relationships (Priya ← all designers)
 *   • 4-phase model fields on all existing requests
 *   • 3 new requests (for new designers' Radar statuses)
 *   • 3 projects (Growth Experiments = empty state)
 *   • 7 ideas + votes + validations (idea 7 = 0 votes = empty state)
 *   • Figma updates (Analytics has 2 unreviewed post-handoff = drift alert)
 *   • Validation signoffs (AI Prefill = 0/3 = empty state)
 *   • Request stage history (for cycle time calculation in Radar)
 *   • Impact records (Dark Mode = measuring, no actual = empty state)
 *   • 3 invites (pending + accepted + expired = empty state)
 *   • Rich comment threads on 5 requests
 *
 * Design Radar coverage after seed:
 *   🟢 Alex Rivera     — in-flow  (updated 8h ago)
 *   🟢 Ananya Krishnan — in-flow  (updated 6h ago)
 *   🟡 Riya Patel      — idle     (updated 3 days ago)
 *   🔴 Deepak Mehta    — stuck    (updated 7 days ago)
 *   🚫 Priya Sharma    — blocked  (Onboarding checklist blocked)
 *   ⚪ Nina Okonkwo    — no-work  [empty state]
 *
 * Usage: node scripts/seed-v2.mjs
 */

import postgres from "postgres";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";

// ── Load env ──────────────────────────────────────────────────────────────────
const envText = readFileSync(".env.local", "utf8");
for (const line of envText.split("\n")) {
  const [k, ...rest] = line.split("=");
  if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY not found in .env.local\n    Add it then re-run.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

// ── Time helpers ──────────────────────────────────────────────────────────────
function daysAgo(n) { return new Date(Date.now() - n * 86_400_000).toISOString(); }
function hoursAgo(n) { return new Date(Date.now() - n * 3_600_000).toISOString(); }
function daysFuture(n) { return new Date(Date.now() + n * 86_400_000).toISOString(); }

// ── Auth helper ────────────────────────────────────────────────────────────────
async function upsertAuthUser(email, fullName) {
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
        { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
      );
      const list = await listRes.json();
      const found = list.users?.find((u) => u.email === email);
      if (found) return found.id;
    }
    throw new Error(`Auth error for ${email}: ${JSON.stringify(err)}`);
  }
  return (await res.json()).id;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱  Seed V2 — comprehensive data for all built features\n");

  // ── 1. Find org ──────────────────────────────────────────────────────────
  const [org] = await sql`SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1`;
  if (!org) {
    console.error("❌  Org 'acme-demo' not found. Run seed.mjs first.");
    process.exit(1);
  }
  console.log(`✓ Org found: ${org.id}\n`);

  // ── 2. Build user map from existing profiles ──────────────────────────────
  const existingProfiles = await sql`SELECT id, email, role FROM profiles WHERE org_id = ${org.id}`;
  const U = {}; // email-prefix → { id, role }
  for (const p of existingProfiles) {
    U[p.email.split("@")[0]] = { id: p.id, role: p.role };
  }
  console.log(`✓ ${existingProfiles.length} existing users loaded`);

  // ── 3. Create new users ───────────────────────────────────────────────────
  const NEW_USERS = [
    { email: "ananya@acme-demo.io", fullName: "Ananya Krishnan",  role: "designer"  },
    { email: "riya@acme-demo.io",   fullName: "Riya Patel",       role: "designer"  },
    { email: "deepak@acme-demo.io", fullName: "Deepak Mehta",     role: "designer"  },
    { email: "sam@acme-demo.io",    fullName: "Sam Torres",       role: "developer" },
    { email: "nina@acme-demo.io",   fullName: "Nina Okonkwo",     role: "designer"  }, // no-work → empty state
  ];
  for (const u of NEW_USERS) {
    const key = u.email.split("@")[0];
    if (!U[key]) {
      const id = await upsertAuthUser(u.email, u.fullName);
      await sql`
        INSERT INTO profiles (id, org_id, full_name, email, role)
        VALUES (${id}, ${org.id}, ${u.fullName}, ${u.email}, ${u.role})
        ON CONFLICT (id) DO UPDATE SET org_id = ${org.id}
      `;
      U[key] = { id, role: u.role };
      console.log(`  ✓ Created: ${u.fullName} (${u.role})`);
    } else {
      console.log(`  ↷ ${u.fullName} already exists`);
    }
  }

  // ── 4. Manager relationships ──────────────────────────────────────────────
  //    Priya = Design Head (lead, no managerId)
  //    All designers report to Priya
  for (const key of ["alex", "ananya", "riya", "deepak", "nina"]) {
    if (U[key]) {
      await sql`UPDATE profiles SET manager_id = ${U.priya.id} WHERE id = ${U[key].id} AND manager_id IS NULL`;
    }
  }
  console.log(`\n✓ Manager relationships set: Priya ← Alex, Ananya, Riya, Deepak, Nina`);

  // ── 5. Load existing requests ─────────────────────────────────────────────
  const allReqs = await sql`SELECT id, title FROM requests WHERE org_id = ${org.id}`;
  // Returns first matching request ID by title prefix
  function findReq(prefix) {
    return allReqs.find((r) => r.title.startsWith(prefix))?.id ?? null;
  }

  const R = {
    checkout:   findReq("Redesign checkout flow"),
    empty:      findReq("Empty state designs"),
    mobile:     findReq("Mobile responsiveness"),
    aiprefill:  findReq("Request submission form"),
    tokens:     findReq("Design system token"),
    notifpref:  findReq("Notification preferences"),
    bulk:       findReq("Bulk request status"),
    analytics:  findReq("Analytics dashboard"),
    figmaplug:  findReq("Figma plugin"),
    template:   findReq("Request template library"),
    darkmode:   findReq("Dark/light mode toggle"),
    onboarding: findReq("Onboarding checklist"),
  };
  console.log(`✓ ${allReqs.length} existing requests loaded\n`);

  // ── 6. Update 4-phase model fields on all existing requests ───────────────
  console.log("Updating 4-phase model fields...");

  if (R.checkout) await sql`
    UPDATE requests SET
      phase = 'track', predesign_stage = 'bet', design_stage = 'handoff',
      kanban_state = 'done', track_stage = 'complete',
      figma_url = 'https://www.figma.com/design/abc123/Checkout-Redesign-v3',
      figma_version_id = 'ver_checkout_v3',
      figma_locked_at = ${daysAgo(30)},
      updated_at = ${daysAgo(3)}
    WHERE id = ${R.checkout}
  `;

  if (R.empty) await sql`
    UPDATE requests SET
      phase = 'design', predesign_stage = 'bet', design_stage = 'validate',
      figma_url = 'https://www.figma.com/design/def456/Empty-States-v2',
      updated_at = ${daysAgo(4)}
    WHERE id = ${R.empty}
  `;

  if (R.mobile) await sql`
    UPDATE requests SET
      phase = 'design', predesign_stage = 'bet', design_stage = 'explore',
      updated_at = ${daysAgo(2)}
    WHERE id = ${R.mobile}
  `;

  if (R.aiprefill) await sql`
    UPDATE requests SET
      phase = 'design', predesign_stage = 'bet', design_stage = 'explore',
      figma_url = 'https://www.figma.com/design/ghi789/AI-Prefill-Form-v1',
      updated_at = ${hoursAgo(8)}
    WHERE id = ${R.aiprefill}
  `;

  if (R.tokens) await sql`
    UPDATE requests SET
      phase = 'predesign', predesign_stage = 'context',
      updated_at = ${daysAgo(5)}
    WHERE id = ${R.tokens}
  `;

  if (R.notifpref) await sql`
    UPDATE requests SET
      phase = 'predesign', predesign_stage = 'intake',
      updated_at = ${daysAgo(2)}
    WHERE id = ${R.notifpref}
  `;

  if (R.bulk) await sql`
    UPDATE requests SET
      phase = 'predesign', predesign_stage = 'context',
      updated_at = ${daysAgo(7)}
    WHERE id = ${R.bulk}
  `;

  if (R.analytics) await sql`
    UPDATE requests SET
      phase = 'dev', predesign_stage = 'bet', design_stage = 'handoff',
      kanban_state = 'in_progress',
      figma_url = 'https://www.figma.com/design/jkl012/Analytics-Dashboard-v2',
      figma_version_id = 'ver_analytics_v2',
      figma_locked_at = ${daysAgo(10)},
      dev_owner_id = ${U.sam?.id ?? U.jordan.id},
      updated_at = ${daysAgo(2)}
    WHERE id = ${R.analytics}
  `;

  if (R.figmaplug) await sql`
    UPDATE requests SET
      phase = 'predesign', predesign_stage = 'bet',
      updated_at = ${daysAgo(14)}
    WHERE id = ${R.figmaplug}
  `;

  if (R.template) await sql`
    UPDATE requests SET
      phase = 'predesign', predesign_stage = 'intake',
      updated_at = ${daysAgo(1)}
    WHERE id = ${R.template}
  `;

  // Dark mode → track / measuring (no actual impact yet = empty state for impact tracking)
  if (R.darkmode) await sql`
    UPDATE requests SET
      phase = 'track', predesign_stage = 'bet', design_stage = 'handoff',
      kanban_state = 'done', track_stage = 'measuring',
      figma_url = 'https://www.figma.com/design/mno345/Dark-Light-Mode-v1',
      figma_version_id = 'ver_darkmode_v1',
      figma_locked_at = ${daysAgo(50)},
      updated_at = ${daysAgo(7)}
    WHERE id = ${R.darkmode}
  `;

  if (R.onboarding) await sql`
    UPDATE requests SET
      phase = 'design', predesign_stage = 'bet', design_stage = 'explore',
      updated_at = ${daysAgo(6)}
    WHERE id = ${R.onboarding}
  `;

  console.log("✓ 4-phase fields updated\n");

  // ── 7. New requests for new designers (Radar statuses) ───────────────────
  console.log("Creating new designer requests...");

  async function upsertRequest(data) {
    const [existing] = await sql`SELECT id FROM requests WHERE org_id = ${org.id} AND title = ${data.title} LIMIT 1`;
    if (existing) return existing.id;
    const [r] = await sql`
      INSERT INTO requests (
        org_id, requester_id, title, description,
        business_context, success_metrics,
        status, stage, phase, design_stage,
        priority, complexity, request_type,
        figma_url, created_at, updated_at
      ) VALUES (
        ${org.id}, ${data.requesterId}, ${data.title}, ${data.description},
        ${data.businessContext ?? null}, ${data.successMetrics ?? null},
        ${data.status}, ${data.stage}, ${data.phase}, ${data.designStage ?? null},
        ${data.priority ?? null}, ${data.complexity ?? null}, ${data.requestType ?? null},
        ${data.figmaUrl ?? null}, ${data.createdAt}, ${data.updatedAt}
      ) RETURNING id
    `;
    return r.id;
  }

  async function upsertAssignment(requestId, assigneeId, assignedById) {
    const [existing] = await sql`SELECT id FROM assignments WHERE request_id = ${requestId} AND assignee_id = ${assigneeId} LIMIT 1`;
    if (existing) return;
    await sql`
      INSERT INTO assignments (request_id, assignee_id, assigned_by_id, role)
      VALUES (${requestId}, ${assigneeId}, ${assignedById}, 'lead')
    `;
  }

  // Ananya — in-flow (updated 6h ago) ─────────────────────────────────────
  const ananyaReq1 = await upsertRequest({
    title: "Payment confirmation screen redesign",
    description: "The payment confirmation screen feels generic and transactional. Redesign with trust signals, clear next steps, and a celebratory moment to reduce post-purchase anxiety and refund rates.",
    businessContext: "Post-purchase anxiety drives 8% of refund requests within 24h. Improving the confirmation experience should meaningfully reduce this.",
    successMetrics: "Refund request rate drops below 5% within 30 days of launch. Measure via Stripe refund dashboard.",
    status: "in_progress", stage: "explore", phase: "design", designStage: "explore",
    priority: "p1", complexity: 3, requestType: "feature",
    figmaUrl: "https://www.figma.com/design/pay001/Payment-Confirmation-v2",
    requesterId: U.marcus.id,
    createdAt: daysAgo(9),
    updatedAt: hoursAgo(6),
  });
  await upsertAssignment(ananyaReq1, U.ananya.id, U.priya.id);

  const ananyaReq2 = await upsertRequest({
    title: "Profile settings page visual refresh",
    description: "Current profile settings page is dense, hard to scan, and has no visual grouping. Needs a clear hierarchy, section dividers, inline validation, and avatar upload support.",
    businessContext: "Profile completion rate is 41%. Designers with complete profiles get 2x better Radar signal quality. Improving this directly improves Radar accuracy.",
    successMetrics: "Profile completion rate ≥ 65% within 45 days of launch.",
    status: "assigned", stage: "explore", phase: "design", designStage: "explore",
    priority: "p2", complexity: 2, requestType: "feature",
    requesterId: U.sarah.id,
    createdAt: daysAgo(6),
    updatedAt: hoursAgo(18),
  });
  await upsertAssignment(ananyaReq2, U.ananya.id, U.priya.id);

  // Riya — idle (updated 3 days ago) ──────────────────────────────────────
  const riyaReq1 = await upsertRequest({
    title: "Search results page UX refresh",
    description: "Search returns a flat list with no filtering, sorting, or hover preview. Users abandon search and manually browse the dashboard instead. Need: filter panel (status, assignee, date range), sort options, and a result preview on hover.",
    businessContext: "Search is used by 68% of active users but has only a 12% success rate — users rarely find what they need on the first try.",
    successMetrics: "Search success rate (user finds target in first 3 results) ≥ 40%.",
    status: "in_progress", stage: "explore", phase: "design", designStage: "explore",
    priority: "p1", complexity: 3, requestType: "feature",
    figmaUrl: "https://www.figma.com/design/srch01/Search-Results-Refresh-v1",
    requesterId: U.marcus.id,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(3),
  });
  await upsertAssignment(riyaReq1, U.riya.id, U.priya.id);

  // Deepak — stuck (updated 7 days ago) ───────────────────────────────────
  const deepakReq1 = await upsertRequest({
    title: "Error state illustration library",
    description: "App currently shows raw error text with no visual treatment. Need a custom illustration set for: 404 Not Found, 500 Server Error, Empty Search Results, Offline / No Connection, and Permission Denied. All illustrations must match brand.",
    businessContext: "Error states are high-anxiety moments. Branded error illustrations reduce support ticket volume by ~20% (industry benchmark from Intercom research).",
    successMetrics: "Error-triggered support tickets decrease by 15% within 60 days of rollout.",
    status: "in_progress", stage: "explore", phase: "design", designStage: "explore",
    priority: "p2", complexity: 4, requestType: "feature",
    requesterId: U.jordan.id,
    createdAt: daysAgo(18),
    updatedAt: daysAgo(7),
  });
  await upsertAssignment(deepakReq1, U.deepak.id, U.priya.id);

  // Nina — no assignments → no-work (EMPTY STATE for Radar)
  console.log("✓ New requests + assignments: Ananya ×2, Riya ×1, Deepak ×1, Nina = no-work\n");

  // ── 8. Projects ───────────────────────────────────────────────────────────
  console.log("Creating projects...");

  async function upsertProject(name, description, color) {
    const [existing] = await sql`SELECT id FROM projects WHERE org_id = ${org.id} AND name = ${name} LIMIT 1`;
    if (existing) return existing.id;
    const [p] = await sql`
      INSERT INTO projects (org_id, name, description, color, created_by)
      VALUES (${org.id}, ${name}, ${description}, ${color}, ${U.priya.id})
      RETURNING id
    `;
    return p.id;
  }

  const projMobile    = await upsertProject("Mobile App",           "End-to-end redesign of the iOS and Android app experience",                                     "#6366f1");
  const projDesignSys = await upsertProject("Design System",        "Shared component library, token documentation, and contribution guidelines",                    "#10b981");
  const projGrowth    = await upsertProject("Growth Experiments",   "Rapid design explorations for acquisition and activation experiments",                          "#f59e0b"); // EMPTY STATE

  // Link requests → projects
  if (R.checkout)   await sql`UPDATE requests SET project_id = ${projMobile}    WHERE id = ${R.checkout}    AND project_id IS NULL`;
  if (R.notifpref)  await sql`UPDATE requests SET project_id = ${projMobile}    WHERE id = ${R.notifpref}   AND project_id IS NULL`;
  if (ananyaReq1)   await sql`UPDATE requests SET project_id = ${projMobile}    WHERE id = ${ananyaReq1}    AND project_id IS NULL`;
  if (R.tokens)     await sql`UPDATE requests SET project_id = ${projDesignSys} WHERE id = ${R.tokens}      AND project_id IS NULL`;
  if (R.darkmode)   await sql`UPDATE requests SET project_id = ${projDesignSys} WHERE id = ${R.darkmode}    AND project_id IS NULL`;
  // projGrowth intentionally has no requests → empty state

  console.log("✓ 3 projects created (Growth Experiments = empty state: 0 requests)\n");

  // ── 9. Ideas ──────────────────────────────────────────────────────────────
  console.log("Creating idea board data...");

  async function upsertIdea(data) {
    const [existing] = await sql`SELECT id FROM ideas WHERE org_id = ${org.id} AND title = ${data.title} LIMIT 1`;
    if (existing) return existing.id;
    const [i] = await sql`
      INSERT INTO ideas (
        org_id, author_id, is_anonymous,
        title, problem, proposed_solution, category,
        impact_estimate, effort_estimate_weeks, target_users,
        status, voting_ends_at, linked_request_id, created_at, updated_at
      ) VALUES (
        ${org.id}, ${data.authorId}, ${data.isAnonymous ?? false},
        ${data.title}, ${data.problem}, ${data.solution}, ${data.category},
        ${data.impactEstimate ?? null}, ${data.effortWeeks ?? null}, ${data.targetUsers ?? null},
        ${data.status}, ${data.votingEndsAt},
        ${data.linkedRequestId ?? null},
        ${data.createdAt}, ${data.createdAt}
      ) RETURNING id
    `;
    return i.id;
  }

  // Idea 1 — Approved
  const idea1 = await upsertIdea({
    title: "Real-time presence indicators on request pages",
    problem: "When multiple people are viewing the same request, there's no way to know. Designers and PMs end up with conflicting edits and redundant Slack messages like 'are you looking at this?'",
    solution: "Show live avatar bubbles (like Figma / Notion) when 2+ people are viewing the same request. No new infrastructure needed — Supabase Realtime already tracks presence channels.",
    category: "feature",
    impactEstimate: "Reduce redundant Slack messages by ~30%, improve async collaboration clarity",
    effortWeeks: 1,
    targetUsers: "All team members who collaborate on design requests",
    status: "approved",
    votingEndsAt: daysAgo(5),
    authorId: U.jordan.id,
    isAnonymous: false,
    createdAt: daysAgo(14),
  });

  // Idea 2 — Validation (approved_with_conditions)
  const idea2 = await upsertIdea({
    title: "AI-generated weekly design team digest",
    problem: "Every Monday, the Design Head spends 30+ minutes manually pulling status updates from Slack, Figma comments, and the dashboard. It's inconsistent and often skipped under deadline pressure.",
    solution: "Auto-generate a digest every Friday at 5 PM: what shipped, what's blocked, cycle times, team health, who needs coaching. Claude Haiku writes the summary from live request data.",
    category: "workflow",
    impactEstimate: "Save Design Head 2+ hours/week; improve team awareness and retrospective quality",
    effortWeeks: 2,
    targetUsers: "Design Head, Design Lead",
    status: "validation",
    votingEndsAt: daysAgo(2),
    authorId: U.marcus.id,
    isAnonymous: true,
    createdAt: daysAgo(10),
  });

  // Idea 3 — Pending votes (high votes)
  const idea3 = await upsertIdea({
    title: "One-click Figma URL linking from the request card",
    problem: "Designers have to open a request, scroll to the Figma URL field, paste the link, and save — sometimes multiple times per day across 5+ requests. It's friction that breaks their flow.",
    solution: "Add a small Figma icon button directly on the request list card. Click it, paste URL, done. The action should take under 5 seconds without opening the full request detail page.",
    category: "ux",
    impactEstimate: "Reduce Figma linking time for designers by ~60%; increase Figma link coverage from 48% to 80%+ of active requests",
    effortWeeks: 1,
    targetUsers: "Designers",
    status: "pending_votes",
    votingEndsAt: daysFuture(5),
    authorId: U.ananya.id,
    isAnonymous: false,
    createdAt: daysAgo(4),
  });

  // Idea 4 — Pending votes (medium votes, contested)
  const idea4 = await upsertIdea({
    title: "Mobile-optimised Design Radar view",
    problem: "Design Radar is designed for desktop. In stand-ups and review meetings, Design Heads use iPads or phones and can't read the Radar clearly — panels are too dense.",
    solution: "Responsive Radar layout: stack panels vertically on mobile, collapse the heat map into a mini sparkline row, keep the risk panel as a priority-sorted list. Same data, smaller canvas.",
    category: "ux",
    impactEstimate: "Enable Design Radar use during mobile stand-ups and meetings",
    effortWeeks: 2,
    targetUsers: "Design Head, Design Lead",
    status: "pending_votes",
    votingEndsAt: daysFuture(3),
    authorId: U.priya.id,
    isAnonymous: false,
    createdAt: daysAgo(3),
  });

  // Idea 5 — Rejected
  const idea5 = await upsertIdea({
    title: "Native Slack integration for comment @mentions",
    problem: "Users miss @mention notifications because they don't check DesignQ frequently enough. Slack is where the team actually lives — notifications there would close the loop faster.",
    solution: "When someone is @mentioned in a request comment, send them a DM in Slack. Use Slack OAuth (connect once per org, no per-user setup) and the Slack Web API for DMs.",
    category: "workflow",
    impactEstimate: "Reduce average @mention response time from 4h to 30min",
    effortWeeks: 4,
    targetUsers: "All team members",
    status: "rejected",
    votingEndsAt: daysAgo(10),
    authorId: U.sarah.id,
    isAnonymous: false,
    createdAt: daysAgo(18),
  });

  // Idea 6 — Archived
  const idea6 = await upsertIdea({
    title: "Emoji reactions on request comments",
    problem: "The only way to acknowledge a comment is to reply with text, which creates noise. Lightweight emoji reactions (👍 🔥 🤔) would acknowledge input without cluttering the thread.",
    solution: "Add an emoji picker to each comment. Store reactions as a JSONB column on the comments table. Show aggregated count with reactors on hover.",
    category: "feature",
    impactEstimate: "Reduce comment thread noise; improve team engagement on async reviews",
    effortWeeks: 1,
    targetUsers: "All team members",
    status: "archived",
    votingEndsAt: daysAgo(20),
    authorId: U.jordan.id,
    isAnonymous: true,
    createdAt: daysAgo(25),
  });

  // Idea 7 — EMPTY STATE: 0 votes, just submitted
  const idea7 = await upsertIdea({
    title: "Request tagging and label system",
    problem: "As request volume grows, there is no way to filter by initiative, product area, or theme. PMs searching for all checkout-related requests have to scroll the full dashboard manually.",
    solution: "Allow any team member to add color-coded labels to requests (e.g. 'checkout', 'mobile', 'growth'). Filter the dashboard by label. Labels are org-scoped and managed in settings.",
    category: "feature",
    impactEstimate: "Reduce time to find related requests from ~3 min to under 30 seconds",
    effortWeeks: 2,
    targetUsers: "PMs, Design Head",
    status: "pending_votes",
    votingEndsAt: daysFuture(7),
    authorId: U.sarah.id,
    isAnonymous: false,
    createdAt: daysAgo(1),
  });
  // idea7 intentionally gets NO votes → empty state

  console.log("✓ 7 ideas created (idea 7 = 0 votes = empty state)");

  // ── 10. Idea votes ────────────────────────────────────────────────────────
  async function vote(ideaId, voterId, type) {
    await sql`
      INSERT INTO idea_votes (idea_id, voter_id, vote_type)
      VALUES (${ideaId}, ${voterId}, ${type})
      ON CONFLICT DO NOTHING
    `;
  }

  // idea1 (approved): 8 up, 2 down
  for (const k of ["priya", "marcus", "sarah", "alex", "jordan", "ananya", "sam", "nina"]) {
    if (U[k]) await vote(idea1, U[k].id, "upvote");
  }
  for (const k of ["riya", "deepak"]) {
    if (U[k]) await vote(idea1, U[k].id, "downvote");
  }

  // idea2 (validation): 9 up, 1 down
  for (const k of ["priya", "marcus", "sarah", "alex", "jordan", "ananya", "riya", "sam", "nina"]) {
    if (U[k]) await vote(idea2, U[k].id, "upvote");
  }
  if (U.deepak) await vote(idea2, U.deepak.id, "downvote");

  // idea3 (one-click Figma): 8 up, 0 down
  for (const k of ["alex", "ananya", "riya", "marcus", "sarah", "priya", "jordan", "sam"]) {
    if (U[k]) await vote(idea3, U[k].id, "upvote");
  }

  // idea4 (mobile radar): 5 up, 3 down — contested
  for (const k of ["priya", "alex", "marcus", "ananya", "riya"]) {
    if (U[k]) await vote(idea4, U[k].id, "upvote");
  }
  for (const k of ["deepak", "sam", "jordan"]) {
    if (U[k]) await vote(idea4, U[k].id, "downvote");
  }

  // idea5 (Slack, rejected): 3 up, 6 down
  for (const k of ["marcus", "sarah", "nina"]) {
    if (U[k]) await vote(idea5, U[k].id, "upvote");
  }
  for (const k of ["priya", "alex", "jordan", "ananya", "riya", "deepak"]) {
    if (U[k]) await vote(idea5, U[k].id, "downvote");
  }

  // idea6 (emoji reactions, archived): 2 up, 1 down
  for (const k of ["sam", "marcus"]) {
    if (U[k]) await vote(idea6, U[k].id, "upvote");
  }
  if (U.priya) await vote(idea6, U.priya.id, "downvote");

  // idea7: 0 votes — EMPTY STATE

  console.log("✓ Idea votes added\n");

  // ── 11. Idea validations ──────────────────────────────────────────────────
  const existingValidations = await sql`SELECT idea_id FROM idea_validations`;
  const validatedSet = new Set(existingValidations.map((v) => v.idea_id));

  // idea1 → approved + create linked request
  if (!validatedSet.has(idea1)) {
    const linkedReq = await upsertRequest({
      title: "Real-time presence indicators on request pages",
      description: "Show live avatar bubbles when 2+ people are viewing the same request. Uses Supabase Realtime presence channels — no new infrastructure required.",
      businessContext: "Reduce redundant Slack communication during async design reviews. The team currently sends ~12 'are you looking at this?' messages per week.",
      successMetrics: "30% reduction in redundant Slack messages (measured via user-reported survey after 30 days).",
      status: "triaged", stage: "context", phase: "predesign", designStage: null,
      priority: "p2", complexity: 2, requestType: "feature",
      requesterId: U.priya.id,
      createdAt: daysAgo(6),
      updatedAt: daysAgo(5),
    });
    await sql`UPDATE ideas SET linked_request_id = ${linkedReq} WHERE id = ${idea1}`;
    await sql`
      INSERT INTO idea_validations (
        idea_id, validated_by_id, impact_score, effort_estimate,
        feasibility_score, roi_score, decision, notes, linked_request_id, validated_at
      ) VALUES (
        ${idea1}, ${U.priya.id}, 8, 2, 9, 8,
        'approved',
        'Supabase Realtime presence is built-in — zero new infrastructure. High feasibility. Clear user need validated by vote count. Approving and auto-creating a request.',
        ${linkedReq}, ${daysAgo(4)}
      )
    `;
  }

  // idea2 → approved_with_conditions (validation in progress)
  if (!validatedSet.has(idea2)) {
    await sql`
      INSERT INTO idea_validations (
        idea_id, validated_by_id, impact_score, effort_estimate,
        feasibility_score, roi_score, decision, notes, validated_at
      ) VALUES (
        ${idea2}, ${U.priya.id}, 9, 5, 7, 7,
        'approved_with_conditions',
        'High business value. Approving with conditions: (1) Must run as a scheduled cron — not real-time streaming. (2) Confirm Claude Haiku cost estimate before building — cap at $5/mo. (3) Email delivery only for MVP, in-app later.',
        ${daysAgo(1)}
      )
    `;
  }

  // idea5 → rejected
  if (!validatedSet.has(idea5)) {
    await sql`
      INSERT INTO idea_validations (
        idea_id, validated_by_id, impact_score, effort_estimate,
        feasibility_score, roi_score, decision, notes, validated_at
      ) VALUES (
        ${idea5}, ${U.priya.id}, 5, 9, 4, 3,
        'rejected',
        'Effort-to-impact ratio is too low for MVP stage. Slack OAuth adds complex token refresh and ongoing maintenance burden. In-app + email notifications solve the core need. Revisit native Slack in Month 4+ if customers request it.',
        ${daysAgo(8)}
      )
    `;
  }

  console.log("✓ Idea validations: idea1 approved, idea2 approved_with_conditions, idea5 rejected\n");

  // ── 12. Figma updates ─────────────────────────────────────────────────────
  console.log("Adding Figma updates...");

  async function hasFigmaUpdates(requestId) {
    if (!requestId) return true;
    const [r] = await sql`SELECT id FROM figma_updates WHERE request_id = ${requestId} LIMIT 1`;
    return !!r;
  }

  // Checkout (track, all reviewed — historical trail)
  if (!(await hasFigmaUpdates(R.checkout))) {
    await sql`INSERT INTO figma_updates (request_id, figma_file_id, figma_file_name, figma_file_url, figma_version_id, updated_by_id, figma_user_handle, change_description, change_summary, request_phase, post_handoff, dev_reviewed, dev_reviewed_by_id, dev_review_notes, notification_sent_at, created_at, updated_at) VALUES (${R.checkout}, 'abc123', 'Checkout Redesign', 'https://www.figma.com/design/abc123/Checkout-Redesign-v3', 'ver_checkout_v1', ${U.alex.id}, 'Alex Rivera', 'Initial design — single-page checkout layout, 3 concept variants', '3 frames, 12 components', 'design', false, true, ${U.jordan.id}, 'Reviewed — building against variant A.', ${daysAgo(35)}, ${daysAgo(38)}, ${daysAgo(38)})`;
    await sql`INSERT INTO figma_updates (request_id, figma_file_id, figma_file_name, figma_file_url, figma_version_id, updated_by_id, figma_user_handle, change_description, change_summary, request_phase, post_handoff, dev_reviewed, dev_reviewed_by_id, dev_review_notes, notification_sent_at, created_at, updated_at) VALUES (${R.checkout}, 'abc123', 'Checkout Redesign', 'https://www.figma.com/design/abc123/Checkout-Redesign-v3', 'ver_checkout_v2', ${U.alex.id}, 'Alex Rivera', 'PM feedback incorporated — payment method row redesigned, trust badges added', '1 frame, 4 components', 'design', false, true, ${U.jordan.id}, 'Trust badge placement confirmed with brand. Good to go.', ${daysAgo(32)}, ${daysAgo(34)}, ${daysAgo(34)})`;
    await sql`INSERT INTO figma_updates (request_id, figma_file_id, figma_file_name, figma_file_url, figma_version_id, updated_by_id, figma_user_handle, change_description, change_summary, request_phase, post_handoff, dev_reviewed, dev_reviewed_by_id, dev_review_notes, notification_sent_at, created_at, updated_at) VALUES (${R.checkout}, 'abc123', 'Checkout Redesign', 'https://www.figma.com/design/abc123/Checkout-Redesign-v3', 'ver_checkout_v3', ${U.alex.id}, 'Alex Rivera', 'Final polish — micro-interactions for loading and success states', '2 frames, 6 components', 'dev', true, true, ${U.jordan.id}, 'Matches implementation exactly. Closing review.', ${daysAgo(27)}, ${daysAgo(28)}, ${daysAgo(28)})`;
  }

  // Analytics dashboard (dev phase — 2 UNREVIEWED post-handoff updates = drift alert)
  if (!(await hasFigmaUpdates(R.analytics))) {
    await sql`INSERT INTO figma_updates (request_id, figma_file_id, figma_file_name, figma_file_url, figma_version_id, updated_by_id, figma_user_handle, change_description, change_summary, request_phase, post_handoff, dev_reviewed, notification_sent_at, created_at, updated_at) VALUES (${R.analytics}, 'jkl012', 'Analytics Dashboard', 'https://www.figma.com/design/jkl012/Analytics-Dashboard-v2', 'ver_analytics_v1', ${U.alex.id}, 'Alex Rivera', 'Handoff version — all 6 chart types finalized with loading and data states', '6 frames, 24 components', 'design', false, true, ${daysAgo(10)}, ${daysAgo(11)}, ${daysAgo(11)})`;
    await sql`INSERT INTO figma_updates (request_id, figma_file_id, figma_file_name, figma_file_url, figma_version_id, updated_by_id, figma_user_handle, change_description, change_summary, request_phase, post_handoff, dev_reviewed, notification_sent_at, created_at, updated_at) VALUES (${R.analytics}, 'jkl012', 'Analytics Dashboard', 'https://www.figma.com/design/jkl012/Analytics-Dashboard-v2', 'ver_analytics_v2', ${U.alex.id}, 'Alex Rivera', 'Post-handoff: cycle time chart Y-axis labels updated (hours for <1d, days for ≥1d)', '1 frame, 2 components', 'dev', true, false, ${daysAgo(7)}, ${daysAgo(7)}, ${daysAgo(7)})`;
    await sql`INSERT INTO figma_updates (request_id, figma_file_id, figma_file_name, figma_file_url, figma_version_id, updated_by_id, figma_user_handle, change_description, change_summary, request_phase, post_handoff, dev_reviewed, notification_sent_at, created_at, updated_at) VALUES (${R.analytics}, 'jkl012', 'Analytics Dashboard', 'https://www.figma.com/design/jkl012/Analytics-Dashboard-v2', 'ver_analytics_v3', ${U.alex.id}, 'Alex Rivera', 'Post-handoff: added final empty state illustrations for all chart panels (no data yet)', '3 frames, 8 components', 'dev', true, false, ${daysAgo(3)}, ${daysAgo(3)}, ${daysAgo(3)})`;
  }

  // Empty states (design/validate phase — design-phase updates only)
  if (!(await hasFigmaUpdates(R.empty))) {
    await sql`INSERT INTO figma_updates (request_id, figma_file_id, figma_file_name, figma_file_url, figma_version_id, updated_by_id, figma_user_handle, change_description, change_summary, request_phase, post_handoff, dev_reviewed, notification_sent_at, created_at, updated_at) VALUES (${R.empty}, 'def456', 'Empty States', 'https://www.figma.com/design/def456/Empty-States-v2', 'ver_empty_v1', ${U.alex.id}, 'Alex Rivera', 'First pass — illustration-first approach for request list, minimal for team + analytics', '3 frames, 9 components', 'design', false, false, ${daysAgo(8)}, ${daysAgo(9)}, ${daysAgo(9)})`;
    await sql`INSERT INTO figma_updates (request_id, figma_file_id, figma_file_name, figma_file_url, figma_version_id, updated_by_id, figma_user_handle, change_description, change_summary, request_phase, post_handoff, dev_reviewed, notification_sent_at, created_at, updated_at) VALUES (${R.empty}, 'def456', 'Empty States', 'https://www.figma.com/design/def456/Empty-States-v2', 'ver_empty_v2', ${U.alex.id}, 'Alex Rivera', 'PM feedback: video CTA for analytics, updated team copy, refreshed illustration colours', '3 frames, 6 components', 'design', false, false, ${daysAgo(5)}, ${daysAgo(5)}, ${daysAgo(5)})`;
  }

  // Ananya — payment confirmation (design, very recent)
  if (!(await hasFigmaUpdates(ananyaReq1))) {
    await sql`INSERT INTO figma_updates (request_id, figma_file_id, figma_file_name, figma_file_url, figma_version_id, updated_by_id, figma_user_handle, change_description, change_summary, request_phase, post_handoff, dev_reviewed, notification_sent_at, created_at, updated_at) VALUES (${ananyaReq1}, 'pay001', 'Payment Confirmation', 'https://www.figma.com/design/pay001/Payment-Confirmation-v2', 'ver_pay_v1', ${U.ananya.id}, 'Ananya Krishnan', 'First exploration — 3 variants: minimal, celebratory (confetti), informational (next steps)', '3 frames, 11 components', 'design', false, false, ${hoursAgo(6)}, ${hoursAgo(6)}, ${hoursAgo(6)})`;
  }

  console.log("✓ Figma updates: Checkout (3 reviewed), Analytics (3 total, 2 unreviewed post-handoff = drift), Empty States (2), Ananya (1)\n");

  // ── 13. Validation signoffs ───────────────────────────────────────────────
  console.log("Adding validation signoffs...");

  async function addSignoff(requestId, signerId, role, decision, commentText, conditions, signedAt) {
    const [existing] = await sql`SELECT id FROM validation_signoffs WHERE request_id = ${requestId} AND signer_role = ${role} LIMIT 1`;
    if (existing) return;
    await sql`
      INSERT INTO validation_signoffs (request_id, signer_id, signer_role, decision, conditions, comments, signed_at)
      VALUES (${requestId}, ${signerId}, ${role}, ${decision}, ${conditions ?? null}, ${commentText ?? null}, ${signedAt})
    `;
  }

  // Checkout (shipped): 3/3 signed off
  if (R.checkout) {
    await addSignoff(R.checkout, U.alex.id,   "designer",    "approved", "Design is complete. All edge cases covered including mobile and error states. Ready to hand off.", null, daysAgo(33));
    await addSignoff(R.checkout, U.marcus.id,  "pm",          "approved", "Design addresses all use cases from the brief. The trust badge placement directly supports the impact thesis.", null, daysAgo(32));
    await addSignoff(R.checkout, U.priya.id,   "design_head", "approved", "Excellent execution. Clean, scannable, trust signals in exactly the right places. Setting a quality bar for future work.", null, daysAgo(31));
  }

  // Empty states (in_review): 1/3 — designer only, PM + Design Head overdue
  if (R.empty) {
    await addSignoff(R.empty, U.alex.id, "designer", "approved", "All 3 empty states complete. Copy is finalised, illustrations approved by brand. v2 ready for PM and Design Head sign-off.", null, daysAgo(5));
    // PM and design_head have NOT signed off → signOffOverdue in Radar (4 days stale)
  }

  // AI Prefill (in_progress, explore): 0/3 — EMPTY STATE for validation gate
  // No signoffs added intentionally

  console.log("✓ Signoffs: Checkout 3/3, Empty States 1/3 (overdue), AI Prefill 0/3 (empty state)\n");

  // ── 14. Request stage history ─────────────────────────────────────────────
  console.log("Adding request stage history...");

  async function addStageHistory(requestId, stages) {
    if (!requestId) return;
    const [existing] = await sql`SELECT id FROM request_stages WHERE request_id = ${requestId} LIMIT 1`;
    if (existing) return; // already has stages
    for (const s of stages) {
      await sql`
        INSERT INTO request_stages (request_id, stage, entered_at, completed_at, completed_by_id, notes)
        VALUES (${requestId}, ${s.stage}, ${s.enteredAt}, ${s.completedAt ?? null}, ${s.completedById ?? null}, ${s.notes ?? null})
      `;
    }
  }

  // Checkout (shipped): full history for cycle time calculation
  await addStageHistory(R.checkout, [
    { stage: "intake",   enteredAt: daysAgo(45), completedAt: daysAgo(43), completedById: U.marcus.id, notes: "Problem clear, business case strong." },
    { stage: "context",  enteredAt: daysAgo(43), completedAt: daysAgo(41), completedById: U.marcus.id, notes: "Funnel data + Hotjar recordings attached." },
    { stage: "shape",    enteredAt: daysAgo(41), completedAt: daysAgo(39), completedById: U.priya.id,  notes: "Single-page checkout direction agreed. No modal flows." },
    { stage: "bet",      enteredAt: daysAgo(39), completedAt: daysAgo(38), completedById: U.priya.id,  notes: "Approved. Assigned to Alex. 2-week design appetite." },
    { stage: "explore",  enteredAt: daysAgo(38), completedAt: daysAgo(35), completedById: U.alex.id,   notes: "3 concepts explored. Variant A selected by team vote." },
    { stage: "validate", enteredAt: daysAgo(35), completedAt: daysAgo(31), completedById: U.priya.id,  notes: "All 3 sign-offs received. Figma locked at v3." },
    { stage: "handoff",  enteredAt: daysAgo(31), completedAt: daysAgo(30), completedById: U.alex.id,   notes: "Dev notes attached. Jordan assigned as dev owner." },
    { stage: "build",    enteredAt: daysAgo(30), completedAt: daysAgo(5),  completedById: U.jordan.id, notes: "Shipped to production. A/B test started." },
    { stage: "impact",   enteredAt: daysAgo(5),  completedAt: daysAgo(3),  completedById: U.marcus.id, notes: "Completion rate: 71.3% (+10.3pp). Exceeded prediction." },
  ]);

  // Dark mode (track/measuring): full history — no impact stage yet
  await addStageHistory(R.darkmode, [
    { stage: "intake",   enteredAt: daysAgo(60), completedAt: daysAgo(58), completedById: U.jordan.id  },
    { stage: "context",  enteredAt: daysAgo(58), completedAt: daysAgo(57), completedById: U.jordan.id  },
    { stage: "shape",    enteredAt: daysAgo(57), completedAt: daysAgo(55), completedById: U.priya.id   },
    { stage: "bet",      enteredAt: daysAgo(55), completedAt: daysAgo(54), completedById: U.priya.id   },
    { stage: "explore",  enteredAt: daysAgo(54), completedAt: daysAgo(52), completedById: U.alex.id    },
    { stage: "validate", enteredAt: daysAgo(52), completedAt: daysAgo(50), completedById: U.priya.id   },
    { stage: "handoff",  enteredAt: daysAgo(50), completedAt: daysAgo(49), completedById: U.alex.id    },
    { stage: "build",    enteredAt: daysAgo(49), completedAt: daysAgo(8),  completedById: U.jordan.id  },
    // No 'impact' stage yet — measuring in progress
  ]);

  // Analytics dashboard (dev phase): partial history for cycle time display
  await addStageHistory(R.analytics, [
    { stage: "intake",   enteredAt: daysAgo(22), completedAt: daysAgo(21), completedById: U.priya.id  },
    { stage: "context",  enteredAt: daysAgo(21), completedAt: daysAgo(20), completedById: U.priya.id  },
    { stage: "shape",    enteredAt: daysAgo(20), completedAt: daysAgo(18), completedById: U.priya.id  },
    { stage: "bet",      enteredAt: daysAgo(18), completedAt: daysAgo(17), completedById: U.priya.id  },
    { stage: "explore",  enteredAt: daysAgo(17), completedAt: daysAgo(12), completedById: U.alex.id   },
    { stage: "validate", enteredAt: daysAgo(12), completedAt: daysAgo(11), completedById: U.priya.id  },
    { stage: "handoff",  enteredAt: daysAgo(11), completedAt: daysAgo(10), completedById: U.alex.id   },
    { stage: "build",    enteredAt: daysAgo(10), completedAt: null,        completedById: null         },
  ]);

  console.log("✓ Stage history: Checkout (full), Dark Mode (full sans impact), Analytics (partial)\n");

  // ── 15. Impact records ────────────────────────────────────────────────────
  console.log("Adding impact records...");

  async function upsertImpact(requestId, pmId, data) {
    if (!requestId) return;
    const [existing] = await sql`SELECT id FROM impact_records WHERE request_id = ${requestId} LIMIT 1`;
    if (existing) return;
    await sql`
      INSERT INTO impact_records (request_id, pm_id, predicted_metric, predicted_value, actual_value, variance_percent, notes, measured_at)
      VALUES (${requestId}, ${pmId}, ${data.metric}, ${data.predicted}, ${data.actual ?? null}, ${data.variance ?? null}, ${data.notes ?? null}, ${data.measuredAt ?? null})
    `;
  }

  // Checkout (shipped): impact measured and logged
  await upsertImpact(R.checkout, U.marcus.id, {
    metric: "Checkout completion rate",
    predicted: "+8% improvement (target: 69%)",
    actual: "+10.3pp — rate increased from 61% to 71.3%",
    variance: "28.75",
    notes: "Over-delivered. Trust badge + single-page layout had a compounding effect. Payment error rate also dropped 4% as a secondary win.",
    measuredAt: daysAgo(3),
  });

  // Dark mode (measuring): impact record exists but no actual logged yet = EMPTY STATE
  await upsertImpact(R.darkmode, U.jordan.id, {
    metric: "User satisfaction score (CSAT)",
    predicted: "+5% improvement",
    actual: null,       // not logged yet
    variance: null,     // not calculated yet
    notes: "Tracking for 30 days post-launch. Check CSAT scores in the May survey. Launch date: " + new Date(Date.now() - 7 * 86_400_000).toLocaleDateString(),
    measuredAt: null,   // not measured yet
  });

  console.log("✓ Impact records: Checkout (measured, +28.75% variance), Dark Mode (measuring = empty state)\n");

  // ── 16. Invites ───────────────────────────────────────────────────────────
  console.log("Adding invites...");

  async function upsertInvite(email, role, invitedById, acceptedAt, expiresAt, createdAt) {
    const [existing] = await sql`SELECT id FROM invites WHERE org_id = ${org.id} AND email = ${email} LIMIT 1`;
    if (existing) return;
    await sql`
      INSERT INTO invites (org_id, email, token, role, invited_by, accepted_at, expires_at, created_at)
      VALUES (${org.id}, ${email}, ${randomUUID()}, ${role}, ${invitedById}, ${acceptedAt ?? null}, ${expiresAt}, ${createdAt})
    `;
  }

  await upsertInvite("sam@acme-demo.io",       "developer", U.priya.id,  daysAgo(5),  daysFuture(2), daysAgo(7));  // Accepted
  await upsertInvite("taylor@acme-demo.io",    "pm",        U.priya.id,  null,        daysFuture(7), daysAgo(1));  // Pending
  await upsertInvite("chris.lee@example.com",  "designer",  U.marcus.id, null,        daysAgo(2),    daysAgo(9));  // Expired = empty state

  console.log("✓ Invites: Sam (accepted), Taylor (pending), Chris (expired = empty state)\n");

  // ── 17. Rich comments ─────────────────────────────────────────────────────
  console.log("Adding rich comment threads...");

  async function hasComments(requestId) {
    if (!requestId) return true;
    const [r] = await sql`SELECT id FROM comments WHERE request_id = ${requestId} AND is_system = false LIMIT 1`;
    return !!r;
  }

  async function addComment(requestId, authorId, body, isSystem, createdAt) {
    await sql`
      INSERT INTO comments (request_id, author_id, body, is_system, created_at, updated_at)
      VALUES (${requestId}, ${authorId ?? null}, ${body}, ${isSystem}, ${createdAt}, ${createdAt})
    `;
  }

  // Empty states (in_review, design/validate, 4 days stale — overdue signoffs)
  if (R.empty && !(await hasComments(R.empty))) {
    await addComment(R.empty, null, "📋 Request moved to Design phase — Exploration started.", true, daysAgo(10));
    await addComment(R.empty, U.alex.id, "Sharing v1 designs — went with an illustration-first approach for the request list empty state, and a simpler text+CTA for team and analytics. Two very different treatments to get feedback on direction before committing.", false, daysAgo(9));
    await addComment(R.empty, U.marcus.id, "Love the illustration for request list. For analytics empty state — can we swap the docs link for a 'Watch a 2 min walkthrough' CTA? Users respond much better to video for this kind of thing.", false, daysAgo(8));
    await addComment(R.empty, U.sarah.id, "Agree with Marcus on the video CTA. Also: team page empty state says 'No team members yet' — but the current user IS a team member. Should be something like 'Just you for now — invite your team to get started'.", false, daysAgo(8));
    await addComment(R.empty, U.alex.id, "Both great catches. Updated v2 — video CTA for analytics empty state, new copy for team page, and refreshed illustration to match the new brand colours from the April update.", false, daysAgo(6));
    await addComment(R.empty, null, "✏️ Alex Rivera updated Figma — v2 uploaded.", true, daysAgo(5));
    await addComment(R.empty, U.priya.id, "@alex reviewed v2 — one thing: the request list illustration is 240px tall on mobile which pushes the CTA below the fold. Can we cap it at 180px for mobile? Could use CSS clamp to scale gracefully.", false, daysAgo(5));
    await addComment(R.empty, U.alex.id, "Done — applied the 180px mobile cap using clamp(180px, 20vw, 240px). Also tested on iPhone 13 mini and iPad. Should be ready for your sign-off now.", false, daysAgo(5));
    await addComment(R.empty, null, "⏳ Awaiting PM and Design Head sign-off (designer approved). Pending 4 days.", true, daysAgo(4));
  }

  // Analytics dashboard (dev/in_progress — post-handoff drift discussion)
  if (R.analytics && !(await hasComments(R.analytics))) {
    await addComment(R.analytics, null, "🚀 Handed off to dev — Figma locked at version v1. Dev owner: Sam Torres.", true, daysAgo(10));
    await addComment(R.analytics, U.jordan.id, "@alex The cycle time chart Y-axis — Figma shows 'Days' but we agreed to show hours for tasks under 1 day. Is 'Days' intentional or an oversight?", false, daysAgo(8));
    await addComment(R.analytics, U.alex.id, "Not intentional — my bad. Fixing axis labels now. Rule: show hours (e.g. '6h') for < 1 day, days (e.g. '2.5d') for ≥ 1 day. Mixed units. Give me an hour.", false, daysAgo(8));
    await addComment(R.analytics, null, "⚠️ Post-handoff Figma update — dev review required (axis labels, version v2).", true, daysAgo(7));
    await addComment(R.analytics, U.jordan.id, "@alex v2 looks good. One more: the 'no data yet' state on the Shipped chart — final illustration or placeholder?", false, daysAgo(6));
    await addComment(R.analytics, U.alex.id, "Placeholder — pushed the final in v3 just now. Same illustration as the onboarding flow, just scaled to 160px. Keeping it consistent across empty states.", false, daysAgo(4));
    await addComment(R.analytics, null, "⚠️ Post-handoff Figma update — dev review required (empty states added, version v3).", true, daysAgo(3));
    await addComment(R.analytics, U.jordan.id, "On it — implementing v3 empty states by EOD.", false, daysAgo(2));
  }

  // Onboarding checklist (blocked)
  if (R.onboarding && !(await hasComments(R.onboarding))) {
    await addComment(R.onboarding, null, "📋 Assigned to Priya Sharma — Design phase started.", true, daysAgo(28));
    await addComment(R.onboarding, U.priya.id, "Starting explorations. Initial direction: 3-step horizontal checklist at the top of the dashboard, visible only until all steps are completed. Steps: (1) Create your first request, (2) Invite a teammate, (3) Assign a designer to a request.", false, daysAgo(26));
    await addComment(R.onboarding, U.marcus.id, "Love the approach. One concern: solo founders on the Starter plan will never be able to complete step 2 (invite teammate) if they're building alone. Should step 2 be skippable, or plan-aware?", false, daysAgo(25));
    await addComment(R.onboarding, U.priya.id, "Good point. I'll add 'skip for now' on step 2. Can also make it context-aware: hide step 2 entirely for Starter plan (1-person tier) and only show it on Professional+.", false, daysAgo(24));
    await addComment(R.onboarding, U.sarah.id, "Agree. Could we also track completion rate per step so we know which step is the drop-off point? That data would be really useful for optimising onboarding later.", false, daysAgo(23));
    await addComment(R.onboarding, U.priya.id, "@sarah yes — I'll add a note to the spec to log each step completion as an analytics event so we can funnel it later.", false, daysAgo(22));
    await addComment(R.onboarding, null, "🚫 Blocked: waiting on brand guidelines update from marketing before proceeding with visual design.", false, daysAgo(6));
    await addComment(R.onboarding, U.priya.id, "Blocking on brand because marketing is updating the primary CTA colour (current blue → new teal). Don't want to design and then redo everything. ETA from marketing: next Tuesday.", false, daysAgo(6));
  }

  // Deepak — error states (stuck, last comment 7 days ago)
  if (deepakReq1 && !(await hasComments(deepakReq1))) {
    await addComment(deepakReq1, null, "📋 Assigned to Deepak Mehta — Design phase started.", true, daysAgo(15));
    await addComment(deepakReq1, U.deepak.id, "Starting with reference research — studying Linear, Vercel, Notion, and Stripe error states. Will share initial direction and a mood board by end of week.", false, daysAgo(12));
    await addComment(deepakReq1, U.priya.id, "Sound approach Deepak. One constraint I forgot to mention: all illustrations must be SVG (not PNG) to stay crisp on retina. Also cap the palette at 3 colours per illustration.", false, daysAgo(10));
    await addComment(deepakReq1, U.deepak.id, "Got it — SVG + 3 colours max. Planning to use brand palette: midnight for backgrounds, chalk for fills, and one accent per error type (blue = offline, red = server error, yellow = warning, slate = empty).", false, daysAgo(7));
    // No comments after daysAgo(7) → Deepak = stuck on Radar
  }

  // Ananya — payment confirmation (active, recent)
  if (ananyaReq1 && !(await hasComments(ananyaReq1))) {
    await addComment(ananyaReq1, null, "📋 Assigned to Ananya Krishnan — Design phase started.", true, daysAgo(8));
    await addComment(ananyaReq1, U.ananya.id, "Starting with 3 concepts: (A) Minimal — clean confirmation with order summary, (B) Celebratory — confetti animation + large checkmark for emotional payoff, (C) Informational — 'what happens next' focused with track order, download receipt, and share feedback CTAs.", false, daysAgo(5));
    await addComment(ananyaReq1, U.marcus.id, "Love the range. On concept B: no autoplay confetti — it's jarring if the user already expected it to succeed. Could we trigger it only on first-time checkout?", false, daysAgo(4));
    await addComment(ananyaReq1, U.ananya.id, "100% agree. Updated B: confetti only on first purchase (stored in a 'first_checkout' session flag). For repeat purchases: subtle shimmer on the checkmark instead. Much more appropriate.", false, daysAgo(4));
    await addComment(ananyaReq1, null, "✏️ Ananya Krishnan updated Figma — 3 variants uploaded.", true, hoursAgo(6));
    await addComment(ananyaReq1, U.priya.id, "These look great Ananya. My vote: Concept A as the default, with Concept B's celebratory moment for first purchase as Marcus suggested. Also carry through the trust badge row from the checkout redesign — it's established brand language now.", false, hoursAgo(2));
  }

  console.log("✓ Rich comments seeded on 5 requests\n");

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ✅  Seed V2 complete!                                        ║
╚══════════════════════════════════════════════════════════════╝

USERS (10 total, all password: seed1234)
  priya@acme-demo.io     — Lead (Design Head, no manager)
  alex@acme-demo.io      — Designer → reports to Priya
  ananya@acme-demo.io    — Designer → reports to Priya  [NEW]
  riya@acme-demo.io      — Designer → reports to Priya  [NEW]
  deepak@acme-demo.io    — Designer → reports to Priya  [NEW]
  nina@acme-demo.io      — Designer → reports to Priya  [NEW, no-work]
  marcus@acme-demo.io    — PM
  sarah@acme-demo.io     — PM
  jordan@acme-demo.io    — Developer
  sam@acme-demo.io       — Developer                    [NEW]

DESIGN RADAR STATUSES
  🟢 Alex Rivera          — in-flow  (AI Prefill updated 8h ago)
  🟢 Ananya Krishnan      — in-flow  (Payment Confirmation updated 6h ago)
  🟡 Riya Patel           — idle     (Search Results updated 3 days ago)
  🔴 Deepak Mehta         — stuck    (Error States updated 7 days ago)
  🚫 Priya Sharma         — blocked  (Onboarding Checklist is blocked)
  ⚪ Nina Okonkwo         — no-work  ← EMPTY STATE

PROJECTS (3)
  🟣 Mobile App           — 3 requests linked
  🟢 Design System        — 2 requests linked
  🟡 Growth Experiments   — 0 requests ← EMPTY STATE

IDEAS (7)
  ✅ Real-time presence   — approved  (8 up / 2 down, linked request created)
  🔍 AI weekly digest     — validation (approved_with_conditions)
  🔼 One-click Figma      — pending_votes (8 up / 0 down)
  🔼 Mobile Radar         — pending_votes (5 up / 3 down, contested)
  ✗  Slack integration    — rejected  (3 up / 6 down)
  📦 Emoji reactions      — archived  (2 up / 1 down)
  📭 Request tagging      — pending_votes, 0 votes ← EMPTY STATE

FIGMA UPDATES
  Checkout:   3 updates (all reviewed, historical trail)
  Analytics:  3 updates (2 unreviewed post-handoff = drift alert on Radar)
  Empty States: 2 updates (design phase)
  Payment:    1 update  (Ananya, just uploaded)

VALIDATION SIGNOFFS
  Checkout:     3/3 ✅ (all approved, shipped)
  Empty States: 1/3 🔄 (designer only, overdue 4 days)
  AI Prefill:   0/3 ← EMPTY STATE

IMPACT RECORDS
  Checkout:   Measured ✅ (+10.3pp, +28.75% vs prediction)
  Dark Mode:  Measuring 🔄, no actual logged ← EMPTY STATE

INVITES
  Sam Torres:     Accepted ✅
  Taylor (PM):    Pending (expires in 7 days)
  Chris Lee:      Expired ← EMPTY STATE

COMMENTS
  5 request threads seeded with realistic design review conversations
`);

  await sql.end();
}

main().catch((err) => {
  console.error("❌  Seed V2 failed:", err);
  process.exit(1);
});
