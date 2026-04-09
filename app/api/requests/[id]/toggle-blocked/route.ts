import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canToggleBlocked } from "@/lib/request-permissions";

const STAGES = [
  "intake", "context", "shape", "bet", "explore", "validate", "handoff", "build", "impact",
] as const;
type Stage = (typeof STAGES)[number];

const STAGE_STATUS_MAP: Record<Stage, string> = {
  intake: "submitted",
  context: "triaged",
  shape: "triaged",
  bet: "assigned",
  explore: "in_progress",
  validate: "in_review",
  handoff: "in_review",
  build: "completed",
  impact: "shipped",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const { currentStatus } = await req.json();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (!canToggleBlocked(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const newStatus =
    currentStatus === "blocked"
      ? (STAGE_STATUS_MAP[request.stage as Stage] ?? "in_progress")
      : "blocked";

  await db
    .update(requests)
    .set({ status: newStatus as typeof requests.$inferSelect.status, updatedAt: new Date() })
    .where(eq(requests.id, requestId));

  return NextResponse.json({ success: true });
}
