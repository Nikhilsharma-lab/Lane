// app/api/cron/weekly-digest/route.ts
// Friday weekly digest cron. Fires once per week per org (composite unique on
// orgId + weekStartDate prevents duplicate inserts within a retry loop).
// Per org: generate digest with bounded retry → insert historical row →
// fan out in-app notifications + emails to every lead/admin.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, weeklyDigests, profiles, notifications } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { generateDigestForOrg } from "@/lib/digest";
import { sendWeeklyDigestEmail } from "@/lib/email";

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const delay = 1000 * 2 ** i; // 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function getMondayOfThisWeek(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  return monday.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekStartDate = getMondayOfThisWeek();

  let allOrgs: { id: string; name: string }[];
  try {
    allOrgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  } catch (err) {
    console.error("[cron/weekly-digest] Failed to fetch orgs:", err);
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 500 });
  }

  const results: {
    orgId: string;
    status: string;
    notified: number;
    emailed: number;
  }[] = [];

  for (const org of allOrgs) {
    let notified = 0;
    let emailed = 0;

    try {
      // First-digest detection: any prior row for this org (before this insert)?
      const priorDigests = await db
        .select({ id: weeklyDigests.id })
        .from(weeklyDigests)
        .where(eq(weeklyDigests.orgId, org.id))
        .limit(1);
      const isFirstDigest = priorDigests.length === 0;

      // Generate with bounded retry on Anthropic transient failures.
      const digestResponse = await withRetry(() => generateDigestForOrg(org.id));

      // Historical insert — composite unique (orgId, weekStartDate) prevents
      // duplicates if the cron fires twice in the same week.
      await db
        .insert(weeklyDigests)
        .values({
          orgId: org.id,
          weekStartDate,
          generatedAt: new Date(),
          content: digestResponse as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing({
          target: [weeklyDigests.orgId, weeklyDigests.weekStartDate],
        });

      // Fan out to leads + admins
      const recipients = await db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          email: profiles.email,
        })
        .from(profiles)
        .where(
          and(
            eq(profiles.orgId, org.id),
            or(eq(profiles.role, "lead"), eq(profiles.role, "admin")),
          ),
        );

      const headline = digestResponse.digest.headline;
      const teamHealth = digestResponse.digest.teamHealth;

      for (const rcpt of recipients) {
        // In-app notification — silent on insert failure so one recipient
        // failure doesn't block the rest.
        try {
          await db.insert(notifications).values({
            orgId: org.id,
            recipientId: rcpt.id,
            actorId: null, // system-generated
            type: "weekly_digest",
            title: `Weekly digest: ${headline}`,
            body: teamHealth.slice(0, 160),
            url: "/dashboard/insights",
          });
          notified++;
        } catch (err) {
          console.error(
            `[cron/weekly-digest] notification insert failed for ${rcpt.id}:`,
            err,
          );
        }

        // Email — sendEmail already silently no-ops if RESEND_API_KEY not set
        if (rcpt.email) {
          try {
            await sendWeeklyDigestEmail({
              to: rcpt.email,
              digestHeadline: headline,
              shippedThisWeek: digestResponse.digest.shippedThisWeek,
              teamHealth,
              standout: digestResponse.digest.standout,
              recommendations: digestResponse.digest.recommendations,
              isFirstDigest,
            });
            emailed++;
          } catch (err) {
            console.error(
              `[cron/weekly-digest] email send failed for ${rcpt.email}:`,
              err,
            );
          }
        }
      }

      results.push({ orgId: org.id, status: "ok", notified, emailed });
    } catch (err) {
      console.error(
        `[cron/weekly-digest] Digest generation failed for org ${org.id}:`,
        err,
      );
      results.push({
        orgId: org.id,
        status: `error: ${String(err)}`,
        notified,
        emailed,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    firedAt: new Date().toISOString(),
    weekStartDate,
    results,
  });
}
