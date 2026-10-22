import { expect, test, type Page } from '@playwright/test';
import { createReviewTeam, createRequestThroughIntake, type ReviewTeam } from './helpers/reviewers';
import { assertOwnedOrganization } from './helpers/fixtures';
import { answerIsItLive, journey, journeyStep } from './helpers/journey';

// Hosted acceptance gate: requires verified backup and staging migrations 0028–0034 (#127 adds 0034).
// Fixtures are retained with receipts by createReviewTeam, never silently erased.
// A hosted run cannot reach a real measurement deadline (exposure cannot predate today's agreement), so measured
// closure, the due-date gate and guardrail results are proven with a controlled clock in outcome-actions.test.ts
// (Storybook was removed). This journey covers exception, correction, follow-up and transfer.
async function releasedRequest(team: ReviewTeam, page: Page, title: string) {
  const request = await createRequestThroughIntake(team, title, { windowDays: 14 });
  const path = `/requests/${request.id}`;
  await page.goto(path);
  await page.getByRole('button', { name: 'Pick up', exact: true }).click();
  // Wait for the saved pickup before reloading, or the reload can cancel it.
  await expect(page.getByRole('button', { name: 'Mark Done', exact: true })).toBeVisible({ timeout: 20_000 }); await page.reload();
  await page.getByRole('button', { name: 'Mark Done', exact: true }).click();
  // "Is it live?" → Not yet: the Request stays Done, its Undo comes back, and the timeline's Done step
  // offers the release instead.
  await answerIsItLive(page, 'not yet');
  await expect(page.getByRole('region', { name: /^Messages/ }).getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.reload();
  const release = journey(page);
  const done = journeyStep(page, 'Done', 'current step');
  await expect(done).toContainText('Anyone working on this Request can record it.');
  await expect(journeyStep(page, 'Measuring', 'not reached yet')).toBeVisible();
  await done.getByRole('button', { name: 'Record release', exact: true }).click();
  await release.getByLabel('Actual exposure date (UTC)').fill(new Date().toISOString().slice(0, 10));
  await release.getByLabel('Release evidence', { exact: true }).fill('Staging acceptance: agreed audience exposure log');
  await release.getByRole('checkbox', { name: 'The agreed audience received this work' }).check();
  await release.getByRole('button', { name: 'Mark as released' }).click();
  await expect(release.getByText(/· Due in 14 days$/)).toBeVisible();
  return path;
}
test('Is it live? Not yet keeps Undo; exception closure, correction, follow-up and handover survive reloads', async ({ browser, page }, testInfo) => {
  test.setTimeout(900_000);
  const team = await createReviewTeam(browser, page);
  try {
    for (const width of [1440, 390]) for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
      const path = await releasedRequest(team, page, `${width} ${colorScheme}: outcome acceptance`);
      const outcome = page.getByRole('region', { name: 'Journey', exact: true });
      await expect(outcome.getByText(/· Due in 14 days$/)).toBeVisible();
      await expect(outcome.getByRole('button', { name: 'Close Request', exact: true })).toBeDisabled();
      await expect(outcome.getByText(/^Opens on /)).toBeVisible();
      // Follow-up first: the original keeps its obligation and the follow-up is reviewed afresh.
      await outcome.getByRole('button', { name: 'Create follow-up Request' }).click();
      await outcome.getByLabel('What changed and why').fill('Acceptance: mobile checkout needs the same fix');
      await outcome.getByRole('button', { name: 'Create follow-up Request' }).dblclick();
      await page.waitForURL(url => !url.pathname.endsWith(path));
      await expect(page.getByRole('region', { name: 'Journey', exact: true })).toContainText('Follow-up of');
      await expect(page.getByRole('button', { name: 'Pick up', exact: true })).toBeVisible();
      await page.goto(path);
      await expect(outcome.getByText(/· Due in 14 days$/)).toBeVisible();
      await expect(outcome.getByRole('link', { name: /outcome acceptance/ })).toHaveCount(1);
      // Closing without a result by keyboard, early, with a reason and no invented numbers.
      await outcome.getByRole('button', { name: 'Close without a result…' }).focus(); await page.keyboard.press('Enter');
      await outcome.getByRole('combobox', { name: 'Why' }).click();
      await page.getByRole('option', { name: 'Rolled back' }).click();
      await outcome.getByLabel('Details (optional)').fill('Acceptance: rolled back after payment errors');
      await outcome.getByRole('button', { name: 'Close without a result', exact: true }).click();
      // Wait for the saved closure before reloading; reloading earlier can cancel the save.
      await expect(outcome.getByText('Closed without a result at Measuring: Rolled back.')).toBeVisible({ timeout: 20_000 });
      await page.reload();
      await expect(outcome.getByText('Closed without a result at Measuring: Rolled back.')).toBeVisible();
      await expect(journeyStep(page, 'Closed without a result', 'current step')).toContainText('Closed Requests never reopen.');
      await expect(journeyStep(page, 'Measuring', 'finished')).toContainText('Released to ');
      await expect(outcome.getByRole('button', { name: 'Correct release' })).toHaveCount(0);
      await outcome.getByRole('button', { name: 'Add correction' }).click();
      await outcome.getByRole('combobox', { name: 'What needs correcting' }).click();
      await page.getByRole('option', { name: 'Reason', exact: true }).click();
      await outcome.getByLabel('Correction', { exact: true }).fill('Rolled back after checkout timeouts');
      await outcome.getByLabel('Correction reason').fill('Acceptance: wrong cause recorded');
      await outcome.getByRole('button', { name: 'Save correction' }).click();
      await expect(outcome.getByText('Reason: Rolled back after checkout timeouts')).toBeVisible({ timeout: 20_000 });
      await page.reload();
      await expect(outcome.getByText('Acceptance: rolled back after payment errors', { exact: true })).toBeVisible();
      await expect(outcome.getByText('Reason: Rolled back after checkout timeouts')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach(`outcome-${width}-${colorScheme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
    // Transfer: the former owner loses authority; the new owner closes.
    const path = await releasedRequest(team, page, 'Outcome transfer acceptance');
    const client = await assertOwnedOrganization(team.orgId);
    await client.organizations.updateOrganizationMembership({ organizationId: team.orgId, userId: team.users[1].id, role: 'org:admin' });
    await client.organizations.deleteOrganizationMembership({ organizationId: team.orgId, userId: team.users[0].id });
    const admin = team.pages[1]; await admin.goto(path); await admin.reload();
    await expect(admin.getByRole('region', { name: 'Journey', exact: true }).getByRole('button', { name: 'Close without a result…' })).toHaveCount(0);
    const release = admin.getByRole('region', { name: 'Journey', exact: true });
    await release.getByRole('button', { name: 'Hand over to a new Requester' }).click();
    await release.getByRole('combobox', { name: 'New Requester' }).click();
    await admin.getByRole('option', { name: 'Review Developer' }).click();
    await release.getByLabel('Handover reason').fill('Original owner left the acceptance workspace');
    await release.getByRole('button', { name: 'Hand over' }).click();
    const developer = team.pages[2]; await developer.goto(path);
    const outcome = developer.getByRole('region', { name: 'Journey', exact: true });
    await outcome.getByRole('button', { name: 'Close without a result…' }).click();
    await outcome.getByRole('combobox', { name: 'Why' }).click();
    await developer.getByRole('option', { name: 'Can’t be measured' }).click();
    await outcome.getByLabel('Details (optional)').fill('Acceptance: analytics unavailable after transfer');
    await outcome.getByRole('button', { name: 'Close without a result', exact: true }).click();
    await expect(outcome).toContainText('Closed without a result at Measuring: Can’t be measured.', { timeout: 20_000 });
    await developer.reload(); await expect(outcome).toContainText('Closed without a result at Measuring: Can’t be measured.');
  } finally { await team.close(testInfo); }
});
