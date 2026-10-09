import { NewRequestProvider } from "@/components/requests/new-request-provider"
import { ToastStackProvider, ToastStack } from "@/components/arc/toast-stack/toast-stack"
import { useState, type ComponentProps } from "react"
import { Copy, Folder, Tag, UserRound } from "lucide-react"
import type { ContextMenuItem } from "@/components/arc/context-menu/context-menu"
import { RequestRowPresentation, PriorityGlyph, StatusGlyph, type RequestPriority } from "@/components/requests/row-presentation"
import { statuses } from "@/components/requests/tasks/statuses"
import type { OverviewRequest } from "@/lib/request-overview"
import { formatRequestCode } from "@/lib/request-code"
import { REQUEST_TYPES, REQUEST_TYPE_LABELS } from "@/lib/request-properties"
import { RequestsShellFixture } from "../requests.stories"

const projects = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Website" },
  { id: "22222222-2222-4222-8222-222222222222", name: "B2B App" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Marketing" },
]
const priorities: { value: RequestPriority; label: string }[] = [
  { value: "none", label: "No priority" }, { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" },
]
const illustrativeNumbers: Record<string, number> = {
  "fixture-1": 1, "fixture-2": 2, "fixture-3": 3, "fixture-4": 4,
  "fixture-5": 5, "fixture-6": 6, "fixture-7": 7, "fixture-8": 8,
  "fixture-9": 9, "fixture-10": 10, "fixture-11": 11, "fixture-12": 12,
}

/** Illustrative state only. No server actions or database writes. */
export function LinearRequestsFixture(args: ComponentProps<typeof RequestsShellFixture>) {
  const [changes, setChanges] = useState<Record<string, Partial<OverviewRequest>>>({})
  const [priorityChanges, setPriorityChanges] = useState<Record<string, RequestPriority>>({})
  const [message, setMessage] = useState("")
  const requests = args.requests.map((request, index) => ({ ...request, requestType: request.requestType ?? REQUEST_TYPES[index % REQUEST_TYPES.length], ...changes[request.id] }))
  const identities = Object.fromEntries(args.requests.map((request, index) => {
    const number = request.requestNumber ?? illustrativeNumbers[request.id]
    if (number === undefined) throw new Error(`Provide an explicit illustrative Request number for ${request.id}`)
    return [request.id, {
      code: formatRequestCode(number), priority: priorityChanges[request.id] ?? priorities[index % priorities.length].value,
    }]
  }))
  function update(id: string, next: Partial<OverviewRequest>, label: string) {
    setChanges(previous => ({ ...previous, [id]: { ...previous[id], ...next } }))
    setMessage(`${label} changed in this preview.`)
    // A status edit can move the row into a different group and replace its DOM.
    requestAnimationFrame(() => {
      const link = document.getElementById(`request-${id}`)
      const visible = link?.getClientRects().length && !link.closest('[hidden],[inert]')
      const target = visible ? link : document.querySelector<HTMLButtonElement>('[aria-label="Filter Requests by title"]')
      target?.focus({ preventScroll: true })
    })
  }
  function menuItems(request: OverviewRequest): ContextMenuItem[] {
    const identity = identities[request.id]
    return [
      { id: "status", label: "Status", icon: <StatusGlyph status={request.status} />, children: statuses.map(status => ({ id: status.value, label: status.label, icon: <StatusGlyph status={status.value} />, checked: request.status === status.value, onSelect: () => update(request.id, { status: status.value }, "Status") })) },
      { id: "priority", label: "Priority", icon: <PriorityGlyph priority={identity.priority} />, children: priorities.map(priority => ({ id: priority.value, label: priority.label, icon: <PriorityGlyph priority={priority.value} />, checked: identity.priority === priority.value, onSelect: () => { setPriorityChanges(previous => ({ ...previous, [request.id]: priority.value })); setMessage("Priority changed in this preview.") } })) },
      { id: "picker", label: "Picker", icon: <UserRound size={16} />, children: [
        { id: "none", label: "Unassigned", checked: !request.assignedTo, onSelect: () => update(request.id, { assignedTo: null, assigneeName: null, assigneeAvatarUrl: null }, "Picker") },
        ...[{ id: "person-alex", name: "Alex Morgan" }, { id: "person-sam", name: "Sam Lee" }].map(person => ({ id: person.id, label: person.name, checked: request.assignedTo === person.id, onSelect: () => update(request.id, { assignedTo: person.id, assigneeName: person.name, assigneeAvatarUrl: null }, "Picker") })),
      ] },
      { id: "project", label: "Project", icon: <Folder size={16} />, children: [
        { id: "none", label: "No Project", checked: !request.projectId, onSelect: () => update(request.id, { projectId: null, projectName: null }, "Project") },
        ...projects.map(project => ({ id: project.id, label: project.name, checked: request.projectId === project.id, onSelect: () => update(request.id, { projectId: project.id, projectName: project.name }, "Project") })),
      ] },
      { id: "type", label: "Request type", icon: <Tag size={16} />, children: REQUEST_TYPES.map(type => ({ id: type, label: REQUEST_TYPE_LABELS[type], checked: request.requestType === type, onSelect: () => update(request.id, { requestType: type }, "Request type") })) },
      { id: "copy", label: "Copy", separatorBefore: true, icon: <Copy size={16} />, children: [
        { id: "code", label: "Copy code", onSelect: () => copy(identity.code) },
        { id: "title", label: "Copy title", onSelect: () => copy(request.reframedProblem ?? request.title) },
        { id: "link", label: "Copy preview link", onSelect: () => copy(new URL(`?id=review-linear-primitives--requests&viewMode=story#request-${request.id}`, location.href).href) },
      ] },
    ]
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("Copied.") }
    catch { setMessage("Could not copy. Try again.") }
  }
  return <ToastStackProvider><NewRequestProvider context={args.context ?? { orgId: "org_storybook" }} draftOwnerId="linear-preview-person"><RequestRowPresentation value={{ identities, menuItems }}>
    <RequestsShellFixture {...args} requests={requests} linearPreviewAutoCollapse />
    <span className="sr-only" role="status">{message}</span>
  </RequestRowPresentation><ToastStack /></NewRequestProvider></ToastStackProvider>
}
