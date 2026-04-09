import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, assignments } from "@/db/schema";
import { eq, and, count, inArray } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { assignmentEmail } from "@/lib/email/templates";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.role !== "lead" && profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify request belongs to org
  const [request] = await db.select().from(requests).where(
    and(eq(requests.id, id), eq(requests.orgId, profile.orgId))
  );
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Team members in same org
  const members = await db
    .select({ id: profiles.id, fullName: profiles.fullName, role: profiles.role, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));

  // Current assignments for this request
  const current = await db
    .select()
    .from(assignments)
    .where(eq(assignments.requestId, id));

  // Active assignment counts per member across org
  const orgReqIds = await db
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.orgId, profile.orgId));
  const reqIds = orgReqIds.map((r) => r.id).filter((rid) => rid !== id);

  const workloadRows =
    reqIds.length > 0
      ? await db
          .select({ assigneeId: assignments.assigneeId, count: count() })
          .from(assignments)
          .where(inArray(assignments.requestId, reqIds))
          .groupBy(assignments.assigneeId)
      : [];
  const workloads = Object.fromEntries(
    workloadRows.map((w) => [w.assigneeId, Number(w.count)])
  );

  return NextResponse.json({ members, assignments: current, workloads });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.role !== "lead" && profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [request] = await db.select().from(requests).where(
    and(eq(requests.id, id), eq(requests.orgId, profile.orgId))
  );
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { assigneeId, role = "lead" } = await req.json();
  if (!assigneeId) return NextResponse.json({ error: "assigneeId required" }, { status: 400 });

  // Verify assignee is in same org
  const [assignee] = await db.select().from(profiles).where(
    and(eq(profiles.id, assigneeId), eq(profiles.orgId, profile.orgId))
  );
  if (!assignee) return NextResponse.json({ error: "Assignee not found" }, { status: 404 });

  // Upsert — remove existing assignment for this person on this request, then insert
  await db.delete(assignments).where(
    and(eq(assignments.requestId, id), eq(assignments.assigneeId, assigneeId))
  );

  const [assignment] = await db.insert(assignments).values({
    requestId: id,
    assigneeId,
    assignedById: profile.id,
    role: role as "lead" | "reviewer" | "contributor",
  }).returning();

  // Update request status to "assigned" if it was triaged or submitted
  if (request.status === "triaged" || request.status === "submitted") {
    await db.update(requests)
      .set({ status: "assigned", updatedAt: new Date() })
      .where(eq(requests.id, id));
  }

  // Email the assignee (fire-and-forget)
  if (assignee.email && assignee.id !== profile.id) {
    sendEmail({
      to: assignee.email,
      subject: `You've been assigned: ${request.title}`,
      html: assignmentEmail({
        assigneeName: assignee.fullName ?? "there",
        assignedByName: profile.fullName ?? "Someone",
        requestTitle: request.title,
        requestId: id,
      }),
    });
  }

  return NextResponse.json({ assignment }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.role !== "lead" && profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { assigneeId } = await req.json();
  if (!assigneeId) return NextResponse.json({ error: "assigneeId required" }, { status: 400 });

  const [request] = await db.select().from(requests).where(
    and(eq(requests.id, id), eq(requests.orgId, profile.orgId))
  );
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [assignee] = await db.select({ id: profiles.id }).from(profiles).where(
    and(eq(profiles.id, assigneeId), eq(profiles.orgId, profile.orgId))
  );
  if (!assignee) return NextResponse.json({ error: "Assignee not found" }, { status: 404 });

  await db.delete(assignments).where(
    and(eq(assignments.requestId, id), eq(assignments.assigneeId, assigneeId))
  );

  return NextResponse.json({ ok: true });
}
