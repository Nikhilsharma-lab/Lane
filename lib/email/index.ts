import { Resend } from "resend";
import { figmaDriftEmail } from "./templates";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.EMAIL_FROM ?? "DesignQ <notifications@designq.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://designq.app";

export { APP_URL };

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

/**
 * Send an email via Resend.
 * Silently no-ops if RESEND_API_KEY is not set (local dev without email).
 */
export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<void> {
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
