import { useEffect, useRef, useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { expect, mocked, userEvent, waitFor, within } from "storybook/test"
import { runTriage, saveRequest } from "@/app/(app)/intake/actions"
import { ToastStack } from "@/components/arc/toast-stack/toast-stack"
import type { RequestDetail } from "@/components/requests/detail-view"
import { IntakeLauncher } from "@/components/requests/intake-launcher"
import { NewRequestProvider } from "@/components/requests/new-request-provider"
import { PageStrip } from "@/components/shell/page-strip"
import { requestSchema } from "@/lib/request-schema"
import intakeMeta from "./intake.stories"
import detailMeta from "./request-detail.stories"
import requestsMeta, { RequestsShellFixture } from "./requests.stories"
import { DetailFixture, minimalRequest, viewer } from "./helpers/request-detail-fixture"

const requestId = "00000000-0000-4000-8000-000000000123"
const projectNames: Record<string, string> = {
  "00000000-0000-4000-8000-000000000456": "Website",
  "00000000-0000-4000-8000-000000000789": "Marketing",
}

/** The reviewed sample, kept in Storybook so a reload never loses the populated detail. */
const populatedLan13: RequestDetail = {
  ...minimalRequest,
  ...requestSchema.parse({
    title: "Customers abandon checkout when delivery costs appear late",
    description: "Delivery charges first appear on the payment step. Customers who expected the product-page price leave checkout when the total increases. The web checkout flow needs to make the total cost clear before payment, without increasing support contacts.",
    projectId: "00000000-0000-4000-8000-000000000456",
    requestType: "improvement", priority: "high",
    affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "",
    expectedImpact: {
      kind: "measurement", version: 2,
      primary: { key: "conversion", name: "", unit: "percent", current: 62, target: 75, noBaseline: false, check: "" },
      measurement: { audience: "all", audienceName: "", platform: "web", platformName: "", windowDays: 14, exactDates: false, startDate: "", endDate: "" },
      guardrails: [{ key: "support", name: "", unit: "percent", current: 4, noBaseline: false, operator: "at_most", limit: 6 }],
    },
  }),
  id: requestId, requestNumber: 13, createdAt: new Date("2026-10-16T09:00:00Z"),
  createdBy: viewer.id, creatorName: viewer.name,
  projectName: projectNames["00000000-0000-4000-8000-000000000456"],
  designReviews: [],
}

/** Local-only journey: the real form feeds the real detail view through mocked actions. */
function IntakeToDetail() {
  const draft = useRef<Parameters<typeof runTriage>[0] | null>(null)
  const saved = useRef<RequestDetail | null>(null)
  const [current, setCurrent] = useState<RequestDetail | null>(null)

  useEffect(() => {
    mocked(runTriage).mockImplementation(async input => {
      draft.current = structuredClone(input)
      return { success: true, triage: { classification: "problem", reframedProblem: null, extractedSolution: null }, token: "story-review-token" }
    })
    mocked(saveRequest).mockImplementation(async input => {
      if (!draft.current) return { success: false, error: { code: "save_failed", message: "Review this Request first." } }
      const values = requestSchema.parse(draft.current)
      const createdAt = new Date()
      saved.current = {
        ...values, id: requestId, requestNumber: 13, status: "open", createdAt,
        reframedProblem: input.editedProblemText, extractedSolution: null, classification: "problem",
        assignedTo: null, assigneeName: null, assigneeAvatarUrl: null,
        createdBy: viewer.id, creatorName: viewer.name,
        projectName: values.projectId ? projectNames[values.projectId] ?? null : null,
        designReviews: [],
      }
      return { success: true, requestId, created: { ...saved.current, createdAt: createdAt.toISOString() } }
    })
    getRouter().push.mockImplementation((href: string) => {
      if (href.split("?")[0] === `/requests/${requestId}` && saved.current) setCurrent(saved.current)
    })
    return () => {
      mocked(runTriage).mockReset()
      mocked(saveRequest).mockReset()
      getRouter().push.mockReset()
    }
  }, [])

  if (current) return <DetailFixture current={current} comments={[]} attachments={[]} />
  return <>
    <NewRequestProvider context={intakeMeta.args.context} draftOwnerId={intakeMeta.args.draftOwnerId}>
      <RequestsShellFixture {...requestsMeta.args} pathname="/intake">
        <PageStrip title="New Request" heading />
        <IntakeLauncher />
      </RequestsShellFixture>
    </NewRequestProvider>
    <ToastStack />
  </>
}

const meta = {
  title: "Intake/To Request detail",
  component: IntakeToDetail,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/intake" } } },
  beforeEach: () => {
    intakeMeta.beforeEach()
    detailMeta.beforeEach()
  },
} satisfies Meta<typeof IntakeToDetail>
export default meta
type Story = StoryObj<typeof meta>

export const Interactive: Story = {}

export const PopulatedLan13: Story = {
  name: "Populated LAN-13",
  parameters: {
    nextjs: { navigation: { pathname: `/requests/${requestId}` } },
    docs: { description: { story: "Illustrative LAN-13 data in the production Request detail components. Available immediately after a reload; no Request is written to a Lane workspace." } },
  },
  render: () => <DetailFixture current={populatedLan13} comments={[]} attachments={[]} />,
}

/** Guards the complete shell wiring, not just the detail component in isolation. */
export const CompleteSidebar: Story = {
  ...PopulatedLan13,
  name: "Complete sidebar",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    const openNavigation = async () => {
      if (canvasElement.querySelector("#lane-sidebar[inert]")) await userEvent.click(canvas.getByRole("button", { name: "Expand sidebar" }))
      const nav = await canvas.findByRole("navigation", { name: "Primary navigation" })
      await waitFor(() => expect(nav).toBeVisible())
      return within(nav)
    }
    let nav = await openNavigation()
    await userEvent.click(nav.getByRole("button", { name: "Search workspace" }))
    const search = await canvas.findByRole("combobox", { name: "Search workspace" })
    await userEvent.type(search, "LAN-13")
    const result = await canvas.findByRole("option", { name: /Customers abandon checkout when delivery costs appear late/ })
    await expect(result).toHaveAttribute("data-search-result", requestId)
    // Plan item 2.8, decision 1: Enter on an exact saved code opens that Request. This is its page, so search closes in place.
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(canvas.queryByRole("combobox", { name: "Search workspace" })).not.toBeInTheDocument())
    await expect(canvas.getByRole("heading", { name: populatedLan13.title })).toBeVisible()
    nav = await openNavigation()
    await userEvent.click(nav.getByRole("button", { name: "Search workspace" }))
    const again = await canvas.findByRole("combobox", { name: "Search workspace" })
    await userEvent.clear(again)
    await userEvent.type(again, "delivery costs{Enter}")
    await waitFor(() => expect(canvas.getByRole("option", { name: /Customers abandon checkout/ })).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await expect(canvas.getByRole("heading", { name: populatedLan13.title })).toBeVisible()
    nav = await openNavigation()
    for (const name of ["Website", "B2B App", "Marketing"]) {
      await expect(nav.getAllByRole("link", { name })).toHaveLength(1)
    }
    const notifications = nav.getByRole("button", { name: "Notifications" })
    await userEvent.click(notifications)
    const notificationPanel = await page.findByRole("dialog", { name: "Notifications" })
    await waitFor(() => expect(notificationPanel).toBeVisible())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument())
    await expect(notifications).toHaveFocus()
    await userEvent.click(nav.getByRole("button", { name: "New Project" }))
    await userEvent.type(nav.getByRole("textbox", { name: "Project name" }), "Checkout research{Enter}")
    await expect(await nav.findByRole("link", { name: "Checkout research" })).toBeVisible()
    await userEvent.click(nav.getByRole("button", { name: "Search workspace" }))
    const projectSearch = await canvas.findByRole("combobox", { name: "Search workspace" })
    await userEvent.clear(projectSearch)
    await userEvent.type(projectSearch, "Checkout research{Enter}")
    const projects = await canvas.findByRole("listbox", { name: "Search matches" })
    await expect(await within(projects).findByRole("option", { name: "Checkout research, Project" })).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await expect(canvas.getByRole("heading", { name: populatedLan13.title })).toBeVisible()
  },
}
