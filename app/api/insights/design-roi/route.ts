import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, impactRecords, requests } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const orgRequests = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, profile.orgId));

  const orgReqIds = orgRequests.map((r) => r.id);
  if (!orgReqIds.length) return NextResponse.json({ roi: [] });

  const allRecords = await db
    .select()
    .from(impactRecords)
    .where(inArray(impactRecords.requestId, orgReqIds));

  const measured = allRecords.filter(
    (r) => r.actualValue && r.variancePercent !== null
  );
  if (!measured.length) return NextResponse.json({ roi: [] });

  // Group by requestType
  const byType: Record<string, number[]> = {};
  for (const rec of measured) {
    const req = orgRequests.find((r) => r.id === rec.requestId);
    const type = req?.requestType ?? "other";
    if (!byType[type]) byType[type] = [];
    byType[type].push(parseFloat(rec.variancePercent as string));
  }

  const roi = Object.entries(byType)
    .map(([requestType, variances]) => {
      const avgVariancePercent =
        Math.round(
          (variances.reduce((s, v) => s + v, 0) / variances.length) * 10
        ) / 10;
      const positive = variances.filter((v) => v >= 0).length;
      const negative = variances.filter((v) => v < 0).length;
      const direction: "positive" | "negative" | "mixed" =
        positive === variances.length
          ? "positive"
          : negative === variances.length
          ? "negative"
          : "mixed";

      return {
        requestType,
        count: variances.length,
        avgVariancePercent,
        direction,
      };
    })
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ roi });
}
