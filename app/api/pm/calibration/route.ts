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

  // Get all org members
  const orgMembers = await db
    .select()
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));

  // Get all requests for the org with impact records
  const orgRequests = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, profile.orgId));

  const orgReqIds = orgRequests.map((r) => r.id);
  if (!orgReqIds.length) return NextResponse.json({ calibrations: [] });

  const allRecords = await db
    .select()
    .from(impactRecords)
    .where(inArray(impactRecords.requestId, orgReqIds));

  // Group records by PM
  const byPm: Record<string, typeof allRecords> = {};
  for (const rec of allRecords) {
    // Use pmId from record, or fall back to requester of the request
    const req = orgRequests.find((r) => r.id === rec.requestId);
    const pmId = rec.pmId ?? req?.requesterId;
    if (!pmId) continue;
    if (!byPm[pmId]) byPm[pmId] = [];
    byPm[pmId].push(rec);
  }

  const calibrations = Object.entries(byPm)
    .map(([pmId, records]) => {
      const member = orgMembers.find((m) => m.id === pmId);
      if (!member) return null;

      // Only include records that have actual values and variance calculated
      const measured = records.filter((r) => r.actualValue && r.variancePercent !== null);
      if (!measured.length) return null;

      const variances = measured.map((r) => parseFloat(r.variancePercent as string));
      const avgVariance = variances.reduce((s, v) => s + v, 0) / variances.length;

      // Trend: compare first half vs second half (need at least 4 records)
      let trend: "improving" | "worsening" | "stable" = "stable";
      if (measured.length >= 4) {
        const mid = Math.floor(measured.length / 2);
        const firstHalfAvg =
          measured.slice(0, mid).reduce((s, r) => s + Math.abs(parseFloat(r.variancePercent as string)), 0) / mid;
        const secondHalfAvg =
          measured.slice(mid).reduce((s, r) => s + Math.abs(parseFloat(r.variancePercent as string)), 0) / (measured.length - mid);
        if (secondHalfAvg < firstHalfAvg - 5) trend = "improving";
        else if (secondHalfAvg > firstHalfAvg + 5) trend = "worsening";
      }

      // Label based on avg variance
      const label =
        Math.abs(avgVariance) <= 10
          ? "well_calibrated"
          : avgVariance < -10
          ? "over_optimistic"   // predicted more than delivered
          : "under_optimistic"; // delivered more than predicted

      // Recent 5 records
      const recent = measured.slice(-5).reverse().map((r) => {
        const req = orgRequests.find((req) => req.id === r.requestId);
        return {
          requestId: r.requestId,
          requestTitle: req?.title ?? "Unknown request",
          predictedValue: r.predictedValue,
          actualValue: r.actualValue,
          variancePercent: parseFloat(r.variancePercent as string),
          measuredAt: r.measuredAt,
        };
      });

      return {
        pmId,
        fullName: member.fullName ?? "Unknown",
        role: member.role,
        predictionCount: measured.length,
        avgVariancePercent: Math.round(avgVariance * 10) / 10,
        trend,
        label,
        recent,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(a!.avgVariancePercent) - Math.abs(b!.avgVariancePercent)); // best calibrated first

  return NextResponse.json({ calibrations });
}
