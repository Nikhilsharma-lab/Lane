import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * Follow-up to Build 5 of #256 (decision 4b, 2026-11-12): beside the preview (1440, 1280) or the summary (1024) the
 * list narrows, and the Guest "Waiting to be taken on" badge ends in "…" inside its own column. It never reaches into
 * the avatar or the date; its full words stay on hover and in the row's name.
 */

const ROW = '[data-request-grid] [role="row"][data-request-id]';
const WAITING = "Waiting to be taken on";

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

async function seed(orgId: string, userId: string) {
  const sql = e2eDatabase();
  try {
    const insert = async (title: string, values: Record<string, unknown>) => (await sql`
      INSERT INTO requests ${sql({ org_id: orgId, title, description: "Seeded for the narrow list check.", created_by: userId, ...values })} RETURNING id`)[0].id as string;
    const previewed = await insert("Checkout button sits under the keyboard on narrow phone screens", { assigned_to: userId });
    const waiting = await insert("Guest asks for invoices in PDF for the finance team", { guest_submission: true });
    return { previewed, waiting };
  } finally { await sql.end(); }
}

/** After screenshots go to LANE_SHOTS_DIR when it is set, otherwise into the test's output folder. */
async function shot(page: Page, info: TestInfo, name: string) {
  const dir = process.env.LANE_SHOTS_DIR;
  await page.screenshot({ path: dir ? `${dir}/${name}.png` : info.outputPath(`${name}.png`), animations: "disabled" });
}

/** A panel that slides in has landed: its transform is back to none. */
async function settled(panel: Locator) {
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate(element => getComputedStyle(element).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
}

/** The badge stays inside its own column, clear of the avatar and the date, and ends in "…" when it has to. */
async function badgeKeepsToItsColumn(waitingRow: Locator, where: string) {
  const column = waitingRow.locator('[data-row-property="waiting"]');
  const badge = column.locator("> *");
  await expect(badge).toHaveText(WAITING);
  const badgeBox = (await badge.boundingBox())!;
  const columnBox = (await column.boundingBox())!;
  expect(badgeBox.x + badgeBox.width, `the badge stays inside its column ${where}`).toBeLessThanOrEqual(columnBox.x + columnBox.width + 0.5);
  const date = waitingRow.locator('[data-row-property="createdAt"] > *');
  await expect(date, `the date shows ${where}`).toBeVisible();
  const neighbours = [date, waitingRow.locator('[data-row-property="pickedUpBy"] > *')];
  for (const neighbour of neighbours) {
    const box = await neighbour.boundingBox();
    if (box) expect(overlaps(badgeBox, box), `the badge overlaps ${await neighbour.evaluate(element => element.parentElement!.dataset.rowProperty)} ${where}`).toBe(false);
  }
  // Cut short, its words end in "…"; whole on hover and in the row's name.
  const cut = await badge.evaluate(element => {
    const words = [...element.querySelectorAll<HTMLElement>("*")].find(node => node.childElementCount === 0 && node.textContent === "Waiting to be taken on")!;
    return { overflow: words.scrollWidth > words.clientWidth, ellipsis: getComputedStyle(words).textOverflow };
  });
  expect(cut.ellipsis, `the badge's words end in "…" ${where}`).toBe("ellipsis");
  await expect(column).toHaveAttribute("title", WAITING);
  await expect(waitingRow).toHaveAttribute("aria-label", new RegExp(WAITING));
  return cut.overflow;
}

test("the Guest badge ends in \"…\" in its own column beside the preview and the summary", async ({ page }, info) => {
  test.setTimeout(300_000);
  let owner: TestUser | undefined;
  try {
    owner = await createTestUser("guest-badge-narrow");
    await page.setViewportSize({ width: 1440, height: 900 });
    const orgId = await provisionAndSignIn(page, owner, { name: "Badge Owner", workspaceName: "Guest badge narrow list" });
    const { previewed, waiting } = await seed(orgId, owner.id);
    await page.goto("/");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(ROW)).toHaveCount(2);
    const waitingRow = page.locator(`${ROW}[data-request-id="${waiting}"]`);
    const preview = page.getByRole("region", { name: "Request preview" });
    const summary = page.getByRole("region", { name: "List summary" });

    // With room, the badge shows its words whole.
    expect(await badgeKeepsToItsColumn(waitingRow, "at 1440 without a panel"), "the badge is whole with room").toBe(false);

    await page.locator(`${ROW}[data-request-id="${previewed}"] [data-request-code]`).click();
    await settled(preview);
    await expect(preview.getByRole("heading", { level: 2 })).toBeVisible({ timeout: 15_000 });
    await badgeKeepsToItsColumn(waitingRow, "beside the preview at 1440");
    await shot(page, info, "guest-badge-preview-1440");

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(preview).toBeVisible();
    await badgeKeepsToItsColumn(waitingRow, "beside the preview at 1280");
    await shot(page, info, "guest-badge-preview-1280");

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator("[data-request-peek]")).toHaveCount(0);
    await page.getByRole("button", { name: "Open list summary" }).click();
    await settled(summary);
    await badgeKeepsToItsColumn(waitingRow, "beside the summary at 1024");
    await shot(page, info, "guest-badge-summary-1024");
  } finally {
    if (owner) { await cleanupTestWorkspace(owner.id); await deleteTestUser(owner.id); }
  }
});
