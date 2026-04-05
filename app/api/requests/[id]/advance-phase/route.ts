import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, comments, profiles, assignments, requestStages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { validationNeededEmail, handoffEmail } from "@/lib/email/templates";

const PREDESIGN_STAGES = ["intake", "context", "shape", "bet"] as const;
const DESIGN_STAGES = ["explore", "validate", "handoff"] as const;
type PredesignStage = (typeof PREDESIGN_STAGES)[number];
type DesignStage = (typeof DESIGN_STAGES)[number];

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const { id: requestId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile || profile.orgId !== request.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const phase = request.phase ?? "predesign";
  const predesignStage = request.predesignStage ?? "intake";
  const designStage = request.designStage;

  // ── Predesign phase ───────────────────────────────────────────────────────

  if (phase === "predesign") {
    const currentIdx = PREDESIGN_STAGES.indexOf(predesignStage as PredesignStage);

    const gateError = checkPredesignGate(request, predesignStage as PredesignStage, profile.role);
    if (gateError) return NextResponse.json({ error: gateError }, { status: 422 });

    const isLastPredesign = currentIdx >= PREDESIGN_STAGES.length - 1;

    if (isLastPredesign) {
      // Bet approved → move to Design phase
      const assigned = await db
        .select({ id: assignments.id })
        .from(assignments)
        .where(eq(assignments.requestId, requestId));
      if (!assigned.length) {
        return NextResponse.json(
          { error: "Assign a designer before approving the bet" },
          { status: 422 }
        );
      }
      await db
        .update(requests)
        .set({
          phase: "design",
          designStage: "explore",
          stage: "explore",         // keep legacy stage in sync
          status: "in_progress",
          updatedAt: new Date(),
        })
        .where(eq(requests.id, requestId));
      await recordStageEntry(requestId, "explore", user.id);
      await addSystemComment(requestId, "⭢ Bet approved — Design Phase started (Exploration)");
    } else {
      const next = PREDESIGN_STAGES[currentIdx + 1];
      await db
        .update(requests)
        .set({
          predesignStage: next,
          stage: next,               // keep legacy stage in sync
          updatedAt: new Date(),
        })
        .where(eq(requests.id, requestId));
      await recordStageEntry(requestId, next, user.id);
      await addSystemComment(
        requestId,
        `⭢ Moved to ${next.charAt(0).toUpperCase() + next.slice(1)} stage`
      );
    }

    return NextResponse.json({ success: true });
  }

  // ── Design phase ──────────────────────────────────────────────────────────

  if (phase === "design") {
    const currentDesignStage = (designStage ?? "explore") as DesignStage;
    const currentIdx = DESIGN_STAGES.indexOf(currentDesignStage);

    if (currentDesignStage === "validate") {
      return NextResponse.json(
        { error: "Validation requires 3 sign-offs. Use the validation panel." },
        { status: 422 }
      );
    }

    if (currentIdx >= DESIGN_STAGES.length - 1) {
      // handoff → dev
      if (!request.figmaUrl) {
        return NextResponse.json(
          { error: "Add a Figma URL before handing off to dev" },
          { status: 422 }
        );
      }
      await db
        .update(requests)
        .set({
          phase: "dev",
          kanbanState: "todo",
          stage: "build",            // legacy
          status: "assigned",
          figmaVersionId: request.figmaUrl,
          figmaLockedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(requests.id, requestId));
      await recordStageEntry(requestId, "build", user.id);
      await addSystemComment(
        requestId,
        "⭢ Design handed off — Figma locked, Dev kanban opened"
      );

      // Notify all assignees about the handoff
      const assignedRows = await db.select().from(assignments).where(eq(assignments.requestId, requestId));
      const [designer] = await db.select().from(profiles).where(eq(profiles.id, user.id));
      for (const row of assignedRows) {
        const [assignee] = await db.select().from(profiles).where(eq(profiles.id, row.assigneeId));
        if (assignee?.email) {
          sendEmail({
            to: assignee.email,
            subject: `Design handed off to dev: ${request.title}`,
            html: handoffEmail({
              recipientName: assignee.fullName ?? "there",
              requestTitle: request.title,
              requestId,
              designerName: designer?.fullName ?? "Designer",
              figmaUrl: request.figmaUrl,
            }),
          });
        }
      }
    } else {
      const next = DESIGN_STAGES[currentIdx + 1];
      await db
        .update(requests)
        .set({
          designStage: next,
          stage: next,               // legacy
          updatedAt: new Date(),
        })
        .where(eq(requests.id, requestId));
      await recordStageEntry(requestId, next, user.id);
      await addSystemComment(
        requestId,
        `⭢ Moved to ${next.charAt(0).toUpperCase() + next.slice(1)} stage`
      );

      // When entering validate stage, notify all signers
      if (next === "validate") {
        const orgMembers = await db
          .select()
          .from(profiles)
          .where(eq(profiles.orgId, request.orgId));

        const [requester] = await db.select().from(profiles).where(eq(profiles.id, request.requesterId));

        const SIGNER_ROLES: Record<string, string> = {
          designer: "designer",
          pm: "pm",
          lead: "design_head",
          admin: "design_head",
        };

        for (const member of orgMembers) {
          const signerRole = SIGNER_ROLES[member.role ?? ""];
          if (!signerRole || !member.email) continue;
          sendEmail({
            to: member.email,
            subject: `Sign-off needed: ${request.title}`,
            html: validationNeededEmail({
              recipientName: member.fullName ?? "there",
              signerRole,
              requestTitle: request.title,
              requestId,
              requesterName: requester?.fullName ?? "Unknown",
            }),
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  }

  // ── Dev phase → Track ────────────────────────────────────────────────────

  if (phase === "dev") {
    if (request.kanbanState !== "done") {
      return NextResponse.json(
        { error: "Move all kanban items to Done before shipping to Track" },
        { status: 422 }
      );
    }
    await db
      .update(requests)
      .set({
        phase: "track",
        trackStage: "measuring",
        stage: "impact",            // legacy
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));
    await recordStageEntry(requestId, "impact", user.id);
    await addSystemComment(requestId, "⭢ Dev complete — shipped to Track phase");
    return NextResponse.json({ success: true });
  }

  // ── Track phase → complete ────────────────────────────────────────────────

  if (phase === "track") {
    if (!request.impactActual) {
      return NextResponse.json(
        { error: "Log actual impact before marking complete" },
        { status: 422 }
      );
    }
    await db
      .update(requests)
      .set({
        trackStage: "complete",
        status: "shipped",
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));
    await addSystemComment(requestId, "✅ Impact recorded — request complete");
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "No advancement possible at this phase" }, { status: 422 });
  } catch (err) {
    console.error("[advance-phase] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function checkPredesignGate(
  request: { description: string; businessContext: string | null; successMetrics: string | null },
  stage: PredesignStage,
  role: string
): string | null {
  switch (stage) {
    case "intake":
      if (!request.description) return "Problem description is required";
      if (!request.businessContext) return "Business goal is required (business context field)";
      if (!request.successMetrics) return "User impact is required (success metrics field)";
      break;
    case "context":
      if (!request.businessContext) return "Add context/research notes before shaping";
      break;
    case "shape":
      if (!request.successMetrics) return "Define constraints and time appetite before betting";
      break;
    case "bet":
      if (role !== "lead" && role !== "admin")
        return "Only a Design Head (lead/admin) can approve a bet";
      break;
  }
  return null;
}

async function addSystemComment(requestId: string, body: string) {
  await db.insert(comments).values({ requestId, authorId: null, body, isSystem: true });
}

async function recordStageEntry(requestId: string, stage: string, userId: string) {
  try {
    await db.insert(requestStages).values({
      requestId,
      stage: stage as typeof requestStages.$inferInsert["stage"],
      enteredAt: new Date(),
      completedById: userId,
    });
  } catch {
    // Non-critical — analytics degrade gracefully if this fails
  }
}
