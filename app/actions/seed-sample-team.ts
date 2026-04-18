"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  projectMembers,
  requests,
  teams,
} from "@/db/schema";
import { eq } from "drizzle-orm";

type SeedRequest = {
  title: string;
  description: string;
  phase: "predesign" | "design" | "dev" | "track";
  predesignStage: "intake" | "context" | "shape" | "bet" | null;
  designStage: "sense" | "frame" | "diverge" | "converge" | "prove" | null;
  kanbanState: "todo" | "in_progress" | "in_review" | "qa" | "done" | null;
  assignToUser: boolean;
  fakeOwnerIndex: number | null;
};

const FAKE_MEMBERS = [
  { fullName: "Alex Rivera", emailPrefix: "alex-rivera" },
  { fullName: "Riya Patel", emailPrefix: "riya-patel" },
  { fullName: "Sam Torres", emailPrefix: "sam-torres" },
];

const SAMPLE_REQUESTS: SeedRequest[] = [
  {
    title: "Checkout drop-off on mobile",
    description:
      "40% of users abandon checkout on mobile between payment selection and confirmation. We need to understand why and fix it.",
    phase: "predesign",
    predesignStage: "shape",
    designStage: null,
    kanbanState: null,
    assignToUser: false,
    fakeOwnerIndex: 0,
  },
  {
    title: "Onboarding flow for first-time users",
    description:
      "First-time users take 4x longer than returning users to complete their first action. The current onboarding doesn't teach the mental model.",
    phase: "design",
    predesignStage: null,
    designStage: "diverge",
    kanbanState: null,
    assignToUser: true,
    fakeOwnerIndex: null,
  },
  {
    title: "Filter UI for search results",
    description:
      "Users report that finding specific items requires too many clicks. The current filter panel is buried and doesn't surface the most-used filters.",
    phase: "dev",
    predesignStage: null,
    designStage: null,
    kanbanState: "in_progress",
    assignToUser: true,
    fakeOwnerIndex: null,
  },
  {
    title: "Pricing page redesign",
    description:
      "The pricing page has a 12% conversion rate. Competitors average 18%. We redesigned it last quarter — measuring impact now.",
    phase: "track",
    predesignStage: null,
    designStage: null,
    kanbanState: null,
    assignToUser: false,
    fakeOwnerIndex: 2,
  },
];

/**
 * Create a sample "Consumer app" team with 3 fake teammates and 4 Requests
 * distributed across the 4 phases. Ownership mix: 2 assigned to the current
 * user (so My requests has content), 2 assigned to fake teammates (so the
 * team feels populated).
 *
 * Note: we do NOT insert into `request_stages` — its `stage` column uses
 * the legacy stageEnum (intake/context/shape/bet/explore/validate/handoff/
 * build/impact) which doesn't cover the new design-stage and kanban values.
 * Sample Requests render from the phase/designStage/kanbanState columns on
 * `requests` directly.
 */
export async function seedSampleTeam() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) throw new Error("No profile");

  const orgId = profile.orgId;

  // 1. Create the sample team
  const [sampleTeam] = await db
    .insert(teams)
    .values({
      orgId,
      name: "Consumer app",
      slug: `consumer-app-sample-${randomUUID().slice(0, 8)}`,
      description: "A sample team to explore Lane. Clear it anytime.",
      createdBy: user.id,
      isSample: true,
    })
    .returning();

  // 2. Create 3 fake profiles (synthesized UUIDs, no auth.users backing)
  const fakeProfileIds: string[] = [];
  for (const member of FAKE_MEMBERS) {
    const [fakeProfile] = await db
      .insert(profiles)
      .values({
        id: randomUUID(),
        email: `${member.emailPrefix}-${randomUUID().slice(0, 8)}@lane-sample.invalid`,
        fullName: member.fullName,
        orgId,
        role: "designer",
        isSample: true,
      })
      .returning();
    fakeProfileIds.push(fakeProfile.id);
  }

  // 3. Team memberships: current user is lead, fake members are designers
  await db.insert(projectMembers).values({
    teamId: sampleTeam.id,
    userId: user.id,
    teamRole: "lead",
  });

  for (const fakeId of fakeProfileIds) {
    await db.insert(projectMembers).values({
      teamId: sampleTeam.id,
      userId: fakeId,
      teamRole: "designer",
    });
  }

  // 4. Create 4 sample requests across the 4 phases
  for (const req of SAMPLE_REQUESTS) {
    const designerOwnerId = req.assignToUser
      ? user.id
      : req.fakeOwnerIndex !== null
        ? fakeProfileIds[req.fakeOwnerIndex]
        : null;

    await db.insert(requests).values({
      orgId,
      requesterId: user.id,
      projectId: sampleTeam.id,
      title: req.title,
      description: req.description,
      phase: req.phase,
      predesignStage: req.predesignStage,
      designStage: req.designStage,
      kanbanState: req.kanbanState,
      designerOwnerId,
      status: "triaged",
      stage: "intake",
    });
  }

  return { teamId: sampleTeam.id };
}
