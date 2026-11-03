import { expect, type Locator, type Page } from "@playwright/test";

export type ImpactRequest = { id: string; title: string; journey: string };
type Capture = (name: string) => Promise<void>;

export const impactSurfaces = [
  { width: 1440, colorScheme: "light" },
  { width: 1440, colorScheme: "dark" },
  { width: 390, colorScheme: "light" },
  { width: 390, colorScheme: "dark" },
] as const;

const myWork = (page: Page) => page.getByRole("tabpanel", { name: "My work", exact: true });

async function expectRequests(list: Locator, requests: ImpactRequest[]) {
  await expect(list.locator("a[data-request-id]")).toHaveCount(requests.length);
  for (const request of requests) {
    const row = list.locator(`a[data-request-id="${request.id}"]`);
    await expect(row).toContainText(request.title);
    await expect(row).toContainText(request.journey);
  }
}

async function expectImpact(page: Page) {
  await expect(page.getByRole("heading", { name: "Impact", exact: true })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Impact views" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "My work", exact: true })).toHaveAttribute("aria-selected", "true");
  // Next's route announcer is itself an alert; check the app failure heading.
  await expect(page.getByRole("heading", { name: "This page couldn’t load", exact: true })).toHaveCount(0);
}

export async function verifyImpactMyWork(page: Page, requests: ImpactRequest[], capture: Capture) {
  await page.goto("/impact");
  await expectImpact(page);
  await expectRequests(myWork(page), requests);
  await expect(myWork(page).getByText("Nothing requested or picked up yet", { exact: true })).toHaveCount(0);
  await capture("my-work");

  const first = requests[0];
  expect(first).toBeDefined();
  const row = myWork(page).locator(`a[data-request-id="${first.id}"]`);
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === `/requests/${first.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(first.title);
  await page.goBack();
  await expectImpact(page);
  await expectRequests(myWork(page), requests);
}

/** Operates the real Arc Select by keyboard. Its last option is the oldest of the 8 quarters it offers (period-picker.ts). */
export async function chooseOldestQuarter(page: Page) {
  const now = new Date();
  const at = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3) - 7;
  const year = Math.floor(at / 4), quarter = (at % 4) + 1;
  const key = `${year}-q${quarter}`;
  const label = `Q${quarter} ${year}`;
  await page.getByRole("combobox", { name: "Period", exact: true }).press("Enter");
  await expect(page.getByRole("listbox", { name: "Period", exact: true })).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: label, exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === "/impact" && url.searchParams.get("period") === key);
  return { key, label };
}

export async function verifyImpactEmptyAndTeammate(
  page: Page,
  fixture: { viewerId: string; personId: string; personName: string; requests: ImpactRequest[] },
  capture: Capture,
) {
  await page.goto("/impact");
  await expectImpact(page);
  await expect(myWork(page).getByText("Nothing requested or picked up yet", { exact: true })).toBeVisible();
  await expect(myWork(page).locator("a[data-request-id]")).toHaveCount(0);
  await capture("empty-my-work");

  const teammate = page.getByRole("region", { name: "Teammates", exact: true });
  await expect(teammate).toContainText("Lists show results only, never totals or rankings.");
  const person = teammate.getByRole("link", { name: fixture.personName, exact: true });
  await person.focus();
  await expect(person).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === "/impact" && url.searchParams.get("person") === fixture.personId);
  await expect(person).toHaveAttribute("aria-current", "true");
  const chosen = page.getByRole("region", { name: `Requests by ${fixture.personName}`, exact: true });
  await expect(chosen).toBeVisible();
  await expectRequests(chosen, fixture.requests);
  await expect(chosen).not.toContainText(/total|average|score|rank/i);
  await capture("selected-teammate");

  // #208: the tabs are My work and Outcome report (it replaced By project and Whole org). The report lists only work
  // Released in its period, so this team's open Request is in none.
  const mine = page.getByRole("tab", { name: "My work", exact: true });
  const report = page.getByRole("tab", { name: "Outcome report", exact: true });
  const reportPanel = page.getByRole("tabpanel", { name: "Outcome report", exact: true });
  await mine.focus();
  await page.keyboard.press("ArrowRight");
  await expect(report).toBeFocused();
  await expect(report).toHaveAttribute("aria-selected", "true");
  await expect(reportPanel.getByText(/^Nothing was Released in Q[1-4] \d{4}\.$/)).toBeVisible();
  await expect(reportPanel).not.toContainText(fixture.requests[0].title);
  const period = await chooseOldestQuarter(page);
  await expect(reportPanel.getByText(`Nothing was Released in ${period.label}.`, { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("person")).toBe(fixture.personId);
  await capture("period");
  await report.focus();
  await page.keyboard.press("Home");
  await expect(mine).toBeFocused();
  await expect(mine).toHaveAttribute("aria-selected", "true");
  await expectRequests(chosen, fixture.requests);
  await expect(myWork(page).getByText("Nothing requested or picked up yet", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // A selected person is a permitted Request participant, never an arbitrary URL identity.
  for (const personId of [fixture.viewerId, "user_not_a_permitted_impact_person"]) {
    await page.goto(`/impact?period=${period.key}&person=${encodeURIComponent(personId)}`);
    // With a period and no permitted teammate, the page opens on the Outcome report (impact/page.tsx).
    await expect(page.getByRole("tab", { name: "Outcome report", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "This page couldn’t load", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "My work", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Requests by / })).toHaveCount(0);
    await expect(myWork(page).getByText("Nothing requested or picked up yet", { exact: true })).toBeVisible();
  }
}
