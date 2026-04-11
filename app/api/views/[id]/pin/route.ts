import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUserSession } from "@/db/user";
import { profiles, publishedViews } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return withUserSession(user.id, async (db) => {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 401 });

    const [view] = await db
      .select()
      .from(publishedViews)
      .where(eq(publishedViews.id, id));
    if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Only allow pinning views within the same org
    if (view.orgId !== profile.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const currentPinned = (view.pinnedBy ?? []) as string[];
    const isPinned = currentPinned.includes(user.id);
    const newPinned = isPinned
      ? currentPinned.filter((uid) => uid !== user.id)
      : [...currentPinned, user.id];

    const [updated] = await db
      .update(publishedViews)
      .set({ pinnedBy: newPinned })
      .where(eq(publishedViews.id, id))
      .returning();

    return NextResponse.json({ pinned: !isPinned, view: updated });
  });
}
