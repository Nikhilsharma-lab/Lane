import { APP_URL } from "./index";

// Shared layout wrapper
function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DesignQ</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <!-- Logo -->
        <tr><td style="padding-bottom:28px;">
          <span style="font-size:14px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">DesignQ</span>
        </td></tr>
        <!-- Card -->
        <tr><td style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:32px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#52525b;">
            You're receiving this because you're part of a DesignQ workspace.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(text: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">${text}</a>`;
}

function label(text: string): string {
  return `<p style="margin:0 0 4px 0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">${text}</p>`;
}

function value(text: string): string {
  return `<p style="margin:0 0 16px 0;font-size:13px;color:#e4e4e7;">${text}</p>`;
}

// ── Templates ────────────────────────────────────────────────────────────────

export function assignmentEmail({
  assigneeName,
  assignedByName,
  requestTitle,
  requestId,
}: {
  assigneeName: string;
  assignedByName: string;
  requestTitle: string;
  requestId: string;
}): string {
  return layout(`
    <p style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:#ffffff;">You've been assigned</p>
    <p style="margin:0 0 24px 0;font-size:14px;color:#a1a1aa;line-height:1.6;">
      ${assignedByName} assigned you to a design request.
    </p>
    ${label("Request")}
    ${value(requestTitle)}
    ${button("View request", `${APP_URL}/dashboard/requests/${requestId}`)}
  `);
}

export function validationNeededEmail({
  recipientName,
  signerRole,
  requestTitle,
  requestId,
  requesterName,
}: {
  recipientName: string;
  signerRole: string;
  requestTitle: string;
  requestId: string;
  requesterName: string;
}): string {
  const roleLabel =
    signerRole === "designer" ? "Designer"
    : signerRole === "pm" ? "PM"
    : "Design Head";

  return layout(`
    <p style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:#ffffff;">Your sign-off is needed</p>
    <p style="margin:0 0 24px 0;font-size:14px;color:#a1a1aa;line-height:1.6;">
      A design is ready for validation and needs your approval as <strong style="color:#e4e4e7;">${roleLabel}</strong>.
    </p>
    ${label("Request")}
    ${value(requestTitle)}
    ${label("Submitted by")}
    ${value(requesterName)}
    <div style="background:#1c1c1f;border:1px solid #27272a;border-radius:8px;padding:12px 16px;margin-bottom:4px;">
      <p style="margin:0;font-size:12px;color:#71717a;">3 sign-offs required: Designer · PM · Design Head</p>
    </div>
    ${button("Review design", `${APP_URL}/dashboard/requests/${requestId}`)}
  `);
}

export function signoffSubmittedEmail({
  requestTitle,
  requestId,
  signerName,
  signerRole,
  decision,
  approvalsReceived,
}: {
  requestTitle: string;
  requestId: string;
  signerName: string;
  signerRole: string;
  decision: string;
  approvalsReceived: number;
}): string {
  const roleLabel =
    signerRole === "designer" ? "Designer"
    : signerRole === "pm" ? "PM"
    : "Design Head";

  const decisionLabel =
    decision === "approved" ? "approved"
    : decision === "approved_with_conditions" ? "approved with conditions"
    : "rejected";

  const decisionColor =
    decision === "rejected" ? "#f87171" : "#4ade80";

  return layout(`
    <p style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:#ffffff;">Validation update</p>
    <p style="margin:0 0 24px 0;font-size:14px;color:#a1a1aa;line-height:1.6;">
      <strong style="color:#e4e4e7;">${signerName}</strong> (${roleLabel}) has
      <strong style="color:${decisionColor};">${decisionLabel}</strong> the design.
    </p>
    ${label("Request")}
    ${value(requestTitle)}
    ${label("Progress")}
    ${value(`${approvalsReceived} / 3 approvals received`)}
    ${button("View validation", `${APP_URL}/dashboard/requests/${requestId}`)}
  `);
}

export function handoffEmail({
  recipientName,
  requestTitle,
  requestId,
  designerName,
  figmaUrl,
}: {
  recipientName: string;
  requestTitle: string;
  requestId: string;
  designerName: string;
  figmaUrl: string | null;
}): string {
  return layout(`
    <p style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:#ffffff;">Design ready for dev</p>
    <p style="margin:0 0 24px 0;font-size:14px;color:#a1a1aa;line-height:1.6;">
      <strong style="color:#e4e4e7;">${designerName}</strong> has handed off a design to dev.
    </p>
    ${label("Request")}
    ${value(requestTitle)}
    ${figmaUrl ? `${label("Figma")}${value(`<a href="${figmaUrl}" style="color:#818cf8;">${figmaUrl}</a>`)}` : ""}
    ${button("Open in DesignQ", `${APP_URL}/dashboard/requests/${requestId}`)}
  `);
}

export function inviteEmail({
  invitedByName,
  orgName,
  role,
  inviteUrl,
}: {
  invitedByName: string;
  orgName: string;
  role: string;
  inviteUrl: string;
}): string {
  return layout(`
    <p style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:#ffffff;">You've been invited to DesignQ</p>
    <p style="margin:0 0 24px 0;font-size:14px;color:#a1a1aa;line-height:1.6;">
      <strong style="color:#e4e4e7;">${invitedByName}</strong> invited you to join
      <strong style="color:#e4e4e7;">${orgName}</strong> as a <strong style="color:#e4e4e7;">${role}</strong>.
    </p>
    <div style="background:#1c1c1f;border:1px solid #27272a;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:12px;color:#71717a;">This invite expires in 7 days.</p>
    </div>
    ${button("Accept invitation", inviteUrl)}
  `);
}

export function allSignoffsEmail({
  requestTitle,
  requestId,
  requesterName,
}: {
  requestTitle: string;
  requestId: string;
  requesterName: string;
}): string {
  return layout(`
    <p style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:#ffffff;">Design approved ✓</p>
    <p style="margin:0 0 24px 0;font-size:14px;color:#a1a1aa;line-height:1.6;">
      All 3 sign-offs received. The design has been automatically advanced to <strong style="color:#e4e4e7;">Handoff</strong>.
    </p>
    ${label("Request")}
    ${value(requestTitle)}
    ${button("View request", `${APP_URL}/dashboard/requests/${requestId}`)}
  `);
}
