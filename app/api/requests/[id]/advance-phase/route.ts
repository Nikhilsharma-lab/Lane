import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, comments, profiles, assignments } from "@/db/schema";
import { eq } from "drizzle-orm";

const PREDESIGN_STAGES = ["intake", "context", "shape", "bet"] as const;
const DESIGN_STAGES = ["explore", "validate", "handoff"] as const;
type PredesignStage = (typeof PREDESIGN_STAGES)[number];
type DesignStage = (typeof DESIGN_STAGES)[number];

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
      await addSystemComment(
        requestId,
        "⭢ Design handed off — Figma locked, Dev kanban opened"
      );
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
      await addSystemComment(
        requestId,
        `⭢ Moved to ${next.charAt(0).toUpperCase() + next.slice(1)} stage`
      );
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "No advancement possible at this phase" }, { status: 422 });
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
