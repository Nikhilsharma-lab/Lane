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
  await expect(page.getByRole("alert")).toHaveCount(0);
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

/** Operates the real Arc Select by keyboard. Its last option is Q1 of the prior year. */
export async function choosePreviousYearQuarter(page: Page) {
  const year = new Date().getUTCFullYear() - 1;
  const key = `${year}-q1`;
  const label = `Q1 ${year}`;
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

  const mine = page.getByRole("tab", { name: "My work", exact: true });
  const projects = page.getByRole("tab", { name: "By project", exact: true });
  const whole = page.getByRole("tab", { name: "Whole org", exact: true });
  await mine.focus();
  await page.keyboard.press("ArrowRight");
  await expect(projects).toBeFocused();
  await expect(projects).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "By project", exact: true })).toContainText(fixture.requests[0].title);
  await page.keyboard.press("End");
  await expect(whole).toBeFocused();
  await expect(whole).toHaveAttribute("aria-selected", "true");
  const period = await choosePreviousYearQuarter(page);
  await expect(page.getByText(`Grouped by release date. Showing ${period.label}.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Whole org impact", exact: true })).toContainText("Nothing measured this period yet");
  expect(new URL(page.url()).searchParams.get("person")).toBe(fixture.personId);
  await capture("period");
  await whole.focus();
  await page.keyboard.press("Home");
  await expect(mine).toBeFocused();
  await expect(mine).toHaveAttribute("aria-selected", "true");
  await expectRequests(chosen, fixture.requests);
  await expect(myWork(page).getByText("Nothing requested or picked up yet", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // A selected person is a permitted Request participant, never an arbitrary URL identity.
  for (const personId of [fixture.viewerId, "user_not_a_permitted_impact_person"]) {
    await page.goto(`/impact?period=${period.key}&person=${encodeURIComponent(personId)}`);
    await expectImpact(page);
    await expect(page.getByRole("heading", { name: /^Requests by / })).toHaveCount(0);
    await expect(myWork(page).getByText("Nothing requested or picked up yet", { exact: true })).toBeVisible();
  }
}
