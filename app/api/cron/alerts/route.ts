// app/api/cron/alerts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, proactiveAlerts } from "@/db/schema";
import {
  detectStallNudges,
  detectSignoffOverdue,
  detectFigmaDrift,
} from "@/lib/alerts/detect";
import { generateAlertCopy, type AlertInput } from "@/lib/ai/proactive-alerts";
import { isCronRequestAuthorized } from "@/lib/cron/auth";

export async function GET(req: NextRequest) {
  if (!isCronRequestAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let allOrgs: { id: string }[];
  try {
    allOrgs = await db.select({ id: organizations.id }).from(organizations);
  } catch (err) {
    console.error("[cron/alerts] Failed to fetch orgs:", err);
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 500 });
  }
  const results: { orgId: string; generated: number; skipped: number; errors: number }[] = [];

  // Sequential by design: parallel org processing would saturate the Claude API rate limit.
  // Revisit when org count > 50.
  for (const org of allOrgs) {
    let generated = 0;
    let skipped = 0;
    let errors = 0;

    try {
      // Run all 3 detectors in parallel
      const [stallNudges, signoffOverdue, figmaDrift] =
        await Promise.all([
          detectStallNudges(org.id),
          detectSignoffOverdue(org.id),
          detectFigmaDrift(org.id),
        ]);

      const allCandidates = [
        ...stallNudges,
        ...signoffOverdue,
        ...figmaDrift,
      ];

      for (const candidate of allCandidates) {
        try {
          // Build input for Claude
          const aiInput: AlertInput = {
            type: candidate.type,
            requestTitle: candidate.requestTitle,
            requestId: candidate.requestId,
            designerName: candidate.designerName,
            daysSinceActivity: candidate.daysSinceActivity,
            lastActivityDescription: candidate.lastActivityDescription,
            pendingSignoffRoles: candidate.pendingSignoffRoles,
            daysSinceValidationRequested: candidate.daysSinceValidationRequested,
            figmaChangeDescription: candidate.figmaChangeDescription,
            hoursSinceFigmaChange: candidate.hoursSinceFigmaChange,
          };

          const copy = await generateAlertCopy(aiInput);

          if (!copy) {
            // Claude failed — skip this alert, retry next hour
            skipped++;
            continue;
          }

          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          await db.insert(proactiveAlerts).values({
            orgId: org.id,
            requestId: candidate.requestId,
            recipientId: candidate.recipientId,
            type: candidate.type,
            urgency: copy.urgency,
            title: copy.title,
            body: copy.body,
            ctaLabel: copy.ctaLabel,
            ctaUrl: candidate.ctaUrl,
            ruleKey: candidate.ruleKey,
            expiresAt,
          });

          generated++;
        } catch (err) {
          // Likely a unique constraint violation on ruleKey — another process already inserted
          const pgCode = (err as { cause?: { code?: string }; code?: string })?.cause?.code
            ?? (err as { code?: string })?.code;
          if (pgCode !== "23505") {
            console.error(`[cron/alerts] Failed to insert alert ${candidate.ruleKey}:`, err);
            errors++;
          } else {
            skipped++; // duplicate rule_key — expected, skip silently
          }
        }
      }
    } catch (err) {
      console.error(`[cron/alerts] Detection failed for org ${org.id}:`, err);
      errors++;
    }

    results.push({ orgId: org.id, generated, skipped, errors });
  }

  return NextResponse.json({
    ok: true,
    firedAt: new Date().toISOString(),
    results,
  });
}
