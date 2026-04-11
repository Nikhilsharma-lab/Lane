import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUserSession } from "@/db/user";
import { profiles, publishedViews } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, filters, groupBy, viewMode } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  return withUserSession(user.id, async (db) => {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id));
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const [view] = await db
      .insert(publishedViews)
      .values({
        orgId: profile.orgId,
        createdById: profile.id,
        name: name.trim(),
        viewType: "requests",
        filters: filters ?? {},
        groupBy: groupBy ?? null,
        viewMode: viewMode ?? "list",
        accessMode: "authenticated",
      })
      .returning();

    return NextResponse.json({ view });
  });
}
