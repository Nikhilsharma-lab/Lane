import { expect, test } from '@playwright/test';
import { createReviewTeam, createRequestThroughIntake } from './helpers/reviewers';
import { assertOwnedOrganization } from './helpers/fixtures';
import { answerIsItLive, journey, journeyStep, recordReleaseInPrompt } from './helpers/journey';
import { dispatchWindowReturn, expectOpenFormSurvivesReturn, holdNextJourneyRead, observeJourneyReads, saveReleaseCorrection } from './helpers/journey-refresh';

// Hosted acceptance gate: requires verified backup and staging migrations 0028–0034 (#127 adds 0034).
// These fixtures are retained with receipts by createReviewTeam, never silently erased.
// #127: the release is recorded from "Is it live?" right after Mark Done, with the shortest agreed window (7 days;
// new Requests take a measurement plan, which offers 7/14/30/90). Recorded today, the result is due in 7 days: outside
// the 3-day due-soon range, so the list row carries no due tag. Due-soon/overdue tags are proven with a controlled
// clock in request-journey.test.ts and release-actions.test.ts.
test('Is it live? records the release; the timeline, due tag, correction and handover survive reloads', async ({ browser, page }, testInfo) => {
  test.setTimeout(600_000);
  const team = await createReviewTeam(browser, page);
  let lastPath = '';
  try {
    for (const width of [1440, 390]) for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
      const request = await createRequestThroughIntake(team, `${width} ${colorScheme}: release acceptance`, { windowDays: 7 });
      lastPath = `/requests/${request.id}`;
      const release = journey(page);
      await expect(journeyStep(page, 'Open', 'current step')).toContainText('Requested by Review PM');
      await page.getByRole('button', { name: 'Pick up', exact: true }).click();
      // Wait for the saved pickup before reloading, or the reload can cancel it.
      await expect(page.getByRole('button', { name: 'Mark Done', exact: true })).toBeVisible({ timeout: 20_000 }); await page.reload();
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
      await expect(measuring.getByRole('status')).toHaveText(/^Result due .+ · Due in 7 days$/);
      // The countdown is in one place on the Request page: the Measuring step, not a due tag by the status.
      await expect(page.locator('[data-detail-status] [data-due]')).toHaveCount(0);
      // Seven days out is not due soon: the row reads Measuring, carries no due tag and is not under Due soon or overdue.
      await page.goto('/?status=measuring');
      const row = page.locator(`[role=row][data-request-id="${request.id}"]`);
      await expect(row).toHaveAttribute('aria-label', /Measuring,/);
      await expect(row.locator('[data-due]')).toHaveCount(0);
      await page.goto('/?status=due');
      await expect(page.locator(`[role=row][data-request-id="${request.id}"]`)).toHaveCount(0);
      const reads = await observeJourneyReads(page, request.id, team.orgId);
      await reads.focusRefresh();
      await release.getByRole('button', { name: 'Correct release', exact: true }).click();
      await release.getByLabel('Release evidence', { exact: true }).fill('Staging acceptance: corrected exposure log link');
      await release.getByLabel('Correction reason').fill('Acceptance fixture: evidence pointed at the wrong log');
      await expectOpenFormSurvivesReturn(page, reads, release.getByLabel('Release evidence', { exact: true }), 'Staging acceptance: corrected exposure log link');
      await expect(release.getByLabel('Correction reason')).toHaveValue('Acceptance fixture: evidence pointed at the wrong log');
      await release.getByRole('checkbox', { name: 'The agreed audience received this work' }).check();
      await release.getByRole('button', { name: 'Save correction' }).press('Enter');
      // Wait for the saved correction before reloading; reloading earlier can cancel the save.
      await expect(release.getByText('Evidence: Staging acceptance: corrected exposure log link', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(release.getByLabel('Release evidence', { exact: true })).toHaveCount(0);
      await expect(release.getByRole('heading', { name: 'Journey', exact: true })).toBeFocused();
      reads.stop();
      await page.reload();
      await expect(release.getByText('Evidence: Staging acceptance: corrected exposure log link', { exact: true })).toBeVisible();
      await expect(release.getByText(/· Due in 7 days$/)).toBeVisible();
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
    await expect(panel).toContainText('Requester: Review Developer', { timeout: 20_000 });
    await admin.reload(); await expect(panel).toContainText('Requester: Review Developer');
    await expect(panel.getByText(/· Due in 7 days$/)).toBeVisible();
  } finally { await team.close(testInfo); }
});

test('Journey rejects a read begun before editing and refreshes at its scheduled UTC midnight', async ({ browser, page }, testInfo) => {
  test.setTimeout(360_000);
  const team = await createReviewTeam(browser, page);
  const writer = await page.context().newPage();
  try {
    const request = await createRequestThroughIntake(team, 'Journey refresh ordering acceptance', { windowDays: 7 });
    await page.getByRole('button', { name: 'Pick up', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark Done', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Mark Done', exact: true }).click();
    await answerIsItLive(page, 'yes');
    await recordReleaseInPrompt(page, 'Acceptance: original exposure evidence');
    let reads = await observeJourneyReads(page, request.id, team.orgId);
    const panel = journey(page);
    const evidence = panel.getByLabel('Release evidence', { exact: true });
    await reads.focusRefresh();
    await panel.getByRole('button', { name: 'Correct release', exact: true }).click();
    // Keep this tab editing while another tab commits a distinguishable real fact.
    await dispatchWindowReturn(page);
    await writer.goto(`/requests/${request.id}`);
    await saveReleaseCorrection(writer, 'Acceptance: evidence saved in the other tab');
    const held = await holdNextJourneyRead(page, reads);
    try {
      // Cancelling flushes the deferred window-return read. Its response is
      // already from the server before the next form opens, but not delivered.
      await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(await held.received()).toContain('Acceptance: evidence saved in the other tab');
      await panel.getByRole('button', { name: 'Correct release', exact: true }).click();
      await evidence.fill('Acceptance: still editing this draft');
      await evidence.focus();
      await held.deliver();
      await expect(evidence).toHaveValue('Acceptance: still editing this draft');
      await expect(evidence).toBeFocused();
      await expect(panel.getByText('Evidence: Acceptance: original exposure evidence', { exact: true })).toBeVisible();
      await expect(panel.getByText('Evidence: Acceptance: evidence saved in the other tab', { exact: true })).toHaveCount(0);
      await expect(panel.getByRole('alert')).toHaveCount(0);
      await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(panel.getByText('Evidence: Acceptance: evidence saved in the other tab', { exact: true })).toBeVisible();
    } finally { await held.stop(); }
    reads.stop();
    await writer.close();

    // Control elapsed browser timers, while Date stays at the real current time
    // for Clerk. This tests the scheduled callback, not a changed server day.
    // The server-clock tests own Due-in-7 -> Due-in-6 and the Close date gate.
    const fixedTime = Date.now();
    await page.clock.install({ time: fixedTime });
    await page.clock.setFixedTime(fixedTime);
    reads = await observeJourneyReads(page, request.id, team.orgId);
    await panel.getByRole('button', { name: 'Correct release', exact: true }).click();
    const serverDay = await panel.getByLabel('Release date', { exact: true }).getAttribute('max');
    expect(serverDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    const untilMidnight = Date.parse(`${serverDay}T00:00:00Z`) + 86_400_000 - fixedTime;
    expect(untilMidnight).toBeGreaterThan(0);
    const midnight = await holdNextJourneyRead(page, reads);
    try {
      const before = reads.count();
      await page.clock.fastForward(untilMidnight + 1000);
      const body = await midnight.received();
      expect(body).toContain(`"today":"${serverDay}"`);
      expect(reads.count()).toBe(before + 1);
      await page.clock.setSystemTime(Date.now());
      await midnight.deliver();
      await expect(journeyStep(page, 'Measuring', 'current step').getByRole('status')).toHaveText(/^Result due .+ · Due in 7 days$/);
      await expect(panel.getByRole('button', { name: 'Close Request', exact: true })).toBeDisabled();
      await expect(panel.getByRole('alert')).toHaveCount(0);
      await page.clock.fastForward(5000);
      await page.waitForTimeout(300);
      expect(reads.count()).toBe(before + 1); // The same server day must not start polling.
    } finally { await midnight.stop(); }
    reads.stop();

    // Reload installs the next one-shot date watcher; an open form defers it.
    const editingTime = Date.now();
    await page.clock.setFixedTime(editingTime);
    reads = await observeJourneyReads(page, request.id, team.orgId);
    await panel.getByRole('button', { name: 'Correct release', exact: true }).click();
    const editingDay = await panel.getByLabel('Release date', { exact: true }).getAttribute('max');
    expect(editingDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await evidence.fill('Acceptance: preserve this draft across the date timer');
    await evidence.focus();
    const before = reads.count();
    await page.clock.fastForward(Date.parse(`${editingDay}T00:00:00Z`) + 86_400_000 - editingTime + 1000);
    await page.waitForTimeout(300);
    expect(reads.count()).toBe(before);
    await expect(evidence).toHaveValue('Acceptance: preserve this draft across the date timer');
    await expect(evidence).toBeFocused();
    await page.clock.setSystemTime(Date.now());
    const afterCancel = page.waitForResponse(response => reads.matches(response.request()));
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await (await afterCancel).finished()).toBeNull();
    await expect(panel.getByText('Evidence: Acceptance: evidence saved in the other tab', { exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    expect(reads.count()).toBe(before + 1);
    reads.stop();
  } finally {
    await writer.close();
    await team.close(testInfo);
  }
});
