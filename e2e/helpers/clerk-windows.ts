import { expect, type Locator, type Page } from "@playwright/test";

// #257 D4: the checks on Clerk's Manage members, Manage workspace and Manage account windows, opened from
// Settings. They take an already signed-in page on Settings and switch sections in place, so the spec runs them
// on its own fixtures and a local walk on reused test users.

type Person = { name: string; email: string };
/** A part of a Clerk window and the name a failure gives it. */
type Part = { label: string; part: Locator };

const clerkDialog = (page: Page) => page.locator(".cl-modalContent[role='dialog']");
const lanePeople = (page: Page) => page.getByRole("list", { name: "People in this workspace" });

/** Switches Settings to a section from its navigation, in place. */
async function showSettingsSection(page: Page, label: string) {
  const link = page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: label, exact: true });
  await link.click();
  await expect(link).toHaveAttribute("aria-current", "page");
}

/** Opens a Clerk window from its Settings button by keyboard, as a keyboard user would. */
async function openByKeyboard(page: Page, opener: Locator) {
  await expect(opener).toBeEnabled();
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(clerkDialog(page)).toBeVisible();
}

/** Closes the window with Escape; focus lands back on the button that opened it. */
async function closeByKeyboard(page: Page, opener: Locator) {
  await page.keyboard.press("Escape");
  await expect(clerkDialog(page)).toBeHidden();
  await expect(opener).toBeFocused();
}

/** Every part is drawn in full (nothing cut off or clipped) and inside the window. */
async function expectShownInFull(dialog: Locator, parts: Part[]) {
  const frame = (await dialog.boundingBox())!;
  for (const { label, part } of parts) {
    await expect(part, label).toBeVisible();
    const box = (await part.boundingBox())!;
    expect(box.x, `${label} starts inside the window`).toBeGreaterThanOrEqual(frame.x - 0.5);
    expect(box.x + box.width, `${label} ends inside the window`).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    const clipped = await part.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    expect(clipped, `${label} is cut off`).toBe(false);
  }
}

/** No two parts overlap each other. */
async function expectNoOverlap(parts: Part[]) {
  const boxes = await Promise.all(parts.map(async ({ label, part }) => ({ label, box: (await part.boundingBox())! })));
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const apartSideways = a.box.x + a.box.width - 0.5 <= b.box.x || b.box.x + b.box.width - 0.5 <= a.box.x;
      const apartUpDown = a.box.y + a.box.height - 0.5 <= b.box.y || b.box.y + b.box.height - 0.5 <= a.box.y;
      expect(apartSideways || apartUpDown, `${a.label} overlaps ${b.label}`).toBe(true);
    }
  }
}

/** The whole window fits the browser window: no side scrolling, nothing past the edges. */
async function expectWindowFits(page: Page) {
  const dialog = clerkDialog(page);
  const frame = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(frame.x, "Clerk's window starts inside the browser window").toBeGreaterThanOrEqual(0);
  expect(frame.x + frame.width, "Clerk's window ends inside the browser window").toBeLessThanOrEqual(viewport.width + 0.5);
  const sideScroll = await dialog.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>(".cl-pageScrollBox, .cl-scrollBox")].some((box) => box.scrollWidth > box.clientWidth + 1));
  expect(sideScroll, "Clerk's window scrolls sideways").toBe(false);
  const pageSideScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(pageSideScroll, "the page scrolls sideways").toBe(false);
}

/**
 * Settings → Members → Manage members fits the browser window; with `inFull`, the member's name and email are
 * shown in full too.
 */
export async function checkManageMembers(page: Page, member: Person, { inFull }: { inFull: boolean }) {
  await showSettingsSection(page, "Members");
  const opener = page.getByRole("button", { name: "Manage members in Clerk" });
  await openByKeyboard(page, opener);
  const dialog = clerkDialog(page);
  const row = dialog.getByRole("row").filter({ hasText: member.email });
  await expect(row).toBeVisible();
  await expectWindowFits(page);
  if (inFull) {
    await expectShownInFull(dialog, [
      { label: "The member's name", part: row.getByText(member.name, { exact: true }) },
      { label: "The member's email", part: row.getByText(member.email, { exact: true }) },
    ]);
  }
  await closeByKeyboard(page, opener);
}

/**
 * Settings → Members: removing the member in Manage members and closing the window drops them from Lane's own
 * Members list.
 */
export async function removeMemberInClerk(page: Page, member: Person) {
  await showSettingsSection(page, "Members");
  await expect(lanePeople(page).getByText(member.email, { exact: true })).toBeVisible();

  const opener = page.getByRole("button", { name: "Manage members in Clerk" });
  await openByKeyboard(page, opener);
  const dialog = clerkDialog(page);
  const row = dialog.getByRole("row").filter({ hasText: member.email });
  await row.getByRole("menuitem", { name: "Open menu" }).click();
  // Clerk draws the row menu outside its window.
  await page.getByRole("menuitem", { name: "Remove member" }).click();
  await expect(row).toHaveCount(0);

  await closeByKeyboard(page, opener);
  await expect(lanePeople(page).getByText(member.email, { exact: true })).toHaveCount(0);
}

/**
 * Settings → Workspace details → Manage workspace fits the browser window; with `inFull`, its profile, Leave and
 * Delete organization are shown in full and apart. A Member's window (`asMember`) offers no Update profile or
 * Delete organization, so only its profile and Leave organization are checked.
 */
export async function checkManageWorkspace(page: Page, workspaceName: string, { inFull, asMember = false }: { inFull: boolean; asMember?: boolean }) {
  await showSettingsSection(page, "Workspace details");
  const opener = page.getByRole("button", { name: "Manage workspace", exact: true });
  await openByKeyboard(page, opener);
  const dialog = clerkDialog(page);
  await expect(dialog.getByText(workspaceName, { exact: true })).toBeVisible();
  await expectWindowFits(page);

  if (inFull) {
    // Each row is a title (a paragraph) and its content; the walk found the logo drawn over "Update profile".
    const title = (text: string) => dialog.getByRole("paragraph").filter({ hasText: new RegExp(`^${text}$`) });
    const adminOnly = (part: Part) => asMember ? [] : [part];
    const parts: Part[] = [
      { label: "The Profile title", part: title("Profile") },
      { label: "The workspace logo", part: dialog.getByRole("img", { name: `${workspaceName}'s logo` }) },
      { label: "The workspace name", part: dialog.getByText(workspaceName, { exact: true }) },
      ...adminOnly({ label: "Update profile", part: dialog.getByRole("button", { name: "Update profile" }) }),
      { label: "The Leave organization title", part: title("Leave organization") },
      { label: "The Leave organization button", part: dialog.getByRole("button", { name: "Leave organization" }) },
      ...adminOnly({ label: "The Delete organization title", part: title("Delete organization") }),
      ...adminOnly({ label: "The Delete organization button", part: dialog.getByRole("button", { name: "Delete organization" }) }),
    ];
    await expectShownInFull(dialog, parts);
    await expectNoOverlap(parts);
  }

  await closeByKeyboard(page, opener);
}

/**
 * Settings → Profile → Manage account is unchanged by D4: the window fits the browser window and, with
 * `sideNavigation`, Clerk's own side navigation stays beside the page.
 */
export async function checkManageAccount(page: Page, { sideNavigation }: { sideNavigation: boolean }) {
  await showSettingsSection(page, "Profile");
  const opener = page.getByRole("button", { name: "Manage account", exact: true });
  await openByKeyboard(page, opener);
  const dialog = clerkDialog(page);
  const title = dialog.locator(".cl-pageScrollBox").getByText("Profile details", { exact: true });
  await expect(title).toBeVisible();
  if (sideNavigation) {
    const navigation = dialog.locator(".cl-navbar");
    await expect(navigation.getByRole("button", { name: "Profile" })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Security" })).toBeVisible();
    const parts: Part[] = [
      { label: "Clerk's side navigation", part: navigation },
      { label: "The Profile details title", part: title },
    ];
    await expectShownInFull(dialog, parts);
    await expectNoOverlap(parts);
  }
  await expectWindowFits(page);
  await closeByKeyboard(page, opener);
}
