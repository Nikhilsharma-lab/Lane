import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUserSession } from "@/db/user";
import { requests, comments, profiles, assignments, requestStages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { validationNeededEmail, handoffEmail } from "@/lib/email/templates";
import { canAdvanceRequestPhase } from "@/lib/request-permissions";
import { notifyMany, getRequestRecipients } from "@/lib/notifications";
import { PREDESIGN_STAGES, DESIGN_STAGES, getStageLabel } from "@/lib/workflow";
import type { PredesignStage, DesignStage } from "@/db/schema";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const { id: requestId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return withUserSession(user.id, async (db) => {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile || profile.orgId !== request.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const requestAssignments = await db
    .select({
      assigneeId: assignments.assigneeId,
      profileRole: profiles.role,
    })
    .from(assignments)
    .leftJoin(profiles, eq(profiles.id, assignments.assigneeId))
    .where(eq(assignments.requestId, requestId));

  const phase = request.phase ?? "predesign";
  const predesignStage = request.predesignStage ?? "intake";
  const designStage = request.designStage;

  if (
    !canAdvanceRequestPhase(phase, {
      userId: user.id,
      profileRole: profile.role,
      requesterId: request.requesterId,
      designerOwnerId: request.designerOwnerId,
      devOwnerId: request.devOwnerId,
      assignments: requestAssignments,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
      await db.transaction(async (tx) => {
        await tx
          .update(requests)
          .set({
            phase: "design",
            designStage: "sense",
            stage: "explore",         // keep legacy stage in sync
            status: "in_progress",
            updatedAt: new Date(),
          })
          .where(eq(requests.id, requestId));
        await tx.insert(requestStages).values({
          requestId,
          stage: "explore",
          enteredAt: new Date(),
          completedById: user.id,
        });
        await tx.insert(comments).values({ requestId, authorId: null, body: "⭢ Bet approved — Design Phase started (Sense)", isSystem: true });
      });

      // Notify assignees about design phase start
      const recipients = await getRequestRecipients(db, requestId, request.requesterId);
      await notifyMany(db, {
        orgId: request.orgId,
        recipientIds: recipients,
        actorId: user.id,
        type: "stage_change",
        requestId,
        title: `${request.title} moved to Design Phase`,
        body: "Bet approved — starting with Sense stage.",
        url: `/dashboard/requests/${requestId}`,
      });
    } else {
      const next = PREDESIGN_STAGES[currentIdx + 1];
      await db.transaction(async (tx) => {
        await tx
          .update(requests)
          .set({
            predesignStage: next,
            stage: next,               // keep legacy stage in sync
            updatedAt: new Date(),
          })
          .where(eq(requests.id, requestId));
        await tx.insert(requestStages).values({
          requestId,
          stage: next as typeof requestStages.$inferInsert["stage"],
          enteredAt: new Date(),
          completedById: user.id,
        });
        await tx.insert(comments).values({ requestId, authorId: null, body: `⭢ Moved to ${getStageLabel(next)} stage`, isSystem: true });
      });

      // Notify assignees about stage change
      const recipients = await getRequestRecipients(db, requestId, request.requesterId);
      await notifyMany(db, {
        orgId: request.orgId,
        recipientIds: recipients,
        actorId: user.id,
        type: "stage_change",
        requestId,
        title: `${request.title} moved to ${getStageLabel(next)}`,
        body: `Predesign stage advanced to ${getStageLabel(next)}.`,
        url: `/dashboard/requests/${requestId}`,
      });
    }

    return NextResponse.json({ success: true });
  }

  // ── Design phase ──────────────────────────────────────────────────────────

  if (phase === "design") {
    const currentDesignStage = (designStage ?? "sense") as DesignStage;
    const currentIdx = DESIGN_STAGES.indexOf(currentDesignStage);

    if (currentDesignStage === "prove") {
      return NextResponse.json(
        { error: "Prove requires 3 sign-offs. Use the validation panel." },
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
      await db.transaction(async (tx) => {
        await tx
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
        await tx.insert(requestStages).values({
          requestId,
          stage: "build",
          enteredAt: new Date(),
          completedById: user.id,
        });
        await tx.insert(comments).values({ requestId, authorId: null, body: "⭢ Design handed off — Figma locked, Dev kanban opened", isSystem: true });
      });

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

      // In-app notifications for handoff
      await notifyMany(db, {
        orgId: request.orgId,
        recipientIds: assignedRows.map((r) => r.assigneeId),
        actorId: user.id,
        type: "stage_change",
        requestId,
        title: `${request.title} handed off to Dev`,
        body: "Design is locked. Dev kanban is open.",
        url: `/dashboard/requests/${requestId}`,
      });
    } else {
      const next = DESIGN_STAGES[currentIdx + 1];
      await db.transaction(async (tx) => {
        await tx
          .update(requests)
          .set({
            designStage: next,
            // legacy stage stays as "explore" for all design sub-stages
            updatedAt: new Date(),
          })
          .where(eq(requests.id, requestId));
        await tx.insert(requestStages).values({
          requestId,
          stage: "explore",   // legacy enum — all design sub-stages map to "explore"
          enteredAt: new Date(),
          completedById: user.id,
        });
        await tx.insert(comments).values({ requestId, authorId: null, body: `⭢ Moved to ${getStageLabel(next)} stage`, isSystem: true });
      });

      // Notify assignees about design stage change
      const stageRecipients = await getRequestRecipients(db, requestId, request.requesterId);
      await notifyMany(db, {
        orgId: request.orgId,
        recipientIds: stageRecipients,
        actorId: user.id,
        type: "stage_change",
        requestId,
        title: `${request.title} moved to ${getStageLabel(next)}`,
        body: `Design stage advanced to ${getStageLabel(next)}.`,
        url: `/dashboard/requests/${requestId}`,
      });

      // When entering prove stage, notify all signers
      if (next === "prove") {
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

        const signerIds: string[] = [];
        for (const member of orgMembers) {
          const signerRole = SIGNER_ROLES[member.role ?? ""];
          if (!signerRole || !member.email) continue;
          signerIds.push(member.id);
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

        // In-app notifications for signoff request
        await notifyMany(db, {
          orgId: request.orgId,
          recipientIds: signerIds,
          actorId: user.id,
          type: "signoff_requested",
          requestId,
          title: `Your sign-off is needed on ${request.title}`,
          body: `${requester?.fullName ?? "Someone"} submitted the design for review.`,
          url: `/dashboard/requests/${requestId}`,
        });
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
    await db.transaction(async (tx) => {
      await tx
        .update(requests)
        .set({
          phase: "track",
          trackStage: "measuring",
          stage: "impact",            // legacy
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(requests.id, requestId));
      await tx.insert(requestStages).values({
        requestId,
        stage: "impact",
        enteredAt: new Date(),
        completedById: user.id,
      });
      await tx.insert(comments).values({ requestId, authorId: null, body: "⭢ Dev complete — shipped to Track phase", isSystem: true });
    });
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
    await db.transaction(async (tx) => {
      await tx
        .update(requests)
        .set({
          trackStage: "complete",
          status: "shipped",
          updatedAt: new Date(),
        })
        .where(eq(requests.id, requestId));
      await tx.insert(comments).values({ requestId, authorId: null, body: "✅ Impact recorded — request complete", isSystem: true });
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "No advancement possible at this phase" }, { status: 422 });
  }); // end withUserSession
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
      if (!request.successMetrics) return "Define constraints and time appetite before committing";
      break;
    case "bet":
      if (role !== "lead" && role !== "admin")
        return "Only a Design Head (lead/admin) can approve a bet";
      break;
  }
  return null;
}
