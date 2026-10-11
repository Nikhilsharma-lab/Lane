import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, within } from "storybook/test"
import AppError from "@/app/(app)/error"

const meta = {
  title: "Pages/Shared error",
  component: AppError,
  decorators: [(Story) => <main><Story /></main>],
  args: { error: new Error("Illustrative network failure"), reset: fn() },
} satisfies Meta<typeof AppError>
export default meta
type Story = StoryObj<typeof meta>

export const Retry: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole("heading", { level: 1 })
    await expect(heading).toHaveTextContent("Page unavailable")
    // Plan item 2.0: the h1 is the page strip's title, outside the alert.
    await expect(heading.closest('[data-slot="page-strip"]')).not.toBeNull()
    await expect(canvas.getByRole("alert")).not.toContainElement(heading)
    await expect(canvas.getByRole("heading", { name: "This page couldn’t load" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.reset).toHaveBeenCalledOnce()
  },
}
