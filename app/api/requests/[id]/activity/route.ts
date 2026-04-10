import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { activityLog, profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await db
    .select({
      id: activityLog.id,
      requestId: activityLog.requestId,
      actorId: activityLog.actorId,
      action: activityLog.action,
      field: activityLog.field,
      oldValue: activityLog.oldValue,
      newValue: activityLog.newValue,
      metadata: activityLog.metadata,
      createdAt: activityLog.createdAt,
      actorName: profiles.fullName,
    })
    .from(activityLog)
    .leftJoin(profiles, eq(activityLog.actorId, profiles.id))
    .where(eq(activityLog.requestId, id))
    .orderBy(desc(activityLog.createdAt));

  return NextResponse.json({ entries });
}
