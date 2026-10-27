import { expect, type Locator, type Page } from "@playwright/test";

// #257 D4: the checks on Clerk's Manage members and Manage workspace windows, opened from Settings. They take an
// already signed-in Admin page, so the spec runs them on its own fixtures and a local walk on reused test users.

type Person = { name: string; email: string };

const clerkWindow = (page: Page) => page.locator(".cl-modalContent[role='dialog']");
const lanePeople = (page: Page) => page.getByRole("list", { name: "People in this workspace" });

/** Opens a Clerk window from its Settings button by keyboard, as a keyboard user would. */
async function openByKeyboard(page: Page, opener: Locator) {
  await expect(opener).toBeEnabled();
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(clerkWindow(page)).toBeVisible();
}

/** Closes the window with Escape; focus lands back on the button that opened it. */
async function closeByKeyboard(page: Page, opener: Locator) {
  await page.keyboard.press("Escape");
  await expect(clerkWindow(page)).toBeHidden();
  await expect(opener).toBeFocused();
}

/** Every element is drawn in full (nothing cut off or clipped) and inside the window. */
async function expectShownInFull(window: Locator, parts: Locator[]) {
  const frame = (await window.boundingBox())!;
  for (const part of parts) {
    await expect(part).toBeVisible();
    const box = (await part.boundingBox())!;
    expect(box.x, await part.innerText()).toBeGreaterThanOrEqual(frame.x - 0.5);
    expect(box.x + box.width, await part.innerText()).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    const clipped = await part.evaluate(element => element.scrollWidth > element.clientWidth + 1);
    expect(clipped, `${await part.innerText()} is cut off`).toBe(false);
  }
}

/** No two parts overlap each other. */
async function expectNoOverlap(parts: Locator[]) {
  const boxes = await Promise.all(parts.map(async part => ({ label: (await part.innerText()) || (await part.getAttribute("alt")) || "logo", box: (await part.boundingBox())! })));
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
    const overlap = a.box.x < b.box.x + b.box.width - 0.5 && b.box.x < a.box.x + a.box.width - 0.5
      && a.box.y < b.box.y + b.box.height - 0.5 && b.box.y < a.box.y + a.box.height - 0.5;
    expect(overlap, `${a.label} overlaps ${b.label}`).toBe(false);
  }
}

/** The whole window fits the browser window: no side scrolling, nothing past the edges. */
async function expectWindowFits(page: Page) {
  const frame = (await clerkWindow(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(frame.x).toBeGreaterThanOrEqual(0);
  expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.width + 0.5);
  const sideScroll = await clerkWindow(page).evaluate(window => [...window.querySelectorAll<HTMLElement>(".cl-pageScrollBox, .cl-scrollBox")]
    .some(box => box.scrollWidth > box.clientWidth + 1));
  expect(sideScroll, "Clerk's window scrolls sideways").toBe(false);
}

/**
 * Settings → Members: Manage members shows the member's name and email in full; removing them in Clerk and closing
 * the window drops them from Lane's own Members list.
 */
export async function removeMemberInClerk(page: Page, member: Person) {
  await page.goto("/settings/members");
  await expect(lanePeople(page).getByText(member.email, { exact: true })).toBeVisible();

  const opener = page.getByRole("button", { name: "Manage members in Clerk" });
  await openByKeyboard(page, opener);
  const window = clerkWindow(page);
  const row = window.getByRole("row").filter({ hasText: member.email });
  await expect(row).toBeVisible();
  await expectWindowFits(page);
  await expectShownInFull(window, [row.getByText(member.name, { exact: true }), row.getByText(member.email, { exact: true })]);

  await row.getByRole("menuitem", { name: "Open menu" }).click();
  // Clerk draws the row menu outside its window.
  await page.getByRole("menuitem", { name: "Remove member" }).click();
  await expect(window.getByRole("row").filter({ hasText: member.email })).toHaveCount(0);

  await closeByKeyboard(page, opener);
  await expect(lanePeople(page).getByText(member.email, { exact: true })).toHaveCount(0);
}

/** Settings → Workspace details: Manage workspace shows its profile, Leave and Delete organization in full, apart. */
export async function checkManageWorkspace(page: Page, workspaceName: string) {
  await page.goto("/settings/members");
  await page.getByRole("button", { name: "Workspace details" }).or(page.getByRole("link", { name: "Workspace details" })).first().click();
  const opener = page.getByRole("button", { name: "Manage workspace", exact: true });
  await openByKeyboard(page, opener);
  const window = clerkWindow(page);
  await expect(window.getByText(workspaceName, { exact: true })).toBeVisible();
  await expectWindowFits(page);

  // Each row is a title (a paragraph) and its content; the walk found the logo drawn over "Update profile".
  const title = (text: string) => window.getByRole("paragraph").filter({ hasText: new RegExp(`^${text}$`) });
  const parts = [
    title("Profile"),
    window.getByRole("img", { name: `${workspaceName}'s logo` }),
    window.getByText(workspaceName, { exact: true }),
    window.getByRole("button", { name: "Update profile" }),
    title("Leave organization"),
    window.getByRole("button", { name: "Leave organization" }),
    title("Delete organization"),
    window.getByRole("button", { name: "Delete organization" }),
  ];
  await expectShownInFull(window, parts);
  await expectNoOverlap(parts);

  await closeByKeyboard(page, opener);
}
