import { expect, test } from "@playwright/test";

import { cleanupTestWorkspace, provisionTestWorkspace } from "./helpers/cleanup";
import { testEmail } from "./helpers/fixtures";
import { createTestUser, deleteTestUser, signInTestUser } from "./helpers/test-user";

// #288 (D37): the paid-seat confirmation, loaded only when it is first needed, opens on a production build while
// billing is enforced. Run it on its own, against `pnpm build`, with billing switched on for the test server only:
//   LANE_BILLING_ENFORCED=1 LANE_E2E_START=1 … playwright test e2e/settings-paid-seat.spec.ts
// The one invitation goes to Resend's test recipient and is revoked at the end. Nothing is paid.
test.skip(process.env.LANE_BILLING_ENFORCED !== "1", "needs LANE_BILLING_ENFORCED=1 on the test server (and a production build)");

test("adding a paid seat opens its confirmation, which cancels and confirms with focus back where it was", async ({ page }) => {
  test.setTimeout(600_000);
  const admin = await createTestUser("settings-288-paid-seat");
  try {
    const orgId = await provisionTestWorkspace({ userId: admin.id, email: admin.email, name: "Lane E2E", workspaceName: `Lane E2E paid seat ${Date.now()}` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/login", { timeout: 120_000 });
    await signInTestUser(page, admin, orgId);
    const chunkFailures: string[] = [];
    page.on("response", response => { if (response.url().includes("/_next/static/chunks/") && response.status() >= 400) chunkFailures.push(`${response.status()} ${response.url()}`); });

    await page.goto("/settings/members");
    await page.getByRole("button", { name: "Invite people" }).click();
    const invite = page.getByRole("dialog", { name: "Invite people" });
    await expect(invite).toContainText("You’ll confirm each paid seat before it’s added.");
    const invitee = testEmail("paid-seat-invitee");
    await invite.getByLabel("Email address").fill(invitee);
    const send = invite.getByRole("button", { name: "Send invitation" });
    await send.click();

    const seat = page.getByRole("dialog", { name: "This adds a paid seat" });
    await expect(seat).toBeVisible();
    await expect(seat).toContainText(`${invitee} is invited as a Member. Their seat starts when they join.`);
    await expect(seat.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(seat).toBeHidden();
    await expect(send).toBeFocused();
    await expect(invite.getByLabel("Email address")).toHaveValue(invitee);

    await send.click();
    await expect(seat).toBeVisible();
    await seat.getByRole("button", { name: "Add paid seat" }).click();
    await expect(invite).toBeHidden();
    const pending = page.getByRole("list", { name: "Pending invitations" });
    await expect(pending.getByText(invitee)).toBeVisible();
    expect(chunkFailures).toEqual([]);

    await pending.getByRole("button", { name: `Revoke the invitation for ${invitee}` }).click();
    await expect(pending.getByText(invitee)).toHaveCount(0);
  } finally {
    await cleanupTestWorkspace(admin.id);
    await deleteTestUser(admin.id);
  }
});
