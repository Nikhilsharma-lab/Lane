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
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Page unavailable")
    await expect(canvas.getByRole("heading", { name: "This page couldn’t load" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.reset).toHaveBeenCalledOnce()
  },
}
