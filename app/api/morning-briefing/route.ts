import { NextRequest, NextResponse } from "next/server";
import { morningBriefings, profiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isAuthContextError, withAuthContext } from "@/lib/auth-context";
import { withUserSession } from "@/db/user";
import { createClient } from "@/lib/supabase/server";
import { generateMorningBriefing } from "@/lib/ai/morning-briefing";

export async function GET(_req: NextRequest) {
  const today = new Date().toISOString().slice(0, 10);

  const result = await withAuthContext(async ({ user, db }) => {
    const [brief] = await db
      .select()
      .from(morningBriefings)
      .where(
        and(
          eq(morningBriefings.userId, user.id),
          eq(morningBriefings.date, today)
        )
      )
      .limit(1);

    return NextResponse.json({ brief: brief ?? null });
  });

  if (isAuthContextError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return result;
}

// On-demand generation — called by the refresh button and when no briefing exists yet.
// Uses withUserSession (not withAuthContext) because generateMorningBriefing calls the
// Claude API — holding a Postgres transaction open during that would error.
export async function POST(_req: NextRequest) {
  const today = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return withUserSession(user.id, async (db) => {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id));
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // withUserSession has no wrapping transaction, so holding the connection
    // during this Claude call is safe (no locks held)
    const content = await generateMorningBriefing({
      userId: user.id,
      orgId: profile.orgId,
      role: profile.role,
      userName: profile.fullName || "there",
    });

    // Delete any existing row for today (handles dismissed + re-generate case)
    await db
      .delete(morningBriefings)
      .where(
        and(
          eq(morningBriefings.userId, user.id),
          eq(morningBriefings.date, today)
        )
      );

    const [row] = await db
      .insert(morningBriefings)
      .values({
        userId: user.id,
        orgId: profile.orgId,
        date: today,
        role: profile.role,
        content,
      })
      .returning();

    return NextResponse.json({ brief: row });
  });
}
