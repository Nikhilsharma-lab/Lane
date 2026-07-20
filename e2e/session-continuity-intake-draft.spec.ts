import { expect, test, type Page } from "@playwright/test";

import {
  cleanupTestWorkspace,
  getTestWorkspaceId,
} from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import {
  intakeDraftScope,
  intakeDraftStorageKey,
  type IntakeDraft,
} from "../src/lib/intake-draft";
import { createTriageToken } from "../src/lib/triage-token";

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

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function onboard(page: Page, email: string, password: string) {
  await page.goto("/login");
  await signIn(page, email, password);
  await page.waitForURL("**/onboarding", { timeout: 20_000 });

  await page
    .getByLabel("Your name", { exact: true })
    .fill("Intake Recovery Test");
  await page.getByRole("radio", { name: /^Designer/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Intake Recovery");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Bring one teammate" })
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(
    page.getByRole("heading", { name: "Requests", exact: true })
  ).toBeVisible({ timeout: 20_000 });
}

test("sign-in restores the exact confirmed Intake review without another framing check", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const user = await createTestUser("intake-session-recovery");

  try {
    await onboard(page, user.email, user.password);
    const orgId = await getTestWorkspaceId(user.id);
    const storageKey = intakeDraftStorageKey(
      intakeDraftScope(user.id, orgId)
    );

    for (const surface of SURFACES) {
      await page.setViewportSize(surface.viewport);
      await page.emulateMedia({ colorScheme: surface.colorScheme });

      const source = {
        title: `${surface.name}: preserve customer context`,
        description:
          "Customers lose confidence when the original need and later framing are separated.",
      };
      const triage = {
        classification: "hybrid" as const,
        reframedProblem:
          "Customers cannot understand why a Request changed after it was submitted.",
        extractedSolution:
          "Keep the original Request beside the confirmed problem framing.",
      };
      const editedProblem =
        "Customers lose trust when changes to a Request are not explained in context.";
      const token = createTriageToken(source, triage, {
        orgId,
        userId: user.id,
      });
      const draft: IntakeDraft = {
        version: 1,
        savedAt: Date.now(),
        source,
        review: { triage, token, editedProblem },
      };

      await page.goto("/intake");
      await page.evaluate(
        ({ key, value }) => {
          window.sessionStorage.setItem(key, JSON.stringify(value));
        },
        { key: storageKey, value: draft }
      );
      await page.reload();

      const reviewHeading = page.getByRole("heading", {
        name: "Separate the problem from the idea",
      });
      await expect(reviewHeading).toBeVisible();
      await expect(reviewHeading).toBeFocused();
      await expect(
        page.getByText("Your confirmed framing is back.", { exact: false })
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Problem framing" })
      ).toHaveValue(editedProblem);
      await expect(page.getByText(source.title, { exact: true })).toBeVisible();
      await expect(
        page.getByText(triage.extractedSolution, { exact: true })
      ).toBeVisible();

      const geometry = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(geometry.content, surface.name).toBeLessThanOrEqual(
        geometry.viewport
      );

      await page.context().clearCookies();
      await page.goto("/login?next=%2Fintake");
      await signIn(page, user.email, user.password);
      await page.waitForURL("**/intake", { timeout: 20_000 });

      await expect(reviewHeading).toBeVisible();
      await expect(reviewHeading).toBeFocused();
      await expect(
        page.getByRole("textbox", { name: "Problem framing" })
      ).toHaveValue(editedProblem);
      await expect(
        page.getByRole("button", { name: "Create Request", exact: true })
      ).toBeVisible();

      await page
        .getByRole("button", { name: "Create Request", exact: true })
        .click();
      await page.waitForURL("**/requests/**", { timeout: 20_000 });
      await expect(
        page.getByRole("heading", { name: editedProblem })
      ).toBeVisible();
      expect(
        await page.evaluate(
          (key) => window.sessionStorage.getItem(key),
          storageKey
        )
      ).toBeNull();
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
