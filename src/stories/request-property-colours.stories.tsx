import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { RequestTypePicker } from "@/components/requests/request-property-pickers";
import { RequestStatusControl } from "@/components/requests/request-status-control";
import { ProjectMarker } from "@/components/projects/project-marker";
import { desktopLight, phoneDark } from "./helpers/request-detail-fixture";

function Properties() {
  return <div>
    <RequestStatusControl status="open" move={null} onMove={() => {}} />
    <RequestStatusControl status="in_progress" move={null} onMove={() => {}} />
    <RequestStatusControl status="done" move={null} onMove={() => {}} />
    <RequestTypePicker value="improvement" disabled={false} onChange={() => {}} />
    <span data-testid="project-a"><ProjectMarker projectId="website" /></span>
    <span data-testid="project-b"><ProjectMarker projectId="website" /></span>
    <span data-testid="no-project"><ProjectMarker projectId={null} /></span>
  </div>;
}
const meta = { title: "Requests/Shared property colours", component: Properties } satisfies Meta<typeof Properties>;
export default meta;
type Story = StoryObj<typeof meta>;
function tokenColour(root: HTMLElement, token: string) {
  const probe = document.createElement("span"); probe.style.color = `var(${token})`; root.append(probe);
  const colour = getComputedStyle(probe).color; probe.remove(); return colour;
}
const verify: Story["play"] = async ({ canvasElement }) => {
  for (const [status, token] of [["open", "--text-muted"], ["in_progress", "--state-warning-icon"], ["done", "--state-success-icon"]]) {
    await expect(getComputedStyle(canvasElement.querySelector(`svg[data-status="${status}"]`)!).color).toBe(tokenColour(canvasElement, token));
  }
  const picker = within(canvasElement).getByRole("combobox");
  await expect(getComputedStyle(picker.querySelector("svg")!).color).toBe(tokenColour(canvasElement, "--state-info-icon"));
  await userEvent.click(picker);
  for (const [label, token] of [["No type", "--text-muted"], ["Bug", "--state-danger-icon"], ["Improvement", "--state-info-icon"], ["New feature", "--state-success-icon"]]) {
    const option = within(document.body).getByRole("option", { name: label });
    await expect(getComputedStyle(option.querySelector("svg")!).color).toBe(tokenColour(canvasElement, token));
  }
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(within(document.body).queryByRole("listbox")).toBeNull());
  const a = within(canvasElement).getByTestId("project-a").firstElementChild!;
  const b = within(canvasElement).getByTestId("project-b").firstElementChild!;
  await expect(getComputedStyle(a).backgroundColor).toBe(getComputedStyle(b).backgroundColor);
  await expect(within(canvasElement).getByTestId("no-project").firstElementChild).toHaveAttribute("data-hollow");
};
export const Light: Story = { globals: desktopLight, play: verify };
export const Dark: Story = { globals: phoneDark, play: verify };
