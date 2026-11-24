import { expect, type Page } from "@playwright/test";
import { formReady, openForm, passHumanCheck, test, typeCode } from "./helpers/auth-forms";
import { cleanupTestWorkspace, provisionTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { replaceEmailCode } from "./helpers/email-codes";
import { testEmail } from "./helpers/fixtures";
import { createTestUser, deleteTestUser, readTestSession, type TestUser } from "./helpers/test-user";

const REQUEST = "The Request behind the link";
const RETURN_ADDRESS = "/?status=open";
const SIGN_IN_THEN_RETURN = `/login?${new URLSearchParams({ redirect_url: RETURN_ADDRESS })}`;

/**
 * Runs with a person in a workspace, who is deleted after. The workspace has a Request, because an empty one drops the
 * status view from the list's address.
 */
async function withPerson(label: string, run: (user: TestUser) => Promise<void>) {
  const user = await createTestUser(label);
  try {
    await provisionTestWorkspace({ userId: user.id, email: user.email, name: "Lane E2E", workspaceName: `Lane E2E ${label}` });
    await seedTestRequest(user.id, REQUEST);
    await run(user);
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
}

const email = (page: Page) => page.getByLabel("Email address", { exact: true });
const password = (page: Page) => page.getByLabel("Password", { exact: true });
const signIn = (page: Page) => page.getByRole("button", { name: "Sign in", exact: true });

/** Signed in as this person, on the page they were sent from. */
async function expectReturned(page: Page, user: TestUser) {
  await expect(page.getByRole("link", { name: REQUEST, exact: true })).toBeVisible();
  await expect(page).toHaveURL(RETURN_ADDRESS);
  expect((await readTestSession(page))?.userId).toBe(user.id);
}

test("a person signs in with their password and lands on the page they were sent from", async ({ page }) => {
  await withPerson("password", async (user) => {
    // Signed out, the page asks them to sign in and keeps its address.
    await page.goto(RETURN_ADDRESS);
    await expect(page).toHaveURL(SIGN_IN_THEN_RETURN);
    await expect(page.getByRole("heading", { name: "Sign in to Lane", exact: true })).toBeVisible();
    await formReady(page);
    await email(page).fill(user.email);
    await password(page).fill(user.password);
    await signIn(page).click();
    await expectReturned(page, user);
  });
});

test("a return address on another site is not followed", async ({ page }) => {
  await withPerson("off-site", async (user) => {
    await openForm(page, `/login?${new URLSearchParams({ redirect_url: "//example.com/elsewhere" })}`);
    await email(page).fill(user.email);
    await password(page).fill(user.password);
    await signIn(page).click();
    await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();
    await expect(page).toHaveURL("/");
  });
});

test("a person signs in with an emailed code and lands on the page they were sent from", async ({ page }) => {
  await withPerson("code", async (user) => {
    await openForm(page, SIGN_IN_THEN_RETURN);
    await email(page).fill(user.email);
    await page.getByRole("button", { name: "Email me a sign-in code instead" }).click();
    await expect(email(page)).toHaveValue(user.email);
    await passHumanCheck(page);
    await page.getByRole("button", { name: "Email me a code", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Check your email", exact: true })).toBeVisible();
    await expect(page.getByText(`Enter the 6-digit code we sent to ${user.email}.`)).toBeVisible();
    await typeCode(page, "Sign-in code", await replaceEmailCode(user.email, "sign-in"));
    await signIn(page).click();
    await expectReturned(page, user);
  });
});

test("Continue with Google leaves for Google with Lane's addresses, and Google's error lands on its line", async ({ page, context, baseURL }) => {
  // Stands in for Google, so no test contacts it: it answers as Google does for a person who cancels.
  const left: URL[] = [];
  await context.route(/^https:\/\/([^/]+\.)?google(apis)?\.com\//, (route) => {
    const address = new URL(route.request().url());
    left.push(address);
    const back = `${address.searchParams.get("redirect_uri")}?${new URLSearchParams({ error: "access_denied", state: address.searchParams.get("state") ?? "" })}`;
    return route.fulfill({ contentType: "text/html", body: `<title>Google</title><a href="${back.replaceAll("&", "&amp;")}">Cancel</a>` });
  });

  await openForm(page, SIGN_IN_THEN_RETURN);
  const asked = page.waitForRequest("/api/auth/sign-in/social");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  expect((await asked).postDataJSON()).toMatchObject({ provider: "google", callbackURL: RETURN_ADDRESS, errorCallbackURL: SIGN_IN_THEN_RETURN });

  await expect(page).toHaveTitle("Google");
  expect(left.map(({ origin, pathname }) => origin + pathname)).toEqual(["https://accounts.google.com/o/oauth2/v2/auth"]);
  expect(left[0].searchParams.get("redirect_uri")).toBe(`${baseURL}/api/auth/callback/google`);

  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByText("Google sign-in didn’t finish. Try again, or use your email.", { exact: true })).toBeVisible();
  const { pathname, searchParams } = new URL(page.url());
  expect(pathname).toBe("/login");
  expect(Object.fromEntries(searchParams)).toEqual({ redirect_url: RETURN_ADDRESS, error: "access_denied" });
  expect(await readTestSession(page)).toBeNull();
});

test("a wrong password shows its line on the password", async ({ page }) => {
  await withPerson("wrong-password", async (user) => {
    await openForm(page, "/login");
    await email(page).fill(user.email);
    await password(page).fill("not-their-password");
    await signIn(page).click();

    await expect(password(page)).toHaveAccessibleDescription("That email and password don’t match. Try again, or email yourself a code.");
    await expect(password(page)).toBeFocused();
    await expect(page).toHaveURL("/login");
    expect(await readTestSession(page)).toBeNull();
  });
});

test("an unknown email shows its line, with sign-up one press away and the email kept", async ({ page }) => {
  const unknown = testEmail("unknown");
  await openForm(page, "/login");
  await email(page).fill(unknown);
  await page.getByRole("button", { name: "Email me a sign-in code instead" }).click();
  await passHumanCheck(page);
  await page.getByRole("button", { name: "Email me a code", exact: true }).click();

  await expect(page.getByText("No Lane account uses this email.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Sign up instead" }).click();
  await expect(page.getByRole("heading", { name: "Create your Lane account", exact: true })).toBeVisible();
  await expect(email(page)).toHaveValue(unknown);
});
