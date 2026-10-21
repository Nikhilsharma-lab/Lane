import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, mocked, userEvent, waitFor, within } from "storybook/test";
import { RequestLabelsPicker, RequestLabels } from "@/components/requests/request-labels";
import { WorkspaceLabelsProvider } from "@/components/requests/workspace-labels";
import { DEFAULT_LABELS } from "@/lib/request-labels";
import { createLabel } from "@/app/(app)/intake/label-actions";
function Fixture(){const [keys,setKeys]=useState(["bug"]);return <WorkspaceLabelsProvider orgId="org_story" initialLabels={DEFAULT_LABELS}><RequestLabelsPicker orgId="org_story" value={keys} onChange={setKeys}/><RequestLabels request={{labelKeys:keys}}/><output>{JSON.stringify(keys)}</output></WorkspaceLabelsProvider>;}
const meta={title:"Requests/Labels",component:Fixture,beforeEach:()=>{mocked(createLabel).mockReset().mockResolvedValue({success:true,label:{id:"11111111-1111-4111-8111-111111111111",name:"Customer feedback",colour:"green"}});}} satisfies Meta<typeof Fixture>;
export default meta;
type Story=StoryObj<typeof meta>;
const projectId="22222222-2222-4222-8222-222222222222";
function ProjectFixture(){
 const [keys,setKeys]=useState<string[]>([]),[assigned,setAssigned]=useState(true);
 return <WorkspaceLabelsProvider orgId="org_story" initialLabels={DEFAULT_LABELS}><RequestLabelsPicker orgId="org_story" value={keys} onChange={setKeys} project={assigned ? {id:projectId,name:"Website"} : null}/><button onClick={()=>setAssigned(false)}>Clear Project</button></WorkspaceLabelsProvider>;
}
export const ProjectScope:Story={render:()=> <ProjectFixture/>,play:async({canvasElement})=>{
 mocked(createLabel).mockResolvedValue({success:true,label:{id:"11111111-1111-4111-8111-111111111111",name:"Navigation",colour:"green",projectId}});
 const canvas=within(canvasElement),page=within(document.body);
 await userEvent.click(canvas.getByRole("button",{name:/^Labels$/}));
 await userEvent.type(page.getByRole("textbox",{name:"Search labels"}),"Navigation");
 await userEvent.click(page.getByRole("button",{name:/Create new label:/}));
 await expect(page.getByRole("button",{name:/^Workspace$/})).toBeVisible();
 await userEvent.click(page.getByRole("button",{name:/^Website$/}));
 await userEvent.click(page.getByRole("button",{name:/^Green$/}));
 await waitFor(()=>expect(createLabel).toHaveBeenCalledWith({name:"Navigation",colour:"green",projectId},{orgId:"org_story"}));
 await waitFor(()=>expect(page.getByRole("checkbox",{name:"Navigation"})).toBeChecked());
 await userEvent.keyboard("{Escape}");
 await userEvent.click(canvas.getByRole("button",{name:"Clear Project"}));
 await userEvent.click(canvas.getByRole("button",{name:"Labels: Navigation"}));
 await expect(page.getByText("Other Project — remove to save")).toBeVisible();
 await userEvent.click(page.getByRole("checkbox",{name:"Navigation"}));
 await expect(page.queryByRole("checkbox",{name:"Navigation"})).not.toBeInTheDocument();
}};
export const MultipleCreateRemoveAndReopen:Story={play:async({canvasElement})=>{
 const canvas=within(canvasElement),page=within(document.body);
 await userEvent.click(canvas.getByRole("button",{name:"Labels: Bug"}));
 const menu=page.getByRole("dialog",{name:"Labels"});
 await expect(menu.getBoundingClientRect().width).toBeLessThanOrEqual(208);
 const bug=page.getByRole("checkbox",{name:"Bug"});
 const dot=bug.closest("[class*=option]")!.querySelector("[data-colour]")!;
 await expect(bug.getBoundingClientRect().left).toBeGreaterThan(dot.getBoundingClientRect().right);
 await expect(getComputedStyle(bug.firstElementChild!).borderTopWidth).toBe("0px");
 const unselected=page.getByRole("checkbox",{name:"Improvement"});
 await expect(getComputedStyle(unselected.firstElementChild!).borderTopWidth).toBe("0px");
 await expect(getComputedStyle(bug.firstElementChild!.firstElementChild!).display).toBe("none");
 await userEvent.click(page.getByRole("checkbox",{name:"Improvement"}));
 await waitFor(()=>expect(canvas.getByRole("button",{name:"Labels: Bug, Improvement"})).toHaveTextContent("2 labels"));
 await expect(page.getByPlaceholderText("Add labels…")).toBeVisible();
 await expect(page.getByRole("checkbox",{name:"Bug"})).toBeChecked();
 await userEvent.type(page.getByRole("textbox",{name:"Search labels"}),"Customer feedback");
 await userEvent.click(page.getByRole("button",{name:/Create new label:/}));
 await userEvent.click(page.getByRole("button",{name:/^Workspace$/}));
 await userEvent.click(page.getByRole("button",{name:/^Green$/}));
 await waitFor(()=>expect(page.getByRole("checkbox",{name:"Customer feedback"})).toBeChecked());
 await userEvent.click(page.getByRole("checkbox",{name:"Bug"}));
 await userEvent.keyboard("{Escape}");
 await waitFor(()=>expect(page.queryByRole("dialog")).not.toBeInTheDocument());
 await userEvent.click(canvas.getByRole("button",{name:"Labels: Improvement, Customer feedback"}));
 await expect(page.getByRole("checkbox",{name:"Bug"})).not.toBeChecked();
 await expect(page.getByRole("checkbox",{name:"Improvement"})).toBeChecked();
 await expect(page.getByRole("checkbox",{name:"Customer feedback"})).toBeChecked();
}};

export const PrefixMatchingAndStableCount:Story={play:async({canvasElement})=>{
 const canvas=within(canvasElement),page=within(document.body);
 await userEvent.click(canvas.getByRole("button",{name:"Labels: Bug"}));
 await expect(page.queryByRole("button",{name:/Create.*label/})).not.toBeInTheDocument();
 const input=page.getByRole("textbox",{name:"Search labels"});
 await userEvent.type(input,"i");
 await expect(page.getAllByRole("checkbox")).toHaveLength(1);
 // The popover fades in from opacity 0 (@starting-style), so visibility is awaited, not read on the first frame.
 await waitFor(()=>expect(page.getByRole("checkbox",{name:"Improvement"})).toBeVisible());
 await userEvent.type(input,"m");
 await expect(page.getAllByRole("checkbox")).toHaveLength(1);
 await expect(page.queryByRole("button",{name:/Create.*label/})).not.toBeInTheDocument();
 await userEvent.clear(input);
 await userEvent.type(input,"provement");
 await expect(page.queryByRole("checkbox")).not.toBeInTheDocument();
 await waitFor(()=>expect(page.getByRole("button",{name:/Create new label:/})).toBeVisible());
 await userEvent.clear(input);
 await userEvent.click(page.getByRole("checkbox",{name:"Improvement"}));
 const trigger=canvas.getByRole("button",{name:"Labels: Bug, Improvement"});
 const count=within(trigger).getByText("2 labels");
 const dot=trigger.querySelector<HTMLElement>("[data-colour]")!;
 const menuDot=page.getByRole("group",{name:"Available labels"}).querySelector<HTMLElement>("[data-colour]")!;
 await expect(getComputedStyle(dot).width).toBe(getComputedStyle(menuDot).width);
 await userEvent.click(page.getByRole("checkbox",{name:"New feature"}));
 await expect(count).toHaveTextContent("3 labels");
 await expect(count.isConnected).toBe(true);
}};

export const KeyboardSelectionHint:Story={play:async({canvasElement})=>{
 const page=within(document.body);
 await userEvent.click(within(canvasElement).getByRole("button",{name:"Labels: Bug"}));
 const option=page.getByRole("checkbox",{name:"Improvement"});
 const box=option.firstElementChild!;
 await expect(getComputedStyle(box).borderTopWidth).toBe("0px");
 await userEvent.click(page.getByRole("textbox",{name:"Search labels"}));
 await userEvent.keyboard("{ArrowDown}{ArrowDown}");
 await expect(option).toHaveFocus();
 await expect(parseFloat(getComputedStyle(box).borderTopWidth)).toBeGreaterThan(0);
 await userEvent.keyboard(" ");
 await expect(option).toBeChecked();
 await expect(getComputedStyle(box).borderTopWidth).toBe("0px");
}};

export const SharedTagStyling: Story = {
 render: () => <WorkspaceLabelsProvider orgId="org_story" initialLabels={DEFAULT_LABELS}><RequestLabelsPicker orgId="org_story" value={["bug"]} onChange={()=>{}}/><RequestLabels request={{labelKeys:["bug"]}}/><RequestLabels request={{labelKeys:["bug", "improvement"]}} compact/></WorkspaceLabelsProvider>,
 play: async ({canvasElement}) => {
   const tags = [...canvasElement.querySelectorAll<HTMLElement>("[data-label-tag]")];
   await expect(tags).toHaveLength(3);
   const editorControl = within(canvasElement).getByRole("button", {name: "Labels: Bug"});
   await expect(editorControl.querySelector("[data-label-tag]")).toBeNull();
   await expect(getComputedStyle(editorControl).fontSize).toBe("14px");
   const baseline = getComputedStyle(tags[0]);
   for (const tag of tags) {
     const style = getComputedStyle(tag);
     await expect(style.paddingLeft).toBe(style.paddingRight);
     for (const property of ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "fontSize", "borderRadius", "backgroundColor", "borderColor"] as const) await expect(style[property]).toBe(baseline[property]);
   }
 },
};
