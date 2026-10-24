import { expect, type Page } from "@playwright/test";

export const commandPalette = (page: Page) => page.getByRole("dialog", { name: "Command palette", exact: true });
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const paletteOption = (page: Page, name: string, detail?: string) => commandPalette(page).getByRole("option", {
  name: new RegExp(`^${escape(name)}${detail ? `\\s*${escape(detail)}` : ""}$`),
});

/** Operate the real combobox with keys; never call a palette action directly. */
export async function runPaletteCommand(page: Page, name: string, detail?: string, key = "Meta+k") {
  await page.locator("#lane-main").focus();
  await page.keyboard.press(key);
  const field = commandPalette(page).getByRole("combobox", { name: "Find an action or place" });
  await expect(field).toBeFocused();
  await field.fill(name);
  const target = paletteOption(page, name, detail);
  await expect(target).toHaveCount(1);
  const options = commandPalette(page).getByRole("option");
  const targetId = await target.getAttribute("id");
  expect(targetId).toBeTruthy();
  const count = await options.count();
  for (let index = 0; index < count; index++) {
    if (await options.nth(index).getAttribute("id") === targetId) break;
    await field.press("ArrowDown");
  }
  await expect(target).toHaveAttribute("aria-selected", "true");
  await expect(field).toHaveAttribute("aria-activedescendant", targetId!);
  await field.press("Enter");
  await expect(commandPalette(page)).toBeHidden();
}
