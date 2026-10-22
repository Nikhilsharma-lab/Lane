import { expect, test } from '@playwright/test';
import { createReviewTeam, createRequestThroughIntake } from './helpers/reviewers';
import { assertOwnedOrganization } from './helpers/fixtures';
import { answerIsItLive, journey, journeyStep, recordReleaseInPrompt } from './helpers/journey';

// Hosted acceptance gate: requires verified backup and staging migrations 0028–0033 (#127 adds 0031–0033).
// These fixtures are retained with receipts by createReviewTeam, never silently erased.
// #127: the release is recorded from "Is it live?" right after Mark Done, with a 3-day agreed window so the
// Measuring Request is due soon at once: the countdown, the page's due tag and the list row's due tag agree.
test('Is it live? records the release; the timeline, due tag, correction and handover survive reloads', async ({ browser, page }, testInfo) => {
  test.setTimeout(600_000);
  const team = await createReviewTeam(browser, page);
  let lastPath = '';
  try {
    for (const width of [1440, 390]) for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
      const request = await createRequestThroughIntake(team, `${width} ${colorScheme}: release acceptance`, { reviewAfterDays: 3 });
      lastPath = `/requests/${request.id}`;
      const release = journey(page);
      await expect(journeyStep(page, 'Open', 'current step')).toContainText('Requested by Review PM');
      await page.getByRole('button', { name: 'Pick up', exact: true }).click(); await page.reload();
      await expect(journeyStep(page, 'In progress', 'current step')).toContainText('Mark Done when the work is finished.');
      // Exposure cannot predate the agreement made moments ago, so this run records today and checks the live
      // countdown. Due/overdue boundaries are proven with a controlled clock in release-actions.test.ts.
      await page.getByRole('button', { name: 'Mark Done', exact: true }).click();
      await answerIsItLive(page, 'yes');
      await recordReleaseInPrompt(page, 'Staging acceptance: agreed audience exposure log');
      // A recorded release ends Undo Done: its Marked Done toast became "Release recorded", with no Undo.
      await expect(page.getByRole('region', { name: /^Messages/ }).getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
      await page.reload();
      await expect(journeyStep(page, 'Done', 'finished')).toContainText('Marked Done on ');
      const measuring = journeyStep(page, 'Measuring', 'current step');
      await expect(measuring).toContainText(`Released to `);
      await expect(measuring.getByRole('status')).toHaveText(/^Result due .+ · 3 days remaining$/);
      await expect(page.locator('[data-due="due_soon"]:visible').first()).toHaveText('Due in 3 days');
      // The list row carries the same due tag, in words, and is found under Due soon or overdue.
      await page.goto('/?status=due');
      const row = page.locator(`[role=row][data-request-id="${request.id}"]`);
      await expect(row).toHaveAttribute('aria-label', /Measuring, Due in 3 days,/);
      await expect(row.locator('[data-row-property="due"] [data-due="due_soon"]')).toHaveText('Due in 3 days');
      await page.goto(lastPath);
      await release.getByRole('button', { name: 'Correct release', exact: true }).click();
      await release.getByLabel('Release evidence', { exact: true }).fill('Staging acceptance: corrected exposure log link');
      await release.getByLabel('Correction reason').fill('Acceptance fixture: evidence pointed at the wrong log');
      await release.getByRole('checkbox', { name: 'The agreed audience received this work' }).check();
      await release.getByRole('button', { name: 'Save correction' }).click();
      await page.reload();
      await expect(release.getByText('Evidence: Staging acceptance: corrected exposure log link', { exact: true })).toBeVisible();
      await expect(release.getByText(/· 3 days remaining$/)).toBeVisible();
      expect(await page.locator('[data-detail-priority]').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach(`release-${width}-${colorScheme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
    const client = await assertOwnedOrganization(team.orgId);
    await client.organizations.updateOrganizationMembership({ organizationId: team.orgId, userId: team.users[1].id, role: 'org:admin' });
    await client.organizations.deleteOrganizationMembership({ organizationId: team.orgId, userId: team.users[0].id });
    const admin = team.pages[1]; await admin.goto(lastPath); await admin.reload();
    const panel = admin.getByRole('region', { name: 'Journey', exact: true });
    await panel.getByRole('button', { name: 'Hand over to a new Requester' }).click();
    await panel.getByRole('combobox', { name: 'New Requester' }).click();
    await admin.getByRole('option', { name: 'Review Developer' }).click();
    await panel.getByLabel('Handover reason').fill('Original owner left the acceptance workspace');
    await panel.getByRole('button', { name: 'Hand over' }).click();
    await admin.reload(); await expect(panel).toContainText('Requester: Review Developer');
    await expect(panel.getByText(/· 3 days remaining$/)).toBeVisible();
  } finally { await team.close(testInfo); }
});
