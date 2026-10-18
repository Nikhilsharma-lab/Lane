import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { RequestPriorityPicker } from "@/components/requests/request-priority-picker";
import { REQUEST_PRIORITIES } from "@/lib/request-constants";
import { desktopLight, phoneDark } from "./helpers/request-detail-fixture";

function PriorityControls() {
  const [values, setValues] = useState([...REQUEST_PRIORITIES]);
  return <div>{values.map((value, index) => <RequestPriorityPicker key={index} value={value} disabled={false} onChange={next => setValues(current => current.map((item, i) => i === index ? next : item))} />)}</div>;
}
const meta = { title: "Requests/Priority controls", component: PriorityControls } satisfies Meta<typeof PriorityControls>;
export default meta;
type Story = StoryObj<typeof meta>;
const tokens = ["--text-muted", "--state-danger-icon", "--state-warning-icon", "--state-info-icon", "--state-success-icon"];
const verify: Story["play"] = async ({ canvasElement }) => {
  const controls = within(canvasElement).getAllByRole("combobox");
  await expect(new Set(controls.map(control => control.id)).size).toBe(5);
  for (let i = 0; i < controls.length; i++) {
    const icon = controls[i].querySelector("svg")!;
    const probe = document.createElement("span");
    probe.style.color = `var(${tokens[i]})`;
    canvasElement.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    await expect(getComputedStyle(icon).color).toBe(expected);
    await userEvent.click(controls[i]);
    const selected = within(document.body).getAllByRole("option")[i];
    await expect(getComputedStyle(selected.querySelector("svg")!).color).toBe(expected);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(within(document.body).queryByRole("listbox")).toBeNull());
  }
  controls[2].focus();
  await userEvent.keyboard("{Enter}{End}{Enter}");
  await expect(controls[2]).toHaveTextContent("Low");
  await waitFor(() => expect(within(document.body).queryByRole("listbox")).toBeNull());
};
export const Light: Story = { globals: desktopLight, play: verify };
export const Dark: Story = { globals: phoneDark, play: verify };
