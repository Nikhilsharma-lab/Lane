import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params;

  // Runtime body validation
  const body = await req.json().catch(() => null);
  if (!body || !("managerId" in body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const managerId: string | null = body.managerId ?? null;
  if (managerId !== null && typeof managerId !== "string") {
    return NextResponse.json({ error: "Invalid managerId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [viewer] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!viewer || viewer.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // Self-reporting guard
  if (managerId === memberId) {
    return NextResponse.json({ error: "Cannot report to yourself" }, { status: 400 });
  }

  // Cross-org guard: verify memberId belongs to viewer's org
  const [target] = await db
    .select({ id: profiles.id, orgId: profiles.orgId })
    .from(profiles)
    .where(eq(profiles.id, memberId));
  if (!target || target.orgId !== viewer.orgId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await db
    .update(profiles)
    .set({ managerId: managerId ?? null })
    .where(eq(profiles.id, memberId));

  return NextResponse.json({ success: true });
}
