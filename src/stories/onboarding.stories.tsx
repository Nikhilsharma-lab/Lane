import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"

import { RoleForm } from "@/app/(auth)/onboarding/role-form"
import { saveOnboardingRole } from "@/app/(auth)/onboarding/actions"

// Plan item 2.2: the real onboarding role step. Storybook mocks the action and
// the Next router, so nothing here saves a profile or navigates.

/** What a saved role does in the app: the action redirects to /, so the call
 * rejects with Next's redirect error while the router renders / from the
 * response. The form makes no router call of its own. */
const savedRedirect = () => Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/;303;" })

/** Waits for the latest save to settle, then for React to commit what follows. */
async function afterLatestSave() {
  const results = mocked(saveOnboardingRole).mock.results
  await (results[results.length - 1]?.value as Promise<unknown> | undefined)?.catch(() => {})
  await new Promise(resolve => setTimeout(resolve, 100))
}
const meta = {
  title: "Auth/Onboarding",
  component: RoleForm,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/onboarding" } } },
  beforeEach: () => {
    mocked(saveOnboardingRole).mockReset().mockRejectedValue(savedRedirect())
    getRouter().replace.mockClear()
    getRouter().refresh.mockClear()
    getRouter().push.mockClear()
  },
} satisfies Meta<typeof RoleForm>
export default meta
type Story = StoryObj<typeof meta>

const radio = (canvasElement: HTMLElement, name: string) => within(canvasElement).getByRole("radio", { name })
const continueButton = (canvasElement: HTMLElement) => within(canvasElement).getByRole("button", { name: /^(Continue|Saving role…)$/ })

/** Types into a temporary text field, so the keys can be shown to leave typing alone. */
async function typeInTemporaryField(canvasElement: HTMLElement, text: string) {
  const field = document.createElement("input")
  field.type = "text"
  field.setAttribute("aria-label", "Temporary text field")
  canvasElement.appendChild(field)
  try {
    field.focus()
    await userEvent.keyboard(text)
    await expect(field).toHaveValue(text)
  } finally {
    field.remove()
  }
}

export const KeyboardOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("heading", { level: 1, name: "Choose your role" })).toBeVisible()
    await expect(canvas.queryByText(/^Step \d of \d$/)).not.toBeInTheDocument()
    ;(document.activeElement as HTMLElement | null)?.blur()
    await expect(document.activeElement).toBe(document.body)

    const pm = radio(canvasElement, "PM"), designer = radio(canvasElement, "Designer"), developer = radio(canvasElement, "Developer")
    await expect([pm, designer, developer].map(input => input.getAttribute("aria-keyshortcuts"))).toEqual(["1", "2", "3"])

    // 2 picks Designer and moves focus to it, which is the announcement.
    await userEvent.keyboard("2")
    await expect(designer).toBeChecked()
    await expect(designer).toHaveFocus()

    // A held modifier, or a key typed into a field, picks nothing.
    await userEvent.keyboard("{Control>}1{/Control}")
    await expect(designer).toBeChecked()
    await expect(pm).not.toBeChecked()
    await typeInTemporaryField(canvasElement, "1")
    await expect(designer).toBeChecked()
    await expect(pm).not.toBeChecked()

    designer.focus()
    await userEvent.tab()
    const submit = continueButton(canvasElement)
    await expect(submit).toHaveFocus()
    await userEvent.keyboard("{Enter}")

    await waitFor(() => expect(saveOnboardingRole).toHaveBeenCalledTimes(1))
    await expect(saveOnboardingRole).toHaveBeenCalledWith({ role: "designer" })
    await afterLatestSave()
    // The action's response is the navigation: no second request from the form.
    await expect(getRouter().replace).not.toHaveBeenCalled()
    await expect(getRouter().push).not.toHaveBeenCalled()
    await expect(getRouter().refresh).not.toHaveBeenCalled()
    await expect(within(canvasElement).queryByRole("alert")).not.toBeInTheDocument()
    // Saved: the form stays disabled until the navigation commits, so it never re-enables in between.
    await expect(submit).toBeDisabled()
    await expect(designer).toBeDisabled()
    await userEvent.keyboard("3")
    await expect(developer).not.toBeChecked()
    await expect(saveOnboardingRole).toHaveBeenCalledTimes(1)
  },
}

export const SaveFailure: Story = {
  beforeEach: () => { mocked(saveOnboardingRole).mockReset().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValue(savedRedirect()) },
  play: async ({ canvasElement }) => {
    const designer = radio(canvasElement, "Designer")
    await userEvent.keyboard("2")
    await expect(designer).toBeChecked()
    await userEvent.click(continueButton(canvasElement))
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Your role selection is still here. Check your connection and try again.")
    await expect(designer).toBeChecked()
    await expect(getRouter().replace).not.toHaveBeenCalled()
    // The keys and the button work again for the retry.
    await waitFor(() => expect(continueButton(canvasElement)).toBeEnabled())
    ;(document.activeElement as HTMLElement | null)?.blur()
    await userEvent.keyboard("3")
    const developer = radio(canvasElement, "Developer")
    await expect(developer).toBeChecked()
    await expect(developer).toHaveFocus()
    await expect(within(canvasElement).queryByRole("alert")).not.toBeInTheDocument()
    await userEvent.click(continueButton(canvasElement))
    await waitFor(() => expect(saveOnboardingRole).toHaveBeenCalledTimes(2))
    await expect(saveOnboardingRole).toHaveBeenLastCalledWith({ role: "developer" })
    await afterLatestSave()
    await expect(within(canvasElement).queryByRole("alert")).not.toBeInTheDocument()
    await expect(continueButton(canvasElement)).toBeDisabled()
    await expect(getRouter().replace).not.toHaveBeenCalled()
  },
}

export const ServerError: Story = {
  beforeEach: () => { mocked(saveOnboardingRole).mockReset().mockResolvedValue({ error: "Create or join a workspace before choosing your role." }) },
  play: async ({ canvasElement }) => {
    await userEvent.click(radio(canvasElement, "PM"))
    await userEvent.click(continueButton(canvasElement))
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Create or join a workspace before choosing your role.")
    await expect(radio(canvasElement, "PM")).toBeChecked()
    await expect(getRouter().replace).not.toHaveBeenCalled()
    await waitFor(() => expect(continueButton(canvasElement)).toBeEnabled())
  },
}

export const MissingRole: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(continueButton(canvasElement))
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent("Choose a role to continue.")
    await expect(saveOnboardingRole).not.toHaveBeenCalled()
  },
}

export const Pending: Story = {
  beforeEach: () => { mocked(saveOnboardingRole).mockReset().mockReturnValue(new Promise(() => {})) },
  play: async ({ canvasElement }) => {
    const pm = radio(canvasElement, "PM")
    await userEvent.click(pm)
    await userEvent.click(continueButton(canvasElement))
    const submit = within(canvasElement).getByRole("button", { name: "Saving role…" })
    await expect(submit).toBeDisabled()
    await expect(submit).toHaveAttribute("aria-busy", "true")
    await expect(pm).toBeDisabled()
    ;(document.activeElement as HTMLElement | null)?.blur()
    await userEvent.keyboard("2")
    await expect(radio(canvasElement, "Designer")).not.toBeChecked()
    await expect(saveOnboardingRole).toHaveBeenCalledTimes(1)
  },
}

export const PointerChoose: Story = {
  play: async ({ canvasElement }) => {
    const designer = radio(canvasElement, "Designer")
    await userEvent.click(within(canvasElement).getByText("Designer"))
    await expect(designer).toBeChecked()
    await userEvent.click(continueButton(canvasElement))
    await waitFor(() => expect(saveOnboardingRole).toHaveBeenCalledWith({ role: "designer" }))
    await afterLatestSave()
    await expect(within(canvasElement).queryByRole("alert")).not.toBeInTheDocument()
    await expect(continueButton(canvasElement)).toBeDisabled()
    await expect(getRouter().replace).not.toHaveBeenCalled()
  },
}

/** The shared :focus-visible ring (foundation.css) is drawn by the radio itself,
 * so it shows only where the radio is painted at full opacity around its row. */
async function expectFocusRing(input: HTMLElement) {
  await expect(input).toHaveFocus()
  await expect(input.matches(":focus-visible"), "keyboard focus matches :focus-visible").toBe(true)
  const style = getComputedStyle(input)
  await expect(style.outlineStyle, "the shared ring is drawn").toBe("solid")
  await expect(Number.parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2)
  let opacity = 1
  for (let node: Element | null = input; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity)
  await expect(opacity, "the ring is painted at full opacity").toBe(1)
  await expect(style.visibility).toBe("visible")
  // No fill: the radio paints nothing but the ring.
  await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)")
  // The ring frames the whole row, outside its border, and no ancestor clips it.
  const row = input.closest("label")!.getBoundingClientRect(), box = input.getBoundingClientRect()
  for (const side of ["top", "right", "bottom", "left"] as const) await expect(Math.abs(box[side] - row[side]), `ring ${side}`).toBeLessThanOrEqual(1)
  const reach = Number.parseFloat(style.outlineOffset) + Number.parseFloat(style.outlineWidth)
  const ring = { top: box.top - reach, right: box.right + reach, bottom: box.bottom + reach, left: box.left - reach }
  for (let node = input.parentElement; node; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node)
    if (overflowX === "visible" && overflowY === "visible") continue
    const clip = node.getBoundingClientRect()
    await expect(ring.top >= clip.top && ring.bottom <= clip.bottom && ring.left >= clip.left && ring.right <= clip.right, "no ancestor clips the ring").toBe(true)
  }
}

/** WCAG 2.4.7: keyboard focus shows on an unchecked role (nothing is chosen yet) and on a checked one. */
export const KeyboardFocusRing: Story = {
  play: async ({ canvasElement }) => {
    const pm = radio(canvasElement, "PM"), designer = radio(canvasElement, "Designer"), developer = radio(canvasElement, "Developer")
    within(canvasElement).getByRole("link", { name: "Lane sign in" }).focus()
    await userEvent.tab()
    await expect(pm).not.toBeChecked()
    await expectFocusRing(pm)
    // Focus adds no fill: the focused row matches an unfocused one.
    await expect(getComputedStyle(pm.closest("label")!).backgroundColor).toBe(getComputedStyle(developer.closest("label")!).backgroundColor)
    await userEvent.keyboard("{ArrowDown}")
    await expect(designer).toBeChecked()
    await expectFocusRing(designer)
  },
}

/** Keyboard hints are for fine pointers; Storybook's Chromium always reports one (risk 5). */
export const ShortcutHints: Story = {
  play: async ({ canvasElement }) => {
    const fine = window.matchMedia("(pointer: fine)").matches
    const line = within(canvasElement).getByText((_, element) => element?.tagName === "P" && element.textContent === "C to create, / to search")
    await expect(getComputedStyle(line).display).toBe(fine ? "block" : "none")
    const keys = canvasElement.querySelectorAll("label kbd")
    await expect([...keys].map(key => key.textContent)).toEqual(["1", "2", "3"])
    for (const key of keys) {
      await expect(key).toHaveAttribute("aria-hidden", "true")
      // A flex row blockifies its children, so "shown" is anything but none.
      if (fine) await expect(getComputedStyle(key).display).not.toBe("none")
      else await expect(getComputedStyle(key).display).toBe("none")
    }
  },
}
