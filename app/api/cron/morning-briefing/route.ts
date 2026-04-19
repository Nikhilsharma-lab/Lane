// app/api/cron/morning-briefing/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { profiles, morningBriefings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generateMorningBriefing } from "@/lib/ai/morning-briefing";
import { isCronRequestAuthorized } from "@/lib/cron/auth";

export async function GET(req: NextRequest) {
  if (!isCronRequestAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const allProfiles = await db
    .select({
      id: profiles.id,
      orgId: profiles.orgId,
      role: profiles.role,
      fullName: profiles.fullName,
    })
    .from(profiles);

  let generated = 0;
  let skipped = 0;

  for (const profile of allProfiles) {
    try {
      const [existing] = await db
        .select({ id: morningBriefings.id })
        .from(morningBriefings)
        .where(
          and(
            eq(morningBriefings.userId, profile.id),
            eq(morningBriefings.date, today)
          )
        )
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      const content = await generateMorningBriefing({
        userId: profile.id,
        orgId: profile.orgId,
        role: profile.role,
        userName: profile.fullName || "there",
      });

      await db.insert(morningBriefings).values({
        userId: profile.id,
        orgId: profile.orgId,
        date: today,
        role: profile.role,
        content,
      });

      generated++;
    } catch (err) {
      console.error(`[morning-briefing cron] failed for user ${profile.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, generated, skipped });
}
