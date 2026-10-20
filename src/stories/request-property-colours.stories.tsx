import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { RequestLabelsPicker } from "@/components/requests/request-labels";
import { RequestStatusControl } from "@/components/requests/request-status-control";
import { ProjectMarker } from "@/components/projects/project-marker";
import { ProjectPicker } from "@/components/requests/request-property-pickers";
import { desktopLight, phoneDark } from "./helpers/request-detail-fixture";

function Properties() {
  return <div>
    <RequestStatusControl status="open" move={null} onMove={() => {}} />
    <RequestStatusControl status="in_progress" move={null} onMove={() => {}} />
    <RequestStatusControl status="done" move={null} onMove={() => {}} />
    <RequestLabelsPicker orgId="story" value={["improvement"]} onChange={() => {}} />
    <ProjectPicker orgId="story" value={null} onChange={()=>{}} disabled={false} onBusyChange={()=>{}} state={{projects:[],loading:false,error:null,reload:async()=>{},addProject:()=>{}}}/>
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
  const picker = within(canvasElement).getByRole("button", { name: "Labels: Improvement" });
  await expect(getComputedStyle(picker.querySelector("[data-colour]")!).color).toBe(tokenColour(canvasElement, "--state-info-icon"));
  await userEvent.click(picker);
  for (const [label, token] of [["Bug", "--state-danger-icon"], ["Improvement", "--state-info-icon"], ["New feature", "--state-success-icon"]]) {
    const option = within(document.body).getByRole("checkbox", { name: label });
    await expect(getComputedStyle(option.closest("[class*=option]")!.querySelector("[data-colour]")!).color).toBe(tokenColour(canvasElement, token));
  }
  const labelPanel=within(document.body).getByRole("dialog",{name:"Labels"});
  const searchHeader=within(labelPanel).getByRole("textbox").closest("[class*=search]")!;
  await expect(parseFloat(getComputedStyle(searchHeader).borderBottomWidth)).toBeGreaterThan(0);
  const labelRow=within(document.body).getByRole("checkbox",{name:"Bug"}).closest("[class*=option]")!;
  const spacing={panel:getComputedStyle(labelPanel).paddingLeft,row:getComputedStyle(labelRow).paddingLeft,height:labelRow.getBoundingClientRect().height};
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(within(document.body).queryByRole("dialog")).toBeNull());
  await userEvent.click(within(canvasElement).getByRole("button",{name:"Project"}));
  const projectPanel=within(document.body).getByRole("dialog",{name:"Choose a Project"});
  const projectRow=within(projectPanel).getByRole("option",{name:"No project"});
  await expect(getComputedStyle(projectPanel).paddingLeft).toBe(spacing.panel);
  await expect(getComputedStyle(projectRow).paddingLeft).toBe(spacing.row);
  await expect(projectRow.getBoundingClientRect().height).toBeCloseTo(spacing.height, 2);
  await userEvent.keyboard("{Escape}");
  const a = within(canvasElement).getByTestId("project-a").firstElementChild!;
  const b = within(canvasElement).getByTestId("project-b").firstElementChild!;
  await expect(getComputedStyle(a).backgroundColor).toBe(getComputedStyle(b).backgroundColor);
  await expect(within(canvasElement).getByTestId("no-project").firstElementChild).toHaveAttribute("data-hollow");
  await expect(within(canvasElement).getByTestId("no-project").querySelector("svg")).not.toBeNull();
};
export const Light: Story = { globals: desktopLight, play: verify };
export const Dark: Story = { globals: phoneDark, play: verify };
