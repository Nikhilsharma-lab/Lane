import { fillMetricImpact } from "./fixtures/request-impact"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, mocked, userEvent, within, waitFor } from "storybook/test"
import RequestEditor from "@/app/(app)/intake/intake-form"
import { writeIntakeDraft, readIntakeDraft, intakeDraftScope } from "@/lib/intake-draft"
import EditRequestForm from "@/app/(app)/requests/[id]/edit-request-form"
import { saveRequestEdits } from "@/app/(app)/requests/[id]/edit-actions"
import { prepareAttachmentUpload } from "@/app/(app)/intake/attachment-actions"
import { runTriage, saveRequest } from "@/app/(app)/intake/actions"
import { listProjects } from "@/app/(app)/intake/project-actions"
import type { RequestDetail } from "@/components/requests/detail-view"
const request: RequestDetail = {
 id:"a1000000-0000-4000-8000-000000000016",requestNumber:16,title:"Keep the saved Request title",description:"People cannot find the information they need to continue.",
 affectedPeople:"Saved audience context",desiredChange:null,observedEvidence:"Saved evidence",uncertainty:null,usefulLink:"https://www.figma.com/design/saved",
 expectedImpact:null,measurementDraft:null,reframedProblem:null,extractedSolution:null,classification:"problem",status:"open",priority:"high",assignedTo:null,
 createdBy:"editor-person",createdAt:new Date(),creatorName:"Editor",assigneeName:null,assigneeAvatarUrl:null,projectId:null,requestType:"improvement",
}
const meta = {title:"Requests/Shared editor",component:EditRequestForm,args:{request,draftOwnerId:request.createdBy,orgId:"editor-workspace",onSaved:fn(),onBusyChange:fn()},
 beforeEach:()=>{
  sessionStorage.clear()
  mocked(listProjects).mockReset().mockResolvedValue({success:true,projects:[]})
  mocked(saveRequestEdits).mockReset().mockResolvedValue({success:true})
  mocked(saveRequest).mockReset()
  mocked(runTriage).mockReset().mockResolvedValue({success:true,token:"edit-review",triage:{classification:"problem",reframedProblem:null,extractedSolution:null}})
 },parameters:{layout:"fullscreen"}} satisfies Meta<typeof EditRequestForm>
export default meta
type Story=StoryObj<typeof meta>
export const SharedControlsAndPreservedSave:Story={play:async({canvasElement,args})=>{
 const c=within(canvasElement), page=within(document.body)
 await expect(await c.findByRole("button",{name:"Attach files"})).toBeVisible()
 await expect(c.getByRole("textbox",{name:"Description"})).toHaveValue(request.description)
 for(const name of ["Metric","Audience","Platform"]) await expect(c.getByRole("combobox",{name})).toBeVisible()
 await userEvent.click(c.getByRole("button",{name:"Add link"}))
 await expect(page.getByRole("textbox",{name:"Related link"})).toHaveValue(request.usefulLink)
 await userEvent.click(page.getByRole("button",{name:/^Done$/}))
 await userEvent.upload(c.getByLabelText("Choose Request files"),new File(["sample"],"sample.txt",{type:"text/plain"}))
 await waitFor(()=>expect(c.getByText("sample.txt")).toBeVisible())
 await userEvent.click(c.getByRole("button",{name:/Remove sample.txt/}))
 await userEvent.click(c.getByRole("button",{name:"Save changes"}))
 await waitFor(()=>expect(args.onSaved).toHaveBeenCalled())
 await expect(mocked(saveRequestEdits)).toHaveBeenCalledWith(request.id,expect.objectContaining({changes:expect.objectContaining({title:request.title,description:request.description,expectedImpact:null,affectedPeople:request.affectedPeople,observedEvidence:request.observedEvidence,usefulLink:request.usefulLink})}),{orgId:args.orgId})
 await expect(mocked(runTriage)).not.toHaveBeenCalled()
 await expect(mocked(saveRequest)).not.toHaveBeenCalled()
}}

export const ChangedTextUsesReview:Story={play:async({canvasElement,args})=>{
 const c=within(canvasElement)
 await userEvent.clear(await c.findByRole("textbox",{name:"Description"}))
 await userEvent.type(c.getByRole("textbox",{name:"Description"}),"People cannot recover their work when they return to the editor.")
 await userEvent.click(c.getByRole("button",{name:"Review Request"}))
 await waitFor(()=>expect(c.getByRole("heading",{name:"Review Request"})).toBeVisible())
 await expect(mocked(saveRequestEdits)).not.toHaveBeenCalled()
 await waitFor(()=>expect(c.getByRole("button",{name:"Save changes"})).toBeVisible())
 await userEvent.click(c.getByRole("button",{name:"Save changes"}))
 await waitFor(()=>expect(args.onSaved).toHaveBeenCalled())
 await expect(mocked(runTriage)).toHaveBeenCalledWith(expect.objectContaining({expectedImpact:expect.objectContaining({metric:"",unit:"",baseline:null,target:null,reviewAfterDays:null})}),{orgId:args.orgId},request.id)
 await expect(mocked(saveRequestEdits)).toHaveBeenCalledWith(request.id,expect.objectContaining({token:"edit-review",changes:expect.objectContaining({expectedImpact:null})}),{orgId:args.orgId})
 await expect(mocked(saveRequest)).not.toHaveBeenCalled()
}}

export const SaveFailureKeepsValues:Story={beforeEach:()=>{mocked(saveRequestEdits).mockResolvedValueOnce({error:"This Request changed while you were editing."})},play:async({canvasElement})=>{
 const c=within(canvasElement)
 await userEvent.click(await c.findByRole("button",{name:"Save changes"}))
 await expect(await c.findByText("This Request changed while you were editing.")).toBeVisible()
 await expect(c.getByRole("textbox",{name:"Request title"})).toHaveValue(request.title)
 await expect(c.getByRole("textbox",{name:"Description"})).toHaveValue(request.description)
 await expect(c.getByRole("combobox",{name:"Audience"})).toHaveTextContent("Audience")
 await expect(c.getByRole("button",{name:"Save changes"})).toBeEnabled()
}}

export const UploadRecoveryDoesNotResave:Story={beforeEach:()=>{
 mocked(prepareAttachmentUpload).mockReset().mockResolvedValue({success:false,error:{code:"storage_unavailable",message:"Upload unavailable. Your changes are saved."}})
},play:async({canvasElement,args})=>{
 const c=within(canvasElement)
 await userEvent.upload(await c.findByLabelText("Choose Request files"),new File(["notes"],"notes.txt",{type:"text/plain"}))
 await userEvent.click(c.getByRole("button",{name:"Save changes"}))
 await waitFor(()=>expect(c.getByRole("heading",{name:"Some files weren’t uploaded"})).toBeVisible())
 await expect(mocked(prepareAttachmentUpload)).toHaveBeenCalledWith(expect.objectContaining({requestId:request.id,fileName:"notes.txt"}),{orgId:args.orgId})
 await userEvent.click(c.getByRole("button",{name:"Retry upload"}))
 await waitFor(()=>expect(mocked(prepareAttachmentUpload)).toHaveBeenCalledTimes(2))
 await expect(mocked(saveRequestEdits)).toHaveBeenCalledTimes(1)
 await expect(mocked(saveRequest)).not.toHaveBeenCalled()
}}

export const RestoredNewDraftUsesSameControls:Story={
 beforeEach:()=>{writeIntakeDraft(sessionStorage,intakeDraftScope("editor-person","editor-workspace"),{
  source:{...request,labelKeys:request.labelKeys ?? undefined,affectedPeople:"",desiredChange:"",observedEvidence:"",uncertainty:"",usefulLink:"",expectedImpact:{kind:"metric",metric:"Saved custom metric",unit:"visits",baseline:0,target:10,source:"Saved report",reviewAfterDays:45}},review:null,
 });},
 render:()=> <RequestEditor context={{orgId:"editor-workspace"}} draftOwnerId="editor-person" />,
 play:async({canvasElement})=>{
  const c=within(canvasElement)
  await expect(await c.findByRole("combobox",{name:"Metric"})).toHaveTextContent("Saved custom metric")
  await expect(c.getByRole("combobox",{name:"Audience"})).toBeVisible()
  await expect(c.getByRole("combobox",{name:"Platform"})).toBeVisible()
  await expect(c.getByRole("spinbutton",{name:"Current value"})).toHaveValue(0)
  await expect(c.getByRole("textbox",{name:"Evidence source"})).toHaveValue("Saved report")
  await expect(c.getByRole("button",{name:"Measurement window"})).toHaveTextContent("45 days after release")
 }
}

export const AdminDraftUsesCurrentPerson:Story={args:{draftOwnerId:"workspace-admin"},play:async({canvasElement})=>{
 const c=within(canvasElement);
 await userEvent.type(await c.findByRole("textbox",{name:"Description"})," Admin draft.");
 await waitFor(()=>expect(readIntakeDraft(sessionStorage,intakeDraftScope("workspace-admin","editor-workspace")+":edit:"+request.id)?.source.description).toContain("Admin draft."));
 await expect(readIntakeDraft(sessionStorage,intakeDraftScope(request.createdBy,"editor-workspace")+":edit:"+request.id)).toBeNull();
}};

export const RemoveAndReplaceLink:Story={play:async({canvasElement,args})=>{
 const c=within(canvasElement), page=within(document.body)
 await userEvent.click(await c.findByRole("button",{name:"Add link"}))
 await userEvent.click(page.getByRole("button",{name:"Remove link"}))
 await userEvent.click(c.getByRole("button",{name:"Add link"}))
 await expect(page.getByRole("textbox",{name:"Related link"})).toHaveValue("")
 await userEvent.type(page.getByRole("textbox",{name:"Related link"}),"https://example.com/replacement")
 await userEvent.click(page.getByRole("button",{name:/^Done$/}))
 await userEvent.click(c.getByRole("button",{name:"Save changes"}))
 await waitFor(()=>expect(args.onSaved).toHaveBeenCalled())
 await expect(mocked(saveRequestEdits)).toHaveBeenCalledWith(request.id,expect.objectContaining({changes:expect.objectContaining({usefulLink:"https://example.com/replacement",affectedPeople:request.affectedPeople,observedEvidence:request.observedEvidence})}),{orgId:args.orgId})
}}

export const EditLinkRemovalPersists:Story={play:async({canvasElement,args})=>{
 const c=within(canvasElement),page=within(document.body)
 await userEvent.click(await c.findByRole("button",{name:"Add link"}))
 await userEvent.click(page.getByRole("button",{name:"Remove link"}))
 await userEvent.click(c.getByRole("button",{name:"Save changes"}))
 await waitFor(()=>expect(args.onSaved).toHaveBeenCalled())
 await expect(mocked(saveRequestEdits)).toHaveBeenCalledWith(request.id,expect.objectContaining({changes:expect.objectContaining({usefulLink:"",affectedPeople:request.affectedPeople,observedEvidence:request.observedEvidence})}),{orgId:args.orgId})
}}

export const NewLinkAddReplaceRemove:Story={
 render:()=> <RequestEditor context={{orgId:"editor-workspace"}} draftOwnerId="editor-person" />,
 play:async({canvasElement})=>{
  const c=within(canvasElement),page=within(document.body)
  await userEvent.type(await c.findByRole("textbox",{name:"Request title"}),"Link draft verification")
  for(const url of ["https://example.com/first","https://example.com/replacement"]){
   await userEvent.click(c.getByRole("button",{name:"Add link"}))
   const input=page.getByRole("textbox",{name:"Related link"})
   await userEvent.clear(input); await userEvent.type(input,url)
   await userEvent.click(page.getByRole("button",{name:/^Done$/}))
   await waitFor(()=>expect(readIntakeDraft(sessionStorage,intakeDraftScope("editor-person","editor-workspace"))?.source.usefulLink).toBe(url))
  }
  await userEvent.click(c.getByRole("button",{name:"Add link"}))
  await userEvent.click(page.getByRole("button",{name:"Remove link"}))
  await waitFor(()=>expect(readIntakeDraft(sessionStorage,intakeDraftScope("editor-person","editor-workspace"))?.source.usefulLink).toBe(""))
  await userEvent.click(c.getByRole("button",{name:"Add link"}))
  await expect(page.getByRole("textbox",{name:"Related link"})).toHaveValue("")
  await expect(mocked(saveRequest)).not.toHaveBeenCalled()
 }
}

function newLinkSaveStory(remove: boolean): Story {
 return {render:()=> <RequestEditor context={{orgId:"editor-workspace"}} draftOwnerId="editor-person" />,
 play:async({canvasElement})=>{
  const c=within(canvasElement),page=within(document.body)
  mocked(saveRequest).mockResolvedValue({success:true,requestId:request.id})
  await userEvent.type(await c.findByRole("textbox",{name:"Request title"}),request.title)
  await userEvent.type(c.getByRole("textbox",{name:"Description"}),request.description)
  await fillMetricImpact(c)
  await userEvent.click(c.getByRole("button",{name:"Add link"}))
  await userEvent.type(page.getByRole("textbox",{name:"Related link"}),"https://example.com/first")
  await userEvent.click(page.getByRole("button",{name:/^Done$/}))
  await userEvent.click(c.getByRole("button",{name:"Add link"}))
  if(remove) await userEvent.click(page.getByRole("button",{name:"Remove link"}))
  else {
   await userEvent.clear(page.getByRole("textbox",{name:"Related link"}))
   await userEvent.type(page.getByRole("textbox",{name:"Related link"}),"https://example.com/replacement")
   await userEvent.click(page.getByRole("button",{name:/^Done$/}))
  }
  await expect(mocked(saveRequest)).not.toHaveBeenCalled()
  await userEvent.click(c.getByRole("button",{name:"Review Request"}))
  await waitFor(()=>expect(mocked(runTriage)).toHaveBeenCalledWith(expect.objectContaining({usefulLink:remove?"":"https://example.com/replacement"}),{orgId:"editor-workspace"}))
  await userEvent.click(await c.findByRole("button",{name:"Create Request"}))
  await waitFor(()=>expect(mocked(saveRequest)).toHaveBeenCalledWith(expect.objectContaining({token:"edit-review"}),{orgId:"editor-workspace"}))
 }}
}
export const NewReplacedLinkUsesGate = newLinkSaveStory(false)
export const NewRemovedLinkUsesGate = newLinkSaveStory(true)

export const MultipleLabelsSave: Story = { play: async ({canvasElement,args}) => {
 const canvas=within(canvasElement),page=within(document.body);
 await userEvent.click(await canvas.findByRole("button",{name:"Labels: Improvement"}));
 await userEvent.click(page.getByRole("checkbox",{name:"Bug"}));
 await userEvent.keyboard("{Escape}");
 await waitFor(()=>expect(page.queryByRole("dialog")).not.toBeInTheDocument());
 await userEvent.click(canvas.getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(args.onSaved).toHaveBeenCalled());
 await expect(mocked(saveRequestEdits)).toHaveBeenCalledWith(request.id,expect.objectContaining({changes:expect.objectContaining({labelKeys:["improvement","bug"],expectedImpact:null,title:request.title})}),{orgId:args.orgId});
}};
