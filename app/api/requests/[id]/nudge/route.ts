import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, assignments, proactiveAlerts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.role !== "lead" && profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [request] = await db.select().from(requests).where(
    and(eq(requests.id, requestId), eq(requests.orgId, profile.orgId))
  );
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  // Find the assigned designer — nudge goes to them privately, not the whole org
  const designerAssignment = await db
    .select({ assigneeId: assignments.assigneeId })
    .from(assignments)
    .leftJoin(profiles, eq(profiles.id, assignments.assigneeId))
    .where(
      and(
        eq(assignments.requestId, requestId),
        eq(profiles.role, "designer")
      )
    )
    .limit(1);

  const recipientId = designerAssignment[0]?.assigneeId ?? request.designerOwnerId;
  if (!recipientId) {
    return NextResponse.json(
      { error: "No designer assigned to nudge — assign a designer first" },
      { status: 422 }
    );
  }

  // Dedup key: one nudge per request per day
  const today = new Date().toISOString().slice(0, 10);
  const ruleKey = `stall_nudge:${requestId}:${today}`;

  try {
    await db
      .insert(proactiveAlerts)
      .values({
        orgId: request.orgId,
        requestId,
        recipientId,
        type: "stall_nudge",
        urgency: "medium",
        title: "This request needs your attention",
        body: `Hey — it's been a while since "${request.title}" got some attention. Everything okay?`,
        ctaLabel: "View request",
        ctaUrl: `/requests/${requestId}`,
        ruleKey,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing({ target: proactiveAlerts.ruleKey });

    await db.update(requests).set({ updatedAt: new Date() }).where(eq(requests.id, requestId));
  } catch (err) {
    console.error("[nudge] DB error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
