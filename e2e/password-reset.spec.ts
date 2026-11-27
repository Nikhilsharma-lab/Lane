import { expect, type Page } from "@playwright/test";
import { formReady, openForm, passHumanCheck, test, typeCode } from "./helpers/auth-forms";
import { cleanupTestWorkspace, provisionTestWorkspace } from "./helpers/cleanup";
import { replaceEmailCode } from "./helpers/email-codes";
import { testEmail } from "./helpers/fixtures";
import { createTestUser, deleteTestUser, readTestSession, signInTestUser } from "./helpers/test-user";

const email = (page: Page) => page.getByLabel("Email address", { exact: true });
const sendCode = (page: Page) => page.getByRole("button", { name: "Send reset code", exact: true });

test("a reset by code signs the person in here, and out of their other browser on its next click", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const user = await createTestUser("reset");
  const otherContext = await browser.newContext();
  try {
    const orgId = await provisionTestWorkspace({ userId: user.id, email: user.email, name: "Lane E2E", workspaceName: "Lane E2E reset" });
    const other = await otherContext.newPage();
    await signInTestUser(other, user, orgId);
    await other.goto("/");
    await expect(other.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();
    expect((await readTestSession(other))?.userId).toBe(user.id);

    await openForm(page, "/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL("/forgot-password");
    await expect(page.getByRole("heading", { name: "Forgot your password?", exact: true })).toBeVisible();
    await formReady(page);
    await email(page).fill(user.email);
    await passHumanCheck(page);
    await sendCode(page).click();

    await expect(page.getByRole("heading", { name: "Reset your password", exact: true })).toBeVisible();
    await typeCode(page, "Reset code", await replaceEmailCode(user.email, "forget-password"));
    await page.getByLabel("New password", { exact: true }).fill("LaneResetE2E5678!");
    await passHumanCheck(page);
    await page.getByRole("button", { name: "Save new password", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Password saved", exact: true })).toBeVisible();
    await expect(page.getByText("You’re signed in here, and signed out on your other devices.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();
    expect((await readTestSession(page))?.userId).toBe(user.id);

    // The other browser's page was open all along. Its next click asks it to sign in, and the old password is refused.
    await other.getByRole("complementary", { name: "Workspace sidebar" }).getByRole("link", { name: /^Inbox\b/ }).click();
    await expect(other).toHaveURL(`/login?${new URLSearchParams({ redirect_url: "/inbox" })}`);
    expect(await readTestSession(other)).toBeNull();
    await formReady(other);
    await email(other).fill(user.email);
    await other.getByLabel("Password", { exact: true }).fill(user.password);
    await other.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(other.getByLabel("Password", { exact: true })).toHaveAccessibleDescription("That email and password don’t match. Try again, or email yourself a code.");
  } finally {
    await otherContext.close();
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

test("an old reset link opens the same reset, with the email it names", async ({ page }) => {
  await openForm(page, "/reset-password?email=someone%40example.com");
  await expect(page).toHaveURL(/\/reset-password\?/);
  await expect(page.getByRole("heading", { name: "Forgot your password?", exact: true })).toBeVisible();
  await expect(email(page)).toHaveValue("someone@example.com");
  await expect(sendCode(page)).toBeVisible();
});

// #290 (D11, D12, D13, D16): Lane's own messages; nothing was sent, so there is no wait.
test("an unknown email on Forgot password shows its line and leaves Send usable", async ({ page }) => {
  await openForm(page, "/forgot-password");
  await sendCode(page).click();
  await expect(email(page)).toHaveAttribute("aria-invalid", "true");
  await expect(email(page)).toHaveAccessibleDescription("Enter an email address.");
  await expect(email(page)).toBeFocused();
  await email(page).fill("not-an-email");
  await expect(email(page)).not.toHaveAttribute("aria-invalid", "true");
  await sendCode(page).click();
  await expect(email(page)).toHaveAccessibleDescription("Enter a valid email address.");

  const unknown = testEmail("unknown-reset");
  await email(page).fill(unknown);
  await passHumanCheck(page);
  await sendCode(page).click();
  await expect(page.getByText("No Lane account uses this email.", { exact: true })).toBeVisible();
  await expect(sendCode(page)).toBeEnabled();
  await expect(sendCode(page)).toHaveText("Send reset code");
  await expect(sendCode(page)).not.toHaveAttribute("aria-disabled", "true");
  await page.getByRole("link", { name: "Sign up instead" }).click();
  await expect(page.getByRole("heading", { name: "Create your Lane account", exact: true })).toBeVisible();
  await expect(email(page)).toHaveValue(unknown);
});
