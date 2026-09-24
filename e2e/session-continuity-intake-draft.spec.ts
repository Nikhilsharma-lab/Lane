import { expect, test } from "@playwright/test";

import {
  cleanupTestWorkspace,
  getTestWorkspaceId,
} from "./helpers/cleanup";
import {
  createTestUser,
  deleteTestUser,
} from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";
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

test("the session-expiry link signs back in to the exact Intake review without another framing check", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const user = await createTestUser("intake-session-recovery");

  try {
    const orgId = await provisionAndSignIn(page, user, {
      name: "Intake Recovery Test",
      workspaceName: "Intake Recovery",
    });
    expect(await getTestWorkspaceId(user.id)).toBe(orgId);
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
        affectedPeople: "Customers reviewing reframed Requests",
        desiredChange: "Keep the original need visible.",
        observedEvidence: "Pilot users asked what had changed.",
        uncertainty: "Showing both versions may improve trust.",
        usefulLink: "",
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
        version: 2,
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
      await page
        .getByRole("button", { name: "Create Request", exact: true })
        .click();
      const signInAgain = page.getByRole("link", { name: "Sign in again" });
      await expect(signInAgain).toBeVisible();
      await signInAgain.click();
      await page.waitForURL((url) => url.pathname === "/login");

      // Reload the recovery URL to discard the expired Clerk client session,
      // while retaining the link's continuation and this tab's Intake draft.
      await page.reload();
      await page.locator('input[name="identifier"]').fill(user.email);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.locator('input[name="password"]').fill(user.password);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Enter verification code" })
        .pressSequentially("424242");

      // No helper or manual navigation may supply the missing return route.
      await expect(page).toHaveURL("/intake");

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
