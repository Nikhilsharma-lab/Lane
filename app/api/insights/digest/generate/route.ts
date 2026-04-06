// app/api/insights/digest/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, weeklyDigests } from "@/db/schema";
import { generateDigestForOrg } from "@/lib/digest";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allOrgs = await db.select({ id: organizations.id }).from(organizations);

  const results: { orgId: string; status: string }[] = [];

  for (const org of allOrgs) {
    try {
      const digestResponse = await generateDigestForOrg(org.id);

      await db
        .insert(weeklyDigests)
        .values({
          orgId: org.id,
          generatedAt: new Date(),
          content: digestResponse as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: weeklyDigests.orgId,
          set: {
            generatedAt: new Date(),
            content: digestResponse as unknown as Record<string, unknown>,
          },
        });

      results.push({ orgId: org.id, status: "ok" });
    } catch (err) {
      console.error(`[cron] Digest generation failed for org ${org.id}:`, err);
      results.push({ orgId: org.id, status: `error: ${String(err)}` });
    }
  }

  return NextResponse.json({ ok: true, firedAt: new Date().toISOString(), results });
}
