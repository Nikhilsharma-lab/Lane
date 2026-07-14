import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceInvitationEmail,
  sendWorkspaceInvitationEmail,
} from "./workspace-invitation";

const invitation = {
  to: "teammate@example.com",
  inviteUrl: "https://app.uselane.app/invite/example-token",
  workspaceName: "Research & Design",
  inviterName: "Nikhil <Sharma>",
  expiresAt: new Date("2026-07-21T00:00:00.000Z"),
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("workspace invitation email", () => {
  it("builds matching HTML and plain-text content without unescaped HTML", () => {
    const email = buildWorkspaceInvitationEmail(invitation);

    expect(email.subject).toBe(
      "Nikhil <Sharma> invited you to Research & Design on Lane"
    );
    expect(email.text).toContain(invitation.inviteUrl);
    expect(email.text).toContain("July 21, 2026");
    expect(email.html).toContain("Research &amp; Design");
    expect(email.html).toContain("Nikhil &lt;Sharma&gt;");
    expect(email.html).not.toContain("Nikhil <Sharma>");
  });

  it("keeps the invite usable when email is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(sendWorkspaceInvitationEmail(invitation)).resolves.toEqual({
      sent: false,
      reason: "not_configured",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends both HTML and plain text through Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(sendWorkspaceInvitationEmail(invitation)).resolves.toEqual({
      sent: true,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.to).toEqual([invitation.to]);
    expect(body.html).toContain("Accept invitation");
    expect(body.text).toContain(invitation.inviteUrl);
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
    });
  });
});
