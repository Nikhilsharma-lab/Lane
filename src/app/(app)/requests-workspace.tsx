import Link from "next/link"
import { redirect } from "next/navigation"
import { and, asc, desc, eq } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import {
  ArrowLeft,
  ChevronRight,
  Inbox,
  MessageSquare,
  Plus,
  UserRound,
  X,
} from "lucide-react"

import { db, comments, profiles, requests } from "@/db"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { IdentityMark } from "@/components/ui/identity-mark"
import {
  Row,
  RowActions,
  RowContent,
  RowDescription,
  RowGroup,
  RowLeading,
  RowMeta,
  RowTitle,
} from "@/components/ui/row"
import { Typography } from "@/components/ui/typography"
import { getWorkspace } from "@/lib/ensure-workspace"
import { relativeTime } from "@/lib/relative-time"
import {
  requestDetailHref,
  requestListHref,
  type RequestStatusFilter,
} from "@/lib/request-workspace"
import {
  statusBadgeClass,
  statusDotClass,
  statusLabel,
} from "@/lib/request-status"
import { cn } from "@/lib/utils"
import { CommentForm } from "./requests/[id]/comment-form"
import { LifecycleButtons } from "./requests/[id]/lifecycle-buttons"
import { RequestStatusFilter as StatusFilter } from "./request-status-filter"
import { RequestWorkspaceKeyboard } from "./request-workspace-keyboard"

const MAX_REQUESTS_QUERY = 200
const MAX_DONE_VISIBLE = 25
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RequestStatus = "open" | "in_progress" | "done"

type RequestListItem = {
  id: string
  title: string
  reframedProblem: string | null
  status: RequestStatus
  createdAt: Date
  creatorName: string | null
  assigneeName: string | null
}

type RequestDetail = {
  id: string
  title: string
  description: string
  reframedProblem: string | null
  extractedSolution: string | null
  classification: "problem" | "solution" | "hybrid" | null
  status: RequestStatus
  assignedTo: string | null
  createdBy: string
  createdAt: Date
  creatorName: string | null
  assigneeName: string | null
}

type RequestComment = {
  id: string
  body: string
  createdAt: Date
  authorName: string | null
}

function classificationLabel(classification: RequestDetail["classification"]) {
  switch (classification) {
    case "problem":
      return "Problem-framed"
    case "solution":
      return "Solution → Reframed"
    case "hybrid":
      return "Hybrid → Reframed"
    default:
      return null
  }
}

function RequestListEmpty({
  isGuest,
  filter,
}: {
  isGuest: boolean
  filter: RequestStatusFilter
}) {
  if (filter !== "all") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <Typography as="p" role="sectionTitle">
          Nothing in {statusLabel(filter)}
        </Typography>
        <Typography
          as="p"
          role="support"
          className="mt-1 max-w-[30ch] text-pretty text-muted-foreground"
        >
          This filter is clear. Other Requests are still available.
        </Typography>
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "mt-4"
          )}
        >
          Show all Requests
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Inbox aria-hidden="true" className="size-4" strokeWidth={1.8} />
      </span>
      <Typography as="p" role="sectionTitle">
        No Requests yet
      </Typography>
      <Typography
        as="p"
        role="support"
        className="mt-1 max-w-[34ch] text-pretty text-muted-foreground"
      >
        {isGuest
          ? "Requests you submit will appear here."
          : "Lane starts when someone describes the first problem worth solving."}
      </Typography>
      <Link
        href="/intake"
        className={cn(buttonVariants({ size: "sm" }), "mt-4")}
      >
        <Plus aria-hidden="true" data-icon="inline-start" />
        {isGuest ? "Submit a Request" : "Submit the first Request"}
      </Link>
    </div>
  )
}

function RequestRow({
  request,
  selected,
  filter,
}: {
  request: RequestListItem
  selected: boolean
  filter: RequestStatusFilter
}) {
  const problem = request.reframedProblem ?? request.title

  return (
    <Row
      render={<li />}
      interactive
      className={cn(
        "min-h-[88px] items-start px-4 py-3 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 has-[a:focus-visible]:ring-inset",
        selected && "bg-brand-soft hover:bg-brand-soft"
      )}
    >
      <RowLeading className="self-start pt-1.5">
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            statusDotClass(request.status)
          )}
        />
        <span className="sr-only">{statusLabel(request.status)}</span>
      </RowLeading>
      <RowContent className="gap-1">
        <RowTitle className="line-clamp-2">
          <Link
            id={`request-${request.id}`}
            href={requestDetailHref(request.id, filter)}
            aria-current={selected ? "page" : undefined}
            className="break-words after:absolute after:inset-0 focus-visible:outline-none"
          >
            {problem}
          </Link>
        </RowTitle>
        {request.reframedProblem && (
          <RowDescription className="line-clamp-1">
            {request.title}
          </RowDescription>
        )}
        <RowMeta className="mt-0.5 line-clamp-1">
          {request.reframedProblem ? "Reframed · " : ""}
          {request.creatorName || "Unknown member"} ·{" "}
          {relativeTime(request.createdAt)}
          {request.status === "in_progress" && request.assigneeName
            ? ` · ${request.assigneeName}`
            : ""}
        </RowMeta>
      </RowContent>
      <RowActions
        aria-hidden="true"
        className={cn(
          "w-6 self-center text-muted-foreground",
          selected && "text-brand"
        )}
      >
        <ChevronRight className="size-4" strokeWidth={1.8} />
      </RowActions>
    </Row>
  )
}

function RequestListPane({
  requests: allRequests,
  selectedRequestId,
  filter,
  isGuest,
}: {
  requests: RequestListItem[]
  selectedRequestId?: string
  filter: RequestStatusFilter
  isGuest: boolean
}) {
  const open = allRequests.filter((request) => request.status === "open")
  const inProgress = allRequests.filter(
    (request) => request.status === "in_progress"
  )
  const doneAll = allRequests.filter((request) => request.status === "done")
  const done = doneAll.slice(0, MAX_DONE_VISIBLE)
  const allGroups = [
    {
      key: "open" as const,
      label: statusLabel("open"),
      requests: open,
    },
    {
      key: "in_progress" as const,
      label: statusLabel("in_progress"),
      requests: inProgress,
    },
    {
      key: "done" as const,
      label: statusLabel("done"),
      requests: done,
    },
  ]
  const visibleGroups =
    filter === "all"
      ? allGroups
      : allGroups.filter((group) => group.key === filter)
  const visibleCount = visibleGroups.reduce(
    (count, group) => count + group.requests.length,
    0
  )

  return (
    <aside
      aria-label="Request list"
      className={cn(
        "min-w-0 flex-1 flex-col bg-card lg:w-[360px] lg:flex-none lg:border-r xl:w-[400px]",
        selectedRequestId ? "hidden lg:flex" : "flex"
      )}
    >
      <header className="shrink-0 border-b px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <Typography as="h1" role="pageTitle">
              {isGuest ? "My Requests" : "Requests"}
            </Typography>
            <Typography
              as="span"
              role="meta"
              className="mt-0.5 block text-muted-foreground tabular-nums"
            >
              {filter === "all"
                ? `${allRequests.length} total`
                : `${visibleCount} ${statusLabel(filter).toLocaleLowerCase()}`}
            </Typography>
          </span>
          <Link
            href="/intake"
            aria-label="New Request"
            className={buttonVariants({ size: "sm" })}
          >
            <Plus
              aria-hidden="true"
              data-icon="inline-start"
              strokeWidth={1.8}
            />
            <span className="hidden sm:inline">New Request</span>
          </Link>
        </div>
        <div className="mt-4">
          <StatusFilter value={filter} />
        </div>
      </header>

      {allRequests.length === 0 ||
      (filter !== "all" && visibleCount === 0) ? (
        <RequestListEmpty isGuest={isGuest} filter={filter} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleGroups.map((group) => (
            <section
              key={group.key}
              aria-labelledby={`requests-${group.key}`}
              className="py-3"
            >
              <div className="flex items-center gap-2 px-4 pb-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
                    statusDotClass(group.key)
                  )}
                />
                <Typography
                  as="h2"
                  role="label"
                  id={`requests-${group.key}`}
                >
                  {group.label}
                </Typography>
                <Typography
                  as="span"
                  role="meta"
                  className="text-muted-foreground tabular-nums"
                >
                  {group.requests.length}
                </Typography>
              </div>
              {group.requests.length > 0 ? (
                <RowGroup render={<ul />}>
                  {group.requests.map((request) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      selected={request.id === selectedRequestId}
                      filter={filter}
                    />
                  ))}
                </RowGroup>
              ) : (
                <Typography
                  as="p"
                  role="support"
                  className="px-4 py-3 text-muted-foreground"
                >
                  No {group.label.toLocaleLowerCase()} Requests
                </Typography>
              )}
              {group.key === "done" && doneAll.length > done.length && (
                <Typography
                  as="p"
                  role="micro"
                  className="px-4 pt-2 text-muted-foreground"
                >
                  Showing the latest {MAX_DONE_VISIBLE} of {doneAll.length}
                </Typography>
              )}
            </section>
          ))}
        </div>
      )}
    </aside>
  )
}

function NoRequestSelected() {
  return (
    <div className="hidden min-w-0 flex-1 items-center justify-center bg-background px-8 text-center lg:flex">
      <div>
        <span className="mx-auto mb-4 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Inbox aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </span>
        <Typography as="h2" role="sectionTitle">
          Select a Request
        </Typography>
        <Typography
          as="p"
          role="support"
          className="mt-1 max-w-[32ch] text-pretty text-muted-foreground"
        >
          Its problem, context, people, and conversation will open here.
        </Typography>
      </div>
    </div>
  )
}

function RequestUnavailable({ returnHref }: { returnHref: string }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center border-b px-3 sm:px-4">
        <Link
          href={returnHref}
          aria-label="Back to Request list"
          className="flex size-touch-target items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-control-product"
        >
          <ArrowLeft
            aria-hidden="true"
            className="size-4 lg:hidden"
            strokeWidth={1.8}
          />
          <X
            aria-hidden="true"
            className="hidden size-4 lg:block"
            strokeWidth={1.8}
          />
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
        <div>
          <Typography as="h2" role="sectionTitle">
            Request unavailable
          </Typography>
          <Typography
            as="p"
            role="support"
            className="mt-1 max-w-[34ch] text-pretty text-muted-foreground"
          >
            This Request could not be found or is not available in this
            workspace.
          </Typography>
          <Link
            href={returnHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "mt-4"
            )}
          >
            Back to Requests
          </Link>
        </div>
      </div>
    </section>
  )
}

function Comments({
  comments: requestComments,
}: {
  comments: RequestComment[]
}) {
  return (
    <section aria-labelledby="request-conversation">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare
          aria-hidden="true"
          className="size-4 text-muted-foreground"
          strokeWidth={1.8}
        />
        <Typography
          as="h2"
          role="sectionTitle"
          id="request-conversation"
        >
          Conversation
        </Typography>
        <Typography
          as="span"
          role="meta"
          className="text-muted-foreground tabular-nums"
        >
          {requestComments.length}
        </Typography>
      </div>

      {requestComments.length > 0 ? (
        <RowGroup aria-label="Request comments">
          {requestComments.map((comment) => (
            <Row key={comment.id} className="items-start py-3">
              <RowLeading className="self-start pt-0.5">
                <IdentityMark
                  label={comment.authorName}
                  kind={comment.authorName ? "person" : "unknown"}
                />
              </RowLeading>
              <RowContent className="gap-1.5">
                <Typography
                  as="div"
                  role="meta"
                  className="flex min-w-0 items-center gap-2 text-muted-foreground"
                >
                  <span className="truncate font-semibold text-foreground">
                    {comment.authorName ?? "Unknown member"}
                  </span>
                  <span className="shrink-0">
                    {relativeTime(comment.createdAt)}
                  </span>
                </Typography>
                <Typography
                  as="p"
                  role="ui"
                  className="whitespace-pre-wrap"
                >
                  {comment.body}
                </Typography>
              </RowContent>
              <RowActions
                aria-hidden="true"
                className="w-8 self-start"
              />
            </Row>
          ))}
        </RowGroup>
      ) : (
        <Typography
          as="p"
          role="support"
          className="border-y px-2 py-5 text-muted-foreground"
        >
          No comments yet. Start the conversation.
        </Typography>
      )}
    </section>
  )
}

function RequestDetailPane({
  request,
  comments: requestComments,
  filter,
  orgId,
  isGuest,
}: {
  request: RequestDetail
  comments: RequestComment[]
  filter: RequestStatusFilter
  orgId: string
  isGuest: boolean
}) {
  const returnHref = requestListHref(filter)
  const classification = classificationLabel(request.classification)
  const problem = request.reframedProblem ?? request.title

  return (
    <section
      aria-label={`Request detail: ${problem}`}
      className="flex min-w-0 flex-1 flex-col bg-background"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b px-3 py-2 sm:px-4 lg:px-6">
        <Link
          href={returnHref}
          aria-label="Close Request detail"
          className="flex size-touch-target shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-control-product"
        >
          <ArrowLeft
            aria-hidden="true"
            className="size-4 lg:hidden"
            strokeWidth={1.8}
          />
          <X
            aria-hidden="true"
            className="hidden size-4 lg:block"
            strokeWidth={1.8}
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={statusBadgeClass(request.status)}
          >
            {statusLabel(request.status)}
          </Badge>
          {classification && (
            <Typography
              as="span"
              role="micro"
              className="text-muted-foreground"
            >
              {classification}
            </Typography>
          )}
          <Typography
            as="span"
            role="meta"
            className="hidden text-muted-foreground sm:inline"
          >
            Submitted {relativeTime(request.createdAt)}
          </Typography>
        </div>
        {!isGuest && (
          <div className="hidden shrink-0 lg:block">
            <LifecycleButtons
              requestId={request.id}
              status={request.status}
              context={{ orgId }}
              filter={filter}
            />
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto w-full max-w-[760px] px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
          <section aria-labelledby="request-problem">
            <Typography
              as="p"
              role="micro"
              className="mb-2 font-semibold tracking-[0.08em] text-brand uppercase"
            >
              Problem
            </Typography>
            <Typography
              as="h1"
              role="pageTitle"
              id="request-problem"
              className="max-w-[30ch]"
            >
              {problem}
            </Typography>
            {!request.reframedProblem && (
              <Typography
                as="p"
                role="prose"
                className="mt-4 whitespace-pre-wrap text-muted-foreground"
              >
                {request.description}
              </Typography>
            )}
          </section>

          {request.reframedProblem && (
            <section
              aria-labelledby="request-original"
              className="mt-8 border-t pt-8"
            >
              <Typography
                as="h2"
                role="sectionTitle"
                id="request-original"
              >
                Original Request
              </Typography>
              <Typography
                as="p"
                role="control"
                className="mt-3 font-semibold"
              >
                {request.title}
              </Typography>
              <Typography
                as="p"
                role="prose"
                className="mt-2 whitespace-pre-wrap text-muted-foreground"
              >
                {request.description}
              </Typography>
            </section>
          )}

          {request.extractedSolution && (
            <section
              aria-labelledby="request-solution"
              className="mt-8 border-t pt-8"
            >
              <Typography
                as="h2"
                role="sectionTitle"
                id="request-solution"
              >
                Proposed solution
              </Typography>
              <Typography
                as="p"
                role="prose"
                className="mt-3 whitespace-pre-wrap text-muted-foreground"
              >
                {request.extractedSolution}
              </Typography>
            </section>
          )}

          <section
            aria-labelledby="request-people"
            className="mt-8 border-t pt-8"
          >
            <Typography
              as="h2"
              role="sectionTitle"
              id="request-people"
              className="mb-3"
            >
              People
            </Typography>
            <RowGroup aria-label="Request people">
              <Row>
                <RowLeading>
                  <IdentityMark
                    label={request.creatorName}
                    kind={request.creatorName ? "person" : "unknown"}
                  />
                </RowLeading>
                <RowContent>
                  <RowTitle>
                    {request.creatorName ?? "Unknown member"}
                  </RowTitle>
                  <RowDescription>
                    Submitted this Request ·{" "}
                    {relativeTime(request.createdAt)}
                  </RowDescription>
                </RowContent>
                <RowActions aria-hidden="true" className="w-8" />
              </Row>
              {!isGuest && (
                <Row>
                  <RowLeading>
                    {request.assigneeName ? (
                      <IdentityMark label={request.assigneeName} />
                    ) : (
                      <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <UserRound
                          aria-hidden="true"
                          className="size-4"
                          strokeWidth={1.8}
                        />
                      </span>
                    )}
                  </RowLeading>
                  <RowContent>
                    <RowTitle>
                      {request.assigneeName ?? "No one yet"}
                    </RowTitle>
                    <RowDescription>
                      {request.assigneeName
                        ? "Owns this Request"
                        : "Available for anyone to pick up"}
                    </RowDescription>
                  </RowContent>
                  <RowActions aria-hidden="true" className="w-8" />
                </Row>
              )}
            </RowGroup>
          </section>

          <div className="mt-8 border-t pt-8">
            <Comments comments={requestComments} />
          </div>
        </article>
      </div>

      <footer className="shrink-0 border-t bg-card px-3 py-3 sm:px-4 lg:px-6">
        <div className="mx-auto w-full max-w-[760px]">
          {!isGuest && (
            <div className="mb-3 lg:hidden">
              <LifecycleButtons
                requestId={request.id}
                status={request.status}
                context={{ orgId }}
                filter={filter}
                fullWidth
              />
            </div>
          )}
          <CommentForm requestId={request.id} context={{ orgId }} />
        </div>
      </footer>
    </section>
  )
}

export async function RequestsWorkspace({
  selectedRequestId,
  filter,
}: {
  selectedRequestId?: string
  filter: RequestStatusFilter
}) {
  const workspace = await getWorkspace()
  if (!workspace) redirect("/login")
  if (workspace.needsOnboarding) redirect("/onboarding")

  const isGuest = workspace.role === "guest"
  const assignee = alias(profiles, "request_list_assignee")

  const allRequests = await db
    .select({
      id: requests.id,
      title: requests.title,
      reframedProblem: requests.reframedProblem,
      status: requests.status,
      createdAt: requests.createdAt,
      creatorName: profiles.fullName,
      assigneeName: assignee.fullName,
    })
    .from(requests)
    .leftJoin(profiles, eq(requests.createdBy, profiles.id))
    .leftJoin(assignee, eq(requests.assignedTo, assignee.id))
    .where(
      isGuest
        ? and(
            eq(requests.orgId, workspace.orgId),
            eq(requests.createdBy, workspace.userId)
          )
        : eq(requests.orgId, workspace.orgId)
    )
    .orderBy(desc(requests.createdAt))
    .limit(MAX_REQUESTS_QUERY)

  let selectedRequest: RequestDetail | undefined
  let requestComments: RequestComment[] = []

  if (selectedRequestId && UUID_RE.test(selectedRequestId)) {
    const creator = alias(profiles, "request_detail_creator")
    const selectedAssignee = alias(profiles, "request_detail_assignee")
    const [request] = await db
      .select({
        id: requests.id,
        title: requests.title,
        description: requests.description,
        reframedProblem: requests.reframedProblem,
        extractedSolution: requests.extractedSolution,
        classification: requests.classification,
        status: requests.status,
        assignedTo: requests.assignedTo,
        createdBy: requests.createdBy,
        createdAt: requests.createdAt,
        creatorName: creator.fullName,
        assigneeName: selectedAssignee.fullName,
      })
      .from(requests)
      .leftJoin(creator, eq(requests.createdBy, creator.id))
      .leftJoin(
        selectedAssignee,
        eq(requests.assignedTo, selectedAssignee.id)
      )
      .where(
        isGuest
          ? and(
              eq(requests.id, selectedRequestId),
              eq(requests.orgId, workspace.orgId),
              eq(requests.createdBy, workspace.userId)
            )
          : and(
              eq(requests.id, selectedRequestId),
              eq(requests.orgId, workspace.orgId)
            )
      )

    selectedRequest = request

    if (selectedRequest) {
      requestComments = await db
        .select({
          id: comments.id,
          body: comments.body,
          createdAt: comments.createdAt,
          authorName: profiles.fullName,
        })
        .from(comments)
        .leftJoin(profiles, eq(comments.authorId, profiles.id))
        .where(eq(comments.requestId, selectedRequest.id))
        .orderBy(asc(comments.createdAt))
    }
  }

  const returnHref = requestListHref(filter)

  return (
    <main
      data-slot="requests-workspace"
      className="flex min-h-0 flex-1 bg-background lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden xl:h-screen"
    >
      <RequestWorkspaceKeyboard
        selectedRequestId={selectedRequestId}
        returnHref={returnHref}
      />
      <RequestListPane
        requests={allRequests}
        selectedRequestId={selectedRequestId}
        filter={filter}
        isGuest={isGuest}
      />
      {selectedRequest ? (
        <RequestDetailPane
          request={selectedRequest}
          comments={requestComments}
          filter={filter}
          orgId={workspace.orgId}
          isGuest={isGuest}
        />
      ) : selectedRequestId ? (
        <RequestUnavailable returnHref={returnHref} />
      ) : (
        <NoRequestSelected />
      )}
    </main>
  )
}
