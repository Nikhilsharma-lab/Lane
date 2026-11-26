import { expect, test } from "@playwright/test";

import {
  cleanupTestWorkspace,
  getTestWorkspaceId,
} from "./helpers/cleanup";
import {
  createTestUser,
  deleteTestUser,
  endTestSessions,
} from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";
import { formReady } from "./helpers/auth-forms";
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

test("an expired session signs back in to the exact Intake review without another framing check", async ({
  page,
}) => {
  // Four real revoked-session/password sign-ins, each followed by a saved Request.
  test.setTimeout(360_000);
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

    for (const [index, surface] of SURFACES.entries()) {
      // Better Auth allows three sign-ins in ten seconds from one address, and every local browser shares one: each
      // surface signs in from its own.
      await page.setExtraHTTPHeaders({ "x-vercel-forwarded-for": `198.18.0.${index + 1}` });
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
        projectId: null,
        requestType: null,
        // Plan item 2.3: a restored review needs a complete Expected impact.
        expectedImpact: {
          kind: "verification" as const,
          result: "Customers can see why a Request changed after they submitted it.",
          source: "Pilot walk-through with three submitters",
          reviewAfterDays: 14,
        },
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
      // The composer's form loads once the page is idle and saves the (empty) draft it starts with, which removes the
      // draft key; the review below, put in before then, was erased before the reload.
      await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 60_000 });
      await page.evaluate(
        ({ key, value }) => {
          window.sessionStorage.setItem(key, JSON.stringify(value));
        },
        { key: storageKey, value: draft }
      );
      await page.reload();
      // /intake is a launcher under the page strip (2026-10-13). Arriving with
      // a stored review opens the composer dialog by itself, restored.

      // Plan item 2.3: the composer's one review heading.
      const reviewHeading = page.getByRole("heading", {
        name: "Review Request",
        level: 2,
      });
      await expect(reviewHeading).toBeVisible();
      await expect(reviewHeading).toBeFocused();
      await expect(
        page.getByText("Your review was restored.", { exact: false })
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Problem to solve" })
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

      // Revoked as signing this device out elsewhere does: the session's row goes, and the browser keeps its cookie.
      await endTestSessions(user.id);
      await page
        .getByRole("button", { name: "Create Request", exact: true })
        .click();
      await page.getByRole("link", { name: "Sign in again" }).click();
      await page.waitForURL((url) => url.pathname === "/login");

      await formReady(page);
      // The real one-page form, with the link's return address and this tab's Intake draft.
      await page.getByLabel("Email address").fill(user.email);
      await page.getByLabel("Password", { exact: true }).fill(user.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();

      // No helper or manual navigation may supply the missing return route.
      await expect(page).toHaveURL("/intake", { timeout: 30_000 });

      await expect(reviewHeading).toBeVisible();
      await expect(reviewHeading).toBeFocused();
      await expect(
        page.getByRole("textbox", { name: "Problem to solve" })
      ).toHaveValue(editedProblem);
      await expect(
        page.getByRole("button", { name: "Create Request", exact: true })
      ).toBeVisible();

      await page
        .getByRole("button", { name: "Create Request", exact: true })
        .click();
      // Creating on /intake opens the new Request, as 2.3's page did.
      await page.waitForURL("**/requests/**", { timeout: 20_000 });
      await expect(
        page.getByRole("heading", { name: source.title, exact: true })
      ).toBeVisible();
      await expect(page.getByRole("region", { name: "Problem to solve", exact: true })).toContainText(editedProblem);
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
