import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"

import { RoleForm } from "@/app/(auth)/onboarding/role-form"
import { saveOnboardingRole } from "@/app/(auth)/onboarding/actions"

// Plan item 2.2: the real onboarding role step. Storybook mocks the action and
// the Next router, so nothing here saves a profile or navigates.
const meta = {
  title: "Auth/Onboarding",
  component: RoleForm,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/onboarding" } } },
  beforeEach: () => {
    mocked(saveOnboardingRole).mockReset().mockResolvedValue({ success: true })
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
    await waitFor(() => expect(getRouter().replace).toHaveBeenCalledTimes(1))
    await expect(getRouter().replace).toHaveBeenCalledWith("/")
    await expect(getRouter().refresh).not.toHaveBeenCalled()
    // Saved: the form stays disabled until the navigation commits, so it never re-enables in between.
    await expect(submit).toBeDisabled()
    await expect(designer).toBeDisabled()
    await userEvent.keyboard("3")
    await expect(developer).not.toBeChecked()
    await expect(saveOnboardingRole).toHaveBeenCalledTimes(1)
  },
}

export const SaveFailure: Story = {
  beforeEach: () => { mocked(saveOnboardingRole).mockReset().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ success: true }) },
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
    await waitFor(() => expect(getRouter().replace).toHaveBeenCalledWith("/"))
    await expect(saveOnboardingRole).toHaveBeenLastCalledWith({ role: "developer" })
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
    await waitFor(() => expect(getRouter().replace).toHaveBeenCalledWith("/"))
    await expect(saveOnboardingRole).toHaveBeenCalledWith({ role: "designer" })
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
