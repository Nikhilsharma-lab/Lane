import { expect, test } from '@playwright/test';
import { createReviewTeam, createRequestThroughIntake } from './helpers/reviewers';
import { assertOwnedOrganization } from './helpers/fixtures';

// Hosted acceptance gate: requires verified backup and staging migrations 0028/0029.
// These fixtures are retained with receipts by createReviewTeam, never silently erased.
test('release, correction, countdown and explicit owner transfer survive reloads', async ({ browser, page }, testInfo) => {
  test.setTimeout(600_000);
  const team = await createReviewTeam(browser, page);
  const today = () => new Date().toISOString().slice(0, 10);
  let lastPath = '';
  try {
    for (const width of [1440, 390]) for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
      const request = await createRequestThroughIntake(team, `${width} ${colorScheme}: release acceptance`);
      lastPath = `/requests/${request.id}`;
      await page.getByRole('button', { name: 'Pick up', exact: true }).click(); await page.reload();
      await page.getByRole('button', { name: 'Mark Done', exact: true }).click(); await page.reload();
      const release = page.getByRole('region', { name: 'Journey', exact: true });
      await release.getByRole('button', { name: 'Record release', exact: true }).click();
      // Exposure cannot predate the agreement made moments ago, so this run records today and checks the live
      // countdown. Due/overdue boundaries are proven with a controlled clock in release-actions.test.ts.
      await release.getByLabel('Actual exposure date (UTC)').fill(today());
      await release.getByLabel('Release evidence', { exact: true }).fill('Staging acceptance: agreed audience exposure log');
      await release.getByRole('checkbox', { name: 'The agreed audience received this work' }).check();
      await release.getByRole('button', { name: 'Mark as released' }).focus(); await page.keyboard.press('Enter');
      await expect(release.getByText(/· 14 days remaining$/)).toBeVisible();
      await page.reload(); await expect(release.getByText(/· 14 days remaining$/)).toBeVisible();
      await release.getByRole('button', { name: 'Correct release', exact: true }).click();
      await release.getByLabel('Release evidence', { exact: true }).fill('Staging acceptance: corrected exposure log link');
      await release.getByLabel('Correction reason').fill('Acceptance fixture: evidence pointed at the wrong log');
      await release.getByRole('checkbox', { name: 'The agreed audience received this work' }).check();
      await release.getByRole('button', { name: 'Save correction' }).click();
      await page.reload();
      await expect(release.getByText('Evidence: Staging acceptance: corrected exposure log link', { exact: true })).toBeVisible();
      await expect(release.getByText(/· 14 days remaining$/)).toBeVisible();
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
    await expect(panel.getByText(/· 14 days remaining$/)).toBeVisible();
  } finally { await team.close(testInfo); }
});
