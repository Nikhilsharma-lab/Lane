import { expect, test, type Page } from "@playwright/test";

import {
  cleanupTestInvite,
  cleanupTestWorkspace,
  createTestWorkspace,
  deleteTestWorkspace,
  seedPendingInvite,
} from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

const SURFACES = [
  {
    name: "desktop light",
    colorScheme: "light" as const,
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "desktop dark",
    colorScheme: "dark" as const,
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "mobile light",
    colorScheme: "light" as const,
    viewport: { width: 390, height: 844 },
  },
  {
    name: "mobile dark",
    colorScheme: "dark" as const,
    viewport: { width: 390, height: 844 },
  },
] as const;

async function holdAndFailNextAction(page: Page, url: string) {
  let releaseRequest: (() => void) | undefined;
  let markSeen: (() => void) | undefined;
  let requestCount = 0;
  const released = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    markSeen = resolve;
  });

  await page.route(url, async (route) => {
    const request = route.request();
    if (
      requestCount === 0 &&
      request.method() === "POST" &&
      request.headers()["next-action"]
    ) {
      requestCount += 1;
      markSeen?.();
      await released;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  return {
    seen,
    release() {
      releaseRequest?.();
    },
    count() {
      return requestCount;
    },
  };
}

async function holdNextRequestsNavigation(page: Page) {
  let releaseRequest: (() => void) | undefined;
  let markSeen: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    markSeen = resolve;
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isRequestsNavigation =
      request.method() === "GET" &&
      url.pathname === "/" &&
      (request.headers().rsc === "1" || url.searchParams.has("_rsc"));

    if (isRequestsNavigation) {
      markSeen?.();
      await released;
    }
    await route.continue();
  });

  return {
    seen,
    release() {
      releaseRequest?.();
    },
  };
}

async function submitTwice(form: ReturnType<Page["locator"]>) {
  await form.evaluate((element: HTMLFormElement) => {
    element.requestSubmit();
    element.requestSubmit();
  });
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("Login and Signup recover one failed action across desktop/mobile and light/dark", async ({
  page,
}) => {
  test.setTimeout(180_000);

  for (const surface of SURFACES) {
    await page.setViewportSize(surface.viewport);
    await page.emulateMedia({ colorScheme: surface.colorScheme });

    await page.goto("/login");
    if (surface.colorScheme === "dark") {
      await expect(page.locator("html")).toHaveClass(/dark/);
    } else {
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    }
    const loginEmail = `${surface.name.replace(" ", "-")}@example.com`;
    const loginForm = page.locator("form").filter({
      has: page.getByLabel("Password", { exact: true }),
    });
    await page.getByLabel("Email", { exact: true }).fill(loginEmail);
    await page.getByLabel("Password", { exact: true }).fill("NotThePassword");

    const failedLogin = await holdAndFailNextAction(page, "**/login**");
    await submitTwice(loginForm);
    await failedLogin.seen;

    await expect(
      page.getByRole("button", { name: "Signing in…", exact: true })
    ).toBeDisabled();
    await expect(loginForm).toHaveAttribute("aria-busy", "true");
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
      loginEmail
    );
    expect(failedLogin.count(), surface.name).toBe(1);

    failedLogin.release();
    await expect(
      page.getByText("Your details are still here", { exact: false })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true })
    ).toBeEnabled();
    await expect(loginForm).toHaveAttribute("aria-busy", "false");
    await page.unroute("**/login**");

    await page.goto("/signup");
    const signupEmail = `new-${surface.name.replace(" ", "-")}@example.com`;
    const signupForm = page.locator("form").filter({
      has: page.getByLabel("Full name", { exact: true }),
    });
    await page.getByLabel("Full name", { exact: true }).fill("Nikhil Sharma");
    await page.getByLabel("Work email", { exact: true }).fill(signupEmail);
    await page.getByLabel("Password", { exact: true }).fill("Test1234!");

    const failedSignup = await holdAndFailNextAction(page, "**/signup**");
    await submitTwice(signupForm);
    await failedSignup.seen;

    await expect(
      page.getByRole("button", { name: "Creating account…", exact: true })
    ).toBeDisabled();
    await expect(signupForm).toHaveAttribute("aria-busy", "true");
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
      "Nikhil Sharma"
    );
    await expect(page.getByLabel("Work email", { exact: true })).toHaveValue(
      signupEmail
    );
    expect(failedSignup.count(), surface.name).toBe(1);

    failedSignup.release();
    await expect(
      page.getByText("Your details are still here", { exact: false })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create account", exact: true })
    ).toBeEnabled();
    await expect(signupForm).toHaveAttribute("aria-busy", "false");
    await page.unroute("**/signup**");
  }
});

test("Accept Invite recovers after a failed join without losing context", async ({
  page,
}) => {
  const user = await createTestUser("invite-recovery");
  const token = `e2e-invite-recovery-${Date.now()}`;
  const workspaceName = `Recovery Workspace ${Date.now()}`;
  const workspaceId = await createTestWorkspace(
    workspaceName,
    `recovery-workspace-${Date.now()}`
  );

  try {
    await seedPendingInvite(workspaceId, user.email, token);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await loginAs(page, user.email, user.password);
    await page.waitForURL("**/onboarding", { timeout: 20_000 });
    await page.goto(`/invite/${token}`);

    const failedJoin = await holdAndFailNextAction(
      page,
      `**/invite/${token}**`
    );
    const joinButton = page.getByRole("button", {
      name: `Join ${workspaceName}`,
      exact: true,
    });
    await joinButton.evaluate((element: HTMLButtonElement) => {
      element.click();
      element.click();
    });
    await failedJoin.seen;

    await expect(
      page.getByRole("button", {
        name: "Joining workspace…",
        exact: true,
      })
    ).toBeDisabled();
    expect(failedJoin.count()).toBe(1);

    failedJoin.release();
    await expect(
      page.getByText("Check your connection and try again.", {
        exact: false,
      })
    ).toBeVisible();
    await expect(joinButton).toBeEnabled();
    await expect(
      page.getByRole("heading", { name: `Join ${workspaceName}` })
    ).toBeVisible();
  } finally {
    await page.unroute(`**/invite/${token}**`).catch(() => undefined);
    await cleanupTestInvite(token);
    await deleteTestWorkspace(workspaceId);
    await deleteTestUser(user.id);
  }
});

test("Check Email resend releases after a failed request", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.clock.install();
  await page.goto(
    "/signup/check-email?email=nikhil%40studio.co&next=%2Fonboarding"
  );
  await expect(
    page.getByRole("button", { name: "Resend in 60s", exact: true })
  ).toBeVisible();
  await page.clock.runFor(60_000);

  const failedResend = await holdAndFailNextAction(
    page,
    "**/signup/check-email**"
  );
  const resendButton = page.getByRole("button", {
    name: "Resend confirmation email",
    exact: true,
  });
  await resendButton.evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
  await failedResend.seen;

  await expect(
    page.getByRole("button", { name: "Sending…", exact: true })
  ).toBeDisabled();
  expect(failedResend.count()).toBe(1);

  failedResend.release();
  await expect(
    page.getByText("Check your connection and try again.", { exact: true })
  ).toBeVisible();
  await expect(resendButton).toBeEnabled();
  await expect(page.getByText("nikhil@studio.co", { exact: true })).toBeVisible();
  await page.unroute("**/signup/check-email**");
});

test("Onboarding preserves workspace and invite details after failed actions", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const user = await createTestUser("onboarding-recovery");

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await loginAs(page, user.email, user.password);
    await page.waitForURL("**/onboarding", { timeout: 20_000 });

    await page
      .getByLabel("Your name", { exact: true })
      .fill("Onboarding Recovery");
    await page.getByRole("radio", { name: /^Designer/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    const workspaceName = "Details Stay Put";
    const workspaceInput = page.getByLabel("Workspace name", { exact: true });
    const workspaceForm = page.locator("form").filter({
      has: workspaceInput,
    });
    await workspaceInput.fill(workspaceName);

    const failedWorkspace = await holdAndFailNextAction(
      page,
      "**/onboarding**"
    );
    await submitTwice(workspaceForm);
    await failedWorkspace.seen;

    await expect(
      page.getByRole("button", {
        name: "Creating workspace…",
        exact: true,
      })
    ).toBeDisabled();
    await expect(workspaceInput).toHaveValue(workspaceName);
    expect(failedWorkspace.count()).toBe(1);

    failedWorkspace.release();
    await expect(
      page.getByText("Your details are still here", { exact: false })
    ).toBeVisible();
    await expect(workspaceInput).toBeEnabled();
    await expect(workspaceInput).toHaveValue(workspaceName);
    await page.unroute("**/onboarding**");

    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bring one teammate" })
    ).toBeVisible({ timeout: 20_000 });

    const inviteEmail = "teammate-retry@example.com";
    const inviteInput = page.getByLabel("Work email", { exact: true });
    const inviteForm = page.locator("form").filter({ has: inviteInput });
    await inviteInput.fill(inviteEmail);

    const failedInvite = await holdAndFailNextAction(
      page,
      "**/onboarding**"
    );
    await submitTwice(inviteForm);
    await failedInvite.seen;

    await expect(
      page.getByRole("button", { name: "Sending invite…", exact: true })
    ).toBeDisabled();
    await expect(inviteInput).toHaveValue(inviteEmail);
    expect(failedInvite.count()).toBe(1);

    failedInvite.release();
    await expect(
      page.getByText("Your details are still here", { exact: false })
    ).toBeVisible();
    await expect(inviteInput).toBeEnabled();
    await expect(inviteInput).toHaveValue(inviteEmail);

    await page.unroute("**/onboarding**");
    const heldNavigation = await holdNextRequestsNavigation(page);
    await page
      .getByRole("button", { name: "Skip for now", exact: true })
      .click();
    await heldNavigation.seen;
    await expect(
      page.getByRole("button", { name: "Opening Requests…", exact: true })
    ).toBeDisabled();
    heldNavigation.release();
    await expect(
      page.getByRole("heading", { name: "Requests", exact: true })
    ).toBeVisible({ timeout: 20_000 });
    await page.unroute("**/*");
  } finally {
    await page.unroute("**/onboarding**").catch(() => undefined);
    await page.unroute("**/*").catch(() => undefined);
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
