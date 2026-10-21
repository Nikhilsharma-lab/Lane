import { expect, test, type Page } from '@playwright/test';
import { createAgreementTeam, createRequestThroughIntake, prepareAgreementThroughUI, agreeThroughUI, type AgreementTeam } from './helpers/agreement';
import { assertOwnedOrganization } from './helpers/fixtures';

// Hosted acceptance gate: requires verified backup and staging migrations 0028/0029/0030.
// Fixtures are retained with receipts by createAgreementTeam, never silently erased.
// A hosted run cannot reach a real measurement deadline (exposure cannot predate today's agreement), so measured
// closure, the due-date gate and guardrail results are proven with a controlled clock in outcome-actions.test.ts
// and Requests/Outcome closure stories. This journey covers exception, correction, follow-up and transfer.
async function releasedRequest(team: AgreementTeam, page: Page, title: string) {
  const request = await createRequestThroughIntake(team, title);
  const path = `/requests/${request.id}`;
  await prepareAgreementThroughUI(team); await agreeThroughUI(team, path);
  await page.getByRole('button', { name: 'Pick up', exact: true }).click(); await page.reload();
  await page.getByRole('button', { name: 'Mark Done', exact: true }).click(); await page.reload();
  const release = page.getByRole('region', { name: 'Release and measurement', exact: true });
  await release.getByLabel('Actual exposure date (UTC)').fill(new Date().toISOString().slice(0, 10));
  await release.getByLabel('Release evidence', { exact: true }).fill('Staging acceptance: agreed audience exposure log');
  await release.getByRole('checkbox', { name: 'The agreed audience received this work' }).check();
  await release.getByRole('button', { name: 'Mark as released' }).click();
  await expect(release.getByText('14 days remaining', { exact: true })).toBeVisible();
  return path;
}
test('exception closure, correction, follow-up and transferred ownership survive reloads', async ({ browser, page }, testInfo) => {
  test.setTimeout(900_000);
  const team = await createAgreementTeam(browser, page);
  try {
    for (const width of [1440, 390]) for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
      const path = await releasedRequest(team, page, `${width} ${colorScheme}: outcome acceptance`);
      const outcome = page.getByRole('region', { name: 'Outcome', exact: true });
      await expect(outcome.getByText('Measuring · 14 days remaining', { exact: true })).toBeVisible();
      await expect(outcome.getByRole('button', { name: 'Close Request', exact: true })).toHaveCount(0);
      // Follow-up first: the original keeps its obligation and the follow-up needs fresh agreement.
      await outcome.getByRole('button', { name: 'Create follow-up Request' }).click();
      await outcome.getByLabel('What changed and why').fill('Acceptance: mobile checkout needs the same fix');
      await outcome.getByRole('button', { name: 'Create follow-up Request' }).dblclick();
      await page.waitForURL(url => !url.pathname.endsWith(path));
      await expect(page.getByRole('region', { name: 'Outcome', exact: true })).toContainText('Follow-up of');
      await expect(page.getByRole('link', { name: 'Agreement blocked' })).toBeVisible();
      await page.goto(path);
      await expect(outcome.getByText('Measuring · 14 days remaining', { exact: true })).toBeVisible();
      await expect(outcome.getByRole('link', { name: /outcome acceptance/ })).toHaveCount(1);
      // Exception closure by keyboard, early, with a reason and no invented numbers.
      await outcome.getByRole('button', { name: 'Close with exception' }).focus(); await page.keyboard.press('Enter');
      await outcome.getByRole('combobox', { name: 'Exception' }).click();
      await page.getByRole('option', { name: 'Rolled back' }).click();
      await outcome.getByLabel('Exception reason').fill('Acceptance: rolled back after payment errors');
      await outcome.getByRole('button', { name: 'Close with exception' }).click();
      await page.reload();
      await expect(outcome.getByText('Closed · Exception: Rolled back. Excluded from measured impact.')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Release and measurement', exact: true }).getByRole('button', { name: 'Correct release' })).toHaveCount(0);
      await outcome.getByRole('button', { name: 'Add correction' }).click();
      await outcome.getByRole('combobox', { name: 'What needs correcting' }).click();
      await page.getByRole('option', { name: 'Exception reason' }).click();
      await outcome.getByLabel('Correction', { exact: true }).fill('Rolled back after checkout timeouts');
      await outcome.getByLabel('Correction reason').fill('Acceptance: wrong cause recorded');
      await outcome.getByRole('button', { name: 'Save correction' }).click();
      await page.reload();
      await expect(outcome.getByText('Acceptance: rolled back after payment errors', { exact: true })).toBeVisible();
      await expect(outcome.getByText('Exception reason: Rolled back after checkout timeouts')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach(`outcome-${width}-${colorScheme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
    // Transfer: the former owner loses authority; the new owner closes.
    const path = await releasedRequest(team, page, 'Outcome transfer acceptance');
    const client = await assertOwnedOrganization(team.orgId);
    await client.organizations.updateOrganizationMembership({ organizationId: team.orgId, userId: team.users[1].id, role: 'org:admin' });
    await client.organizations.deleteOrganizationMembership({ organizationId: team.orgId, userId: team.users[0].id });
    const admin = team.pages[1]; await admin.goto(path); await admin.reload();
    await expect(admin.getByRole('region', { name: 'Outcome', exact: true }).getByRole('button', { name: 'Close with exception' })).toHaveCount(0);
    const release = admin.getByRole('region', { name: 'Release and measurement', exact: true });
    await release.getByRole('combobox', { name: 'New release and outcome owner' }).click();
    await admin.getByRole('option', { name: 'Agreement Developer' }).click();
    await release.getByLabel('Transfer reason').fill('Original owner left the acceptance workspace');
    await release.getByRole('button', { name: 'Transfer responsibility' }).click();
    const developer = team.pages[2]; await developer.goto(path);
    const outcome = developer.getByRole('region', { name: 'Outcome', exact: true });
    await outcome.getByRole('button', { name: 'Close with exception' }).click();
    await outcome.getByRole('combobox', { name: 'Exception' }).click();
    await developer.getByRole('option', { name: 'Measurement unavailable' }).click();
    await outcome.getByLabel('Exception reason').fill('Acceptance: analytics unavailable after transfer');
    await outcome.getByRole('button', { name: 'Close with exception' }).click();
    await developer.reload(); await expect(outcome).toContainText('Closed · Exception: Measurement unavailable');
  } finally { await team.close(testInfo); }
});
