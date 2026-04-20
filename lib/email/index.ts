import { Resend } from "resend";
import postgres from "postgres";
import { figmaDriftEmail, weeklyDigestEmail } from "./templates";

// Belt and suspenders: refuse to load the module if misconfigured.
// NODE_ENV=production with ENABLE_TEST_EMAIL_CAPTURE=true is a
// security issue (test capture would silently swallow real customer
// email). Mirrors the production guard in scripts/run-sql-tests.mjs.
if (
  process.env.NODE_ENV === "production" &&
  process.env.ENABLE_TEST_EMAIL_CAPTURE === "true"
) {
  throw new Error(
    "Refusing to load lib/email: NODE_ENV=production with " +
      "ENABLE_TEST_EMAIL_CAPTURE=true. This would cause outbound " +
      "customer emails to be captured instead of sent. " +
      "Fix: unset ENABLE_TEST_EMAIL_CAPTURE in production environment."
  );
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.EMAIL_FROM ?? "Lane <notifications@lane.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lane.app";

export { APP_URL };

// Lazy-init the capture client only when actually needed.
// Keeps lib/email import cheap for modules that never send email.
let captureSql: ReturnType<typeof postgres> | null = null;

function getCaptureClient() {
  if (!captureSql) {
    const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "captureSentEmail requires DIRECT_DATABASE_URL or DATABASE_URL. " +
          "This fires only when NODE_ENV!=production AND " +
          "ENABLE_TEST_EMAIL_CAPTURE=true — check your test env config."
      );
    }
    captureSql = postgres(url, { max: 1, connect_timeout: 8 });
  }
  return captureSql;
}

async function captureSentEmail(params: {
  to_address: string;
  subject: string;
  body_html: string;
  template_name: string | null;
}) {
  const sql = getCaptureClient();
  await sql`
    INSERT INTO sent_emails (to_address, subject, body_html, template_name)
    VALUES (${params.to_address}, ${params.subject}, ${params.body_html}, ${params.template_name})
  `;
}

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  templateName?: string; // optional, for fixture queryability
}

/**
 * Send an email via Resend.
 * Silently no-ops if RESEND_API_KEY is not set (local dev without email).
 *
 * Test capture: when NODE_ENV!=production AND ENABLE_TEST_EMAIL_CAPTURE=true,
 * writes to the dev_only sent_emails table instead of calling Resend.
 */
export async function sendEmail({ to, subject, html, templateName }: SendEmailParams): Promise<void> {
  // Capture errors intentionally propagate — unlike real-send errors
  // below which are swallowed to keep user flows resilient, capture
  // errors are test infrastructure failures that should fail loudly.
  //
  // Test capture path: write to sent_emails, skip Resend entirely.
  // Gated by NODE_ENV check + explicit opt-in env var so production
  // never hits this branch even if ENABLE_TEST_EMAIL_CAPTURE leaks in.
  // MUST come before the !resend check so capture fires even when
  // RESEND_API_KEY is unset (dev / CI scenarios).
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_TEST_EMAIL_CAPTURE === "true"
  ) {
    const recipients = Array.isArray(to) ? to : [to];
    for (const recipient of recipients) {
      await captureSentEmail({
        to_address: recipient,
        subject,
        body_html: html,
        template_name: templateName ?? null,
      });
    }
    return; // do not call Resend
  }

  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set — skipping email to ${to}: ${subject}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    // Never let email failure break the main flow
    console.error("[email] Failed to send:", err);
  }
}

/**
 * Notify the dev owner when the designer updates Figma post-handoff.
 * Silently no-ops if RESEND_API_KEY is not set.
 */
export async function sendFigmaDriftEmail(params: {
  to: string;
  requestTitle: string;
  requestUrl: string;
  designerName: string;
}): Promise<void> {
  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set — skipping figma drift email to ${params.to}`);
    return;
  }
  const { subject, html } = figmaDriftEmail({
    requestTitle: params.requestTitle,
    requestUrl: params.requestUrl,
    designerName: params.designerName,
  });
  await sendEmail({ to: params.to, subject, html });
}

/**
 * Send the Friday weekly digest email to a lead/admin.
 * First-digest emails get a short onboarding preamble.
 * Silently no-ops if RESEND_API_KEY is not set.
 */
export async function sendWeeklyDigestEmail(params: {
  to: string;
  digestHeadline: string;
  shippedThisWeek: string;
  teamHealth: string;
  standout: string;
  recommendations: string[];
  isFirstDigest: boolean;
}): Promise<void> {
  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set — skipping weekly digest email to ${params.to}`);
    return;
  }
  const { subject, html } = weeklyDigestEmail({
    digestHeadline: params.digestHeadline,
    shippedThisWeek: params.shippedThisWeek,
    teamHealth: params.teamHealth,
    standout: params.standout,
    recommendations: params.recommendations,
    isFirstDigest: params.isFirstDigest,
  });
  await sendEmail({ to: params.to, subject, html });
}
