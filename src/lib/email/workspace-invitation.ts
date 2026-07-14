const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const INVITE_FROM = "Lane <auth@uselane.app>";

type WorkspaceInvitationEmail = {
  to: string;
  inviteUrl: string;
  workspaceName: string;
  inviterName: string;
  expiresAt: Date;
};

export type WorkspaceInvitationDelivery =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "provider_error" };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildWorkspaceInvitationEmail({
  to,
  inviteUrl,
  workspaceName,
  inviterName,
  expiresAt,
}: WorkspaceInvitationEmail) {
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeInviterName = escapeHtml(inviterName);
  const safeInviteUrl = escapeHtml(inviteUrl);
  const expiry = expiresAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const subject = `${inviterName} invited you to ${workspaceName} on Lane`;

  return {
    from: INVITE_FROM,
    to: [to],
    subject,
    text: [
      `${inviterName} invited you to join ${workspaceName} on Lane.`,
      "",
      `Accept the invitation: ${inviteUrl}`,
      "",
      `This invitation expires on ${expiry}. If you were not expecting it, you can ignore this email.`,
    ].join("\n"),
    html: `
      <div style="background:#f8fafc;padding:32px 16px;font-family:Arial,sans-serif;color:#172033">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:32px">
          <p style="margin:0 0 24px;font-size:18px;font-weight:600">Lane</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:32px">Join ${safeWorkspaceName}</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#526071">
            ${safeInviterName} invited you to join this workspace on Lane.
          </p>
          <a href="${safeInviteUrl}" style="display:block;border-radius:8px;background:#172033;color:#ffffff;text-align:center;text-decoration:none;padding:12px 16px;font-weight:600">
            Accept invitation
          </a>
          <p style="margin:24px 0 8px;font-size:13px;line-height:20px;color:#697586">
            This invitation expires on ${expiry}.
          </p>
          <p style="margin:0;font-size:13px;line-height:20px;color:#697586;word-break:break-all">
            If the button does not work, open: ${safeInviteUrl}
          </p>
        </div>
      </div>
    `.trim(),
  };
}

export async function sendWorkspaceInvitationEmail(
  invitation: WorkspaceInvitationEmail
): Promise<WorkspaceInvitationDelivery> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "not_configured" };

  try {
    const response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildWorkspaceInvitationEmail(invitation)),
    });

    if (!response.ok) {
      console.error("[workspace-invitation] Resend rejected the email", {
        status: response.status,
      });
      return { sent: false, reason: "provider_error" };
    }

    return { sent: true };
  } catch (error) {
    console.error("[workspace-invitation] Email delivery failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return { sent: false, reason: "provider_error" };
  }
}
