import { useEffect, useRef, useState, type ReactNode } from "react"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { expect, within } from "storybook/test"
import type { StoryContext } from "@storybook/nextjs-vite"
import { Button } from "@/components/arc/button/button"
import { ToastStack } from "@/components/arc/toast-stack/toast-stack"
import buttonStyles from "@/components/arc/button/button.module.css"
import { SidebarView } from "@/components/shell/sidebar-view"
import { RequestDetailView, type RequestComment, type RequestDetail } from "@/components/requests/detail-view"
import { DesignReviewPanel } from "@/components/requests/design-review-panel"
import { DesignReviewFallback } from "@/components/requests/design-review-fallback"
import { useOptionalDetailRequest } from "@/components/requests/detail-context"
import { ListAnnouncerProvider } from "@/components/requests/list-announcer"
import { RequestListViewProvider, type DetailSessionPatch } from "@/components/requests/list-view-state"
import { PendingMutationsProvider, usePendingMutations } from "@/components/requests/pending-mutations-provider"
import { CommentForm } from "@/app/(app)/requests/[id]/comment-form"
import { AttachmentDownload } from "@/app/(app)/requests/[id]/attachment-download"
import { LifecycleButtons } from "@/app/(app)/requests/[id]/lifecycle-buttons"
import { RequestWorkspaceKeyboard } from "@/app/(app)/request-workspace-keyboard"
import { addReviewRound, recordReviewResponse, withdrawReviewRound, type RequestReviewState, type ReviewPerson } from "@/lib/request-review"

// Plan item 2.5: Request detail as requests-workspace.tsx composes it, under the
// layout's providers. Illustrative fixture content only; Storybook mocks every
// server action and the router.

export const context = { orgId: "fixture-workspace" }
export const viewer = { id: "fixture-viewer", name: "Alex Morgan" }
export const websiteId = "11111111-1111-4111-8111-111111111111"

export const request: RequestDetail = {
  id: "fixture-request", requestNumber: 12, priority: "none", title: "Show a delivery date before checkout", description: "Customers have to begin checkout before they can see when their order will arrive.",
  reframedProblem: "Customers cannot find the delivery date before checkout", extractedSolution: "Show the expected delivery date on the product page.", classification: "hybrid",
  affectedPeople: "Customers comparing products with different delivery dates.", desiredChange: "Know the expected delivery date before starting checkout.", observedEvidence: "Support conversations mention uncertainty about delivery dates.", uncertainty: "We do not yet know how often this prevents a purchase.", usefulLink: "https://example.com/research/delivery",
  expectedImpact: { kind: "metric", metric: "Checkouts started with a known delivery date", baseline: 40, target: 70, unit: "%", source: "Checkout analytics", reviewAfterDays: 14 },
  status: "open", assignedTo: null, createdBy: "fixture-person", createdAt: new Date("2026-10-01T09:00:00Z"), creatorName: "Sam Lee", assigneeName: null, assigneeAvatarUrl: null,
  projectId: websiteId, projectName: "Website", requestType: "improvement",
}
export const inProgress: RequestDetail = { ...request, status: "in_progress", assignedTo: "fixture-person-2", assigneeName: "Taylor Chen" }
export const minimalRequest: RequestDetail = { ...request, reframedProblem: null, extractedSolution: null, classification: "problem", affectedPeople: null, desiredChange: null, observedEvidence: null, uncertainty: null, usefulLink: null, expectedImpact: null, projectId: null, projectName: null, requestType: null }
export const comments: RequestComment[] = [{ id: "fixture-comment", body: "Could we compare the product-page and checkout experiences before deciding where this belongs?", createdAt: new Date("2026-10-01T10:00:00Z"), authorName: "Sam Lee" }]
export const attachments = [{ id: "fixture-file", fileName: "Delivery context.png", mimeType: "image/png", sizeBytes: 182400, uploadedAt: new Date("2026-10-01T09:00:00Z") }]
/** A five-Request list order, as the list records it when one is opened from it. */
export const sequenceIds = ["fixture-request-0", "fixture-request", "fixture-request-2", "fixture-request-3", "fixture-request-4"]

const people: ReviewPerson[] = [{ id: viewer.id, name: viewer.name }, { id: "sam", name: "Sam Lee" }, { id: "taylor", name: "Taylor Chen" }]
export const waitingReview: RequestReviewState = { version: 1, reviews: [{ id: "round-1", designUrl: "https://example.com/design/checkout?version=1", question: "Is the delivery date clear before payment?", requestedBy: people[1], requestedAt: "2026-10-09T10:00:00.000Z", reviewers: [people[2]], responses: [], withdrawal: null }] }
/** Plan item 2.6: the same round with the fixture viewer as its named reviewer, so the panel offers the response form on arrival. */
export const waitingOnViewer: RequestReviewState = { ...waitingReview, reviews: [{ ...waitingReview.reviews[0], reviewers: [people[0]] }] }

/** The production panel with in-memory saves, reporting open forms to detail as design-review.tsx does. */
function DetailReview({ initialState, guest }: { initialState: RequestReviewState; guest: boolean }) {
  const reportForm = useOptionalDetailRequest()?.reportForm
  const saved = useRef(initialState)
  const [snapshot, setSnapshot] = useState(initialState)
  const save = (transition: () => RequestReviewState) => { saved.current = transition(); setSnapshot(saved.current); return Promise.resolve({ state: saved.current }) }
  return <DesignReviewPanel id="ask-for-review" onFormOpenChange={reportForm} initialState={snapshot} currentUserId={viewer.id} viewer={people[0]} canRequest={!guest} canManage={!guest}
    onFindReviewers={async query => ({ members: people.filter(person => person.name.toLowerCase().includes(query.toLowerCase())) })}
    onRequest={input => save(() => addReviewRound(saved.current, input, people.filter(person => input.reviewerIds.includes(person.id)), people[0], "2026-10-09T10:10:00.000Z", `round-${saved.current.reviews.length + 1}`))}
    onRespond={input => save(() => recordReviewResponse(saved.current, input, people[0], "2026-10-09T10:20:00.000Z", `response-${saved.current.version + 1}`))}
    onWithdraw={input => save(() => withdrawReviewRound(saved.current, input, people[0], "2026-10-09T10:30:00.000Z", true))} />
}

/** Test hook, outside <main>: the Request ids the overlay still holds a layer for, space separated. */
function PendingLayers() {
  const overlay = usePendingMutations()
  return <span hidden data-pending-layers={Object.keys(overlay?.patches ?? {}).join(" ")} />
}

export type DetailFixtureProps = {
  current?: RequestDetail
  guest?: boolean
  comments?: RequestComment[]
  attachments?: typeof attachments
  /** Render Ask for review as requests-workspace.tsx does (members always; guests once a review exists). */
  review?: RequestReviewState | null
  /** A detail session, as if the Request had been opened from the list. */
  session?: DetailSessionPatch
  /** Other Requests the mocked router can navigate to with previous and next. */
  others?: RequestDetail[]
  /** Shows "Deliver stale server render" and "Deliver fresh server render" outside <main>, standing in for a revalidated payload. */
  fresh?: { request?: RequestDetail; comments?: RequestComment[] }
  /** Ask for review starts as the lazy chunk's fallback; "Load Ask for review" outside <main> swaps in the panel. */
  lazyReview?: boolean
}

/** The layout's providers, the shell, and Request detail keyed by Request id, as in production. */
export function DetailFixture({ current = request, guest = false, comments: initialComments = comments, attachments: files = attachments, review = { version: 0, reviews: [] }, session, others = [], fresh, lazyReview = false }: DetailFixtureProps) {
  const [render, setRender] = useState({ request: current, comments: initialComments })
  const [reviewLoaded, setReviewLoaded] = useState(!lazyReview)
  // Previous and next replace the URL; here the mocked router swaps the Request, as the server render would.
  useEffect(() => {
    if (!others.length) return
    getRouter().replace.mockImplementation((href: string) => {
      const next = others.find(item => href === `/requests/${item.id}`)
      if (next) setRender({ request: next, comments: [] })
    })
  }, [others])
  const shown = render.request
  const showReview = review && (!guest || review.reviews.length > 0)
  return <RequestListViewProvider initialDetailSession={session}>
    <PendingMutationsProvider>
      <SidebarView workspaceName="Lane Studio" fullName={viewer.name} email="alex@example.test" role={guest ? "guest" : "member"} pathname={`/requests/${shown.id}`} statusFilter="all" notifications={null} onSignOut={() => {}} linearPreviewAutoCollapse>
        <div data-slot="requests-workspace" className="flex min-h-0 flex-1 sm:h-full sm:overflow-hidden">
          <RequestWorkspaceKeyboard selectedRequestId={shown.id} returnHref="/" />
          <ListAnnouncerProvider key={shown.id}>
            <RequestDetailView request={shown} comments={render.comments} attachments={files} isGuest={guest} viewer={viewer} orgId={context.orgId}
              lifecycleActions={<LifecycleButtons requestId={shown.id} status={shown.status} context={context} isGuest={guest} />}
              commentForm={<CommentForm requestId={shown.id} context={context} />}
              attachmentAction={attachment => <AttachmentDownload attachmentId={attachment.id} context={context} />}
              designReview={!showReview ? undefined : reviewLoaded ? <DetailReview initialState={review} guest={guest} /> : <DesignReviewFallback />} />
          </ListAnnouncerProvider>
        </div>
      </SidebarView>
      <ToastStack label="Messages" />
      <PendingLayers />
      {!reviewLoaded && <Button variant="secondary" size="sm" className="fixed right-4 bottom-4 z-50" onClick={() => setReviewLoaded(true)}>Load Ask for review</Button>}
      {fresh && <div className="fixed right-4 bottom-4 z-50 flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setRender(previous => ({ request: { ...previous.request }, comments: [...previous.comments] }))}>Deliver stale server render</Button>
        <Button variant="secondary" size="sm" onClick={() => setRender(previous => ({ request: fresh.request ?? previous.request, comments: fresh.comments ?? previous.comments }))}>Deliver fresh server render</Button>
      </div>}
    </PendingMutationsProvider>
  </RequestListViewProvider>
}

export const phoneDark = { theme: "dark", viewport: { value: "mobile", isRotated: false } }
export const desktopLight = { theme: "light", viewport: { value: "desktop", isRotated: false } }

/** Pinned stories first prove the browser really uses the pinned width. */
export async function expectPinnedViewport({ globals, parameters }: Pick<StoryContext, "globals" | "parameters">) {
  const name = globals.viewport?.value
  await expect(name, "This story pins a viewport").toMatch(/^(mobile|desktop)$/)
  const width = Number.parseInt(parameters.viewport.options[name].styles.width, 10)
  await expect(window.innerWidth, "The browser must actually use the pinned viewport").toBe(width)
}

export const main = (canvasElement: HTMLElement) => within(canvasElement).getByRole("main")
export const strip = (canvasElement: HTMLElement) => main(canvasElement).querySelector<HTMLElement>('[data-slot="page-strip"]')!
export const detail = (canvasElement: HTMLElement) => main(canvasElement).querySelector<HTMLElement>("[data-detail]")!
/** The panel from 960px of content width, else the state line's sheet; stories read the visible one. */
export const panelShown = (canvasElement: HTMLElement) => {
  const panel = main(canvasElement).querySelector<HTMLElement>("[data-detail-panel]")!
  return panel.getClientRects().length > 0
}
export const statusCell = (canvasElement: HTMLElement) => main(canvasElement).querySelector<HTMLElement>("[data-detail-panel] [data-detail-status]")!
export const stateLine = (canvasElement: HTMLElement) => main(canvasElement).querySelector<HTMLElement>("[data-detail-state-line]")!
/** The overlay's layers by Request id (the fixture's test hook); "" when nothing is pending. */
export const pendingLayers = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>("[data-pending-layers]")!.dataset.pendingLayers
export const announcer = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>('[data-slot="list-announcer"]')!
/** Filled (primary) Arc buttons that are painted. */
export const filledButtons = (canvasElement: HTMLElement) => [...main(canvasElement).querySelectorAll<HTMLElement>(`.${buttonStyles.primary}`)].filter(element => element.getClientRects().length > 0)

export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

export function ShellOnly({ children, guest = false }: { children: ReactNode; guest?: boolean }) {
  return <RequestListViewProvider><SidebarView workspaceName="Lane Studio" fullName={viewer.name} email="alex@example.test" role={guest ? "guest" : "member"} pathname="/requests/fixture-request" statusFilter="all" notifications={null} onSignOut={() => {}} linearPreviewAutoCollapse>{children}</SidebarView></RequestListViewProvider>
}
