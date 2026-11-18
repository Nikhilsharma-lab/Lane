import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

test("forgot-password shows Clerk recovery instead of bouncing to login", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await expect(page).toHaveURL(/\/forgot-password/);
  await expect(
    page.getByRole("heading", { name: "Forgot your password?" })
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("reset-password stays on the recovery route without a valid token", async ({
  page,
}) => {
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/reset-password/);
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", {
      name: /reset your password|forgot (your )?password|sign in/i,
    })
  ).toBeVisible();
});

// #290 (D12, D16, D13): nothing was sent, so there is no wait; the message sits on the field.
test("an unknown email on Forgot password leaves Send usable, with the error on the field", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  await page.goto("/forgot-password");
  const email = page.getByLabel("Email address");
  const send = page.getByRole("button", { name: "Send reset code" });

  // D11: Lane's own messages, not the browser's tooltip.
  await send.click();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("Enter an email address.");
  await expect(email).toBeFocused();
  await email.fill("not-an-email");
  await expect(email).not.toHaveAttribute("aria-invalid", "true");
  await send.click();
  await expect(email).toHaveAccessibleDescription("Enter a valid email address.");

  await email.fill(`lane-e2e-no-account-${Date.now()}@example.com`);
  await send.click();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(/Couldn.t find your account\./);
  await expect(send).toBeEnabled();
  await expect(send).toHaveText("Send reset code");
  await expect(page.getByText(/Send reset code in \d+s/)).toHaveCount(0);
});
