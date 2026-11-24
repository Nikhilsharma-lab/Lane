import { expect } from "@playwright/test";
import { openForm, passHumanCheck, test, typeCode } from "./helpers/auth-forms";
import { getProfileFullName, getProfileRole } from "./helpers/cleanup";
import { replaceEmailCode } from "./helpers/email-codes";
import { testEmail } from "./helpers/fixtures";
import { deleteSignedUpUser, readTestSession } from "./helpers/test-user";

test("a new person signs up, confirms their email, and is signed straight in to Onboarding", async ({ page }) => {
  test.setTimeout(180_000);
  const email = testEmail("sign-up");
  const workspaceName = `Lane E2E sign-up ${Date.now()}`;
  try {
    await openForm(page, "/signup");
    await expect(page.getByRole("heading", { name: "Create your Lane account", exact: true })).toBeVisible();
    await page.getByLabel("Your name", { exact: true }).fill("Lane E2E Newcomer");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Choose a password", { exact: true }).fill("LaneSignupE2E1234!");
    await passHumanCheck(page);
    await page.getByRole("button", { name: "Create account", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Confirm your email", exact: true })).toBeVisible();
    await expect(page.getByText(`Enter the 6-digit code we sent to ${email} to finish creating your account.`)).toBeVisible();
    expect(await readTestSession(page)).toBeNull();
    await typeCode(page, "Confirmation code", await replaceEmailCode(email, "email-verification"));
    await page.getByRole("button", { name: "Confirm email", exact: true }).click();

    await expect(page).toHaveURL("/onboarding");
    await expect(page.getByRole("heading", { name: "Create your workspace", exact: true })).toBeVisible();
    const confirmed = await readTestSession(page);
    expect(confirmed).toEqual({ userId: expect.any(String), orgId: null });
    const { userId } = confirmed!;
    expect(await getProfileFullName(userId)).toBe("Lane E2E Newcomer");
    // The role step follows a first workspace.
    await expect(page.getByRole("radio", { name: /^PM\b/ })).toHaveCount(0);

    await page.getByLabel("Workspace name").fill(workspaceName);
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Choose your role", exact: true })).toBeVisible();
    await page.getByRole("radio", { name: /^PM\b/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();
    await expect(page.getByRole("complementary").getByText(workspaceName, { exact: true })).toBeVisible();
    expect(await getProfileRole(userId)).toBe("pm");
  } finally {
    await deleteSignedUpUser(email);
  }
});
