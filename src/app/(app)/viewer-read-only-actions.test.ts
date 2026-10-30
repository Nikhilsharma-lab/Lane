import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";

/**
 * #210: a Viewer reads everything a Member reads and changes nothing. Every server action that changes the
 * workspace is called here as a Viewer, with input it would accept from a Member, and must refuse with the
 * Viewer copy and leave the workspace exactly as it was. The Viewer is also the creator of a Request (a Member
 * made a Viewer later), so "the creator may change their own Request" can't let them through either.
 */

const ORG = "org_viewer_read_only";
const VIEWER = "user_viewer_ro", MEMBER = "user_viewer_ro_member", ADMIN = "user_viewer_ro_admin";
const session = vi.hoisted(() => ({ userId: "user_viewer_ro", orgId: "org_viewer_read_only", orgRole: "org:viewer" }));
const roster = vi.hoisted(() => new Map<string, string>([
  ["user_viewer_ro", "org:viewer"], ["user_viewer_ro_member", "org:member"], ["user_viewer_ro_admin", "org:admin"],
]));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async () => ({
        totalCount: roster.size,
        data: [...roster].map(([userId, role]) => ({
          organization: { id: session.orgId }, role,
          publicUserData: { userId, identifier: `${userId}@example.test`, firstName: userId },
        })),
      }),
      getOrganizationInvitationList: async () => ({ totalCount: 0, data: [] }),
    },
  }),
}));

let connection: ReturnType<typeof postgres>;
let ownRequest: string, membersRequest: string, guestSubmission: string, definitionId: string, otherDefinitionId: string, reviewerId: string;

const ctx = { orgId: ORG };
const change = (requestId: string) => ({ orgId: ORG, requestId, expectedRevision: 1, operationId: randomUUID() });
const asViewer = () => { session.userId = VIEWER; session.orgId = ORG; session.orgRole = "org:viewer"; };

/** Everything a refused change could have touched, read straight from the database. */
async function workspaceState() {
  return {
    requests: await connection`select id, status::text, priority::text, title, agreement_revision, assigned_to, updated_at, release_state, outcome_closure, exception_closure, taken_on_by from requests where org_id = ${ORG} order by id`,
    comments: await connection`select count(*)::int as n from comments c join requests r on r.id = c.request_id where r.org_id = ${ORG}`,
    reviewers: await connection`select request_id, reviewers from request_agreements where org_id = ${ORG} order by request_id`,
    attachments: await connection`select count(*)::int as n from request_attachments where org_id = ${ORG}`,
    labels: await connection`select count(*)::int as n from workspace_labels where org_id = ${ORG}`,
    projects: await connection`select count(*)::int as n from projects where org_id = ${ORG}`,
    metrics: await connection`select id, name, unit, archived_at, merged_into_id from metric_definitions where org_id = ${ORG} order by id`,
    delivery: await connection`select count(*)::int as n from delivery_preferences where org_id = ${ORG}`,
    quarterNotes: await connection`select count(*)::int as n from quarter_notes where org_id = ${ORG}`,
    slack: await connection`select count(*)::int as n from slack_connections where org_id = ${ORG}`,
    billing: await connection`select plan_state, founding_reserved_until from workspace_billing where org_id = ${ORG}`,
    sameProblem: await connection`select request_id, group_id from same_problem_members where org_id = ${ORG} order by request_id`,
    sameProblemHistory: await connection`select count(*)::int as n from same_problem_events where org_id = ${ORG}`,
  };
}

/** The refusal a Viewer gets, wherever an action keeps its message. */
function refusalOf(result: unknown): string | undefined {
  const r = result as { error?: unknown; message?: unknown; failed?: { error: string }[] };
  if (typeof r?.error === "string") return r.error;
  if (r?.error && typeof r.error === "object" && "message" in r.error) return String((r.error as { message: unknown }).message);
  return undefined;
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(databaseUrl, { max: 2, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Viewer read-only','viewer-read-only')`;
  for (const id of [VIEWER, MEMBER, ADMIN]) await connection`insert into profiles (id,full_name,email,role) values (${id},${id},${id + "@example.test"},'pm')`;
  [{ id: ownRequest }] = await connection`insert into requests (org_id,title,description,created_by,agreement_revision) values (${ORG},'Filed while a Member','Checkout fails on mobile',${VIEWER},1) returning id`;
  [{ id: membersRequest }] = await connection`insert into requests (org_id,title,description,created_by,agreement_revision) values (${ORG},'A Member''s Request','Search is slow',${MEMBER},1) returning id`;
  [{ id: guestSubmission }] = await connection`insert into requests (org_id,title,description,created_by,agreement_revision,guest_submission) values (${ORG},'A Guest submission','Exports are hard to find',${MEMBER},1,true) returning id`;
  reviewerId = randomUUID();
  await connection`insert into request_agreements (org_id, request_id, reviewers) values (${ORG}, ${membersRequest}, ${connection.json([
    { id: reviewerId, nominee: { kind: "member", userId: VIEWER }, displayNameAtSelection: "Viewer", addedBy: MEMBER, note: "", decision: null },
  ])}::jsonb)`;
  // #218: two Requests already linked as Same problem, so removing a link has something to remove.
  const sameProblem = randomUUID();
  await connection`insert into same_problem_members (org_id,request_id,group_id,added_by) values (${ORG},${ownRequest},${sameProblem},${MEMBER}), (${ORG},${membersRequest},${sameProblem},${MEMBER})`;
  [{ id: definitionId }] = await connection`insert into metric_definitions (org_id,name,unit,created_by) values (${ORG},'Signups','count',${MEMBER}) returning id`;
  [{ id: otherDefinitionId }] = await connection`insert into metric_definitions (org_id,name,unit,created_by) values (${ORG},'Sign-ups','count',${MEMBER}) returning id`;
});
beforeEach(asViewer);
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id in (${VIEWER},${MEMBER},${ADMIN})`;
  await connection.end();
});

describe("every change is refused for a Viewer", () => {
  const release = { kind: "release", exposureDate: "2026-10-21", evidence: "Full audience rollout confirmed in release log", audienceConfirmed: true, valueBeforeRelease: { value: 50, unit: "%" } };
  const measured = { kind: "measured", primary: { kind: "numeric", actual: 62 }, guardrails: [2.5], evidence: "Analytics dashboard export", observedFrom: "2026-10-21", observedTo: "2026-10-28" };
  const comment = () => { const form = new FormData(); form.set("body", "Looks right to me"); return form; };

  const cases: [string, () => Promise<unknown>][] = [
    ["file a Request (review it)", async () => (await import("./intake/actions")).runTriage({ title: "A new Request", description: "Something people can't do" }, ctx)],
    ["file a Request (save it)", async () => (await import("./intake/actions")).saveRequest({ token: "any", editedProblemText: null }, ctx)],
    ["add a file", async () => (await import("./intake/attachment-actions")).prepareAttachmentUpload({ requestId: ownRequest, fileName: "a.png", mimeType: "image/png", sizeBytes: 10 }, ctx)],
    ["finish adding a file", async () => (await import("./intake/attachment-actions")).finalizeAttachmentUpload({ requestId: ownRequest, attachmentId: randomUUID() }, ctx)],
    ["discard a file", async () => (await import("./intake/attachment-actions")).discardAttachmentUpload({ requestId: ownRequest, attachmentId: randomUUID() }, ctx)],
    ["create a Project", async () => (await import("./intake/project-actions")).createProject({ name: "Checkout" }, ctx)],
    ["create a label", async () => (await import("./intake/label-actions")).createLabel({ name: "Urgent fix", colour: "red" }, ctx)],
    ["add a metric from the prediction form", async () => (await import("./intake/metric-actions")).addPredictionMetric({ name: "Refunds", unit: "count" }, ctx)],
    ["comment", async () => (await import("./requests/[id]/actions")).addComment(membersRequest, comment(), ctx)],
    ["comment on their own Request", async () => (await import("./requests/[id]/actions")).addComment(ownRequest, comment(), ctx)],
    ["pick up", async () => (await import("./requests/[id]/actions")).pickUpRequest(ownRequest, ctx)],
    ["pick up many", async () => (await import("./requests/[id]/actions")).pickUpRequests([ownRequest, membersRequest], ctx)],
    ["mark Done", async () => (await import("./requests/[id]/actions")).markDone(ownRequest, ctx)],
    ["mark many Done", async () => (await import("./requests/[id]/actions")).markDoneMany([ownRequest], ctx)],
    ["undo Done", async () => (await import("./requests/[id]/actions")).undoMarkDone(ownRequest, ctx)],
    ["set priority on their own Request", async () => (await import("./requests/[id]/actions")).setRequestPriority(ownRequest, "high", ctx)],
    ["delete their own Request", async () => (await import("./requests/[id]/actions")).deleteRequest(ownRequest, ctx)],
    ["edit their own Request", async () => (await import("./requests/[id]/edit-actions")).saveRequestEdits(ownRequest, { snapshot: "{}", changes: {} }, ctx)],
    ["add Reviewers", async () => (await import("./requests/[id]/reviewer-actions")).addReviewers(change(ownRequest), { nominees: [{ kind: "member", userId: MEMBER }], note: "" })],
    ["remove a Reviewer", async () => (await import("./requests/[id]/reviewer-actions")).removeReviewer(change(membersRequest), { reviewerId })],
    ["answer a review asked of them", async () => (await import("./requests/[id]/reviewer-actions")).answerReview(change(membersRequest), { reviewerId, kind: "looks_good", reason: "" })],
    ["record a Release", async () => (await import("./requests/[id]/release-actions")).changeRequestRelease(change(ownRequest), release)],
    ["close with a result", async () => (await import("./requests/[id]/outcome-actions")).changeRequestOutcome(change(ownRequest), measured)],
    ["close without a result", async () => (await import("./requests/[id]/outcome-actions")).changeRequestOutcome(change(ownRequest), { kind: "exception", reasonCode: "rolled_back", reason: "Reverted" })],
    ["take on a Guest submission", async () => (await import("./requests/[id]/take-on-actions")).takeOnGuestSubmission(change(guestSubmission))],
    ["link Requests as Same problem", async () => (await import("./requests/[id]/same-problem-actions")).linkSameProblem({ requestId: guestSubmission, otherRequestId: ownRequest }, ctx)],
    ["remove a Same problem link", async () => (await import("./requests/[id]/same-problem-actions")).removeSameProblemLink({ requestId: membersRequest }, ctx)],
    ["create a follow-up", async () => (await import("./requests/[id]/outcome-actions")).createFollowUpRequest(change(ownRequest), { reason: "The result was mixed" })],
    ["add a Metric definition", async () => (await import("./settings/metrics/actions")).addMetricDefinition({ name: "Refunds", unit: "count" }, ctx)],
    ["edit a Metric definition", async () => (await import("./settings/metrics/actions")).editMetricDefinition({ id: definitionId, name: "Signups (all)", unit: "count" }, ctx)],
    ["archive a Metric definition", async () => (await import("./settings/metrics/actions")).archiveMetricDefinition({ id: definitionId }, ctx)],
    ["restore a Metric definition", async () => (await import("./settings/metrics/actions")).restoreMetricDefinition({ id: definitionId }, ctx)],
    ["merge Metric definitions", async () => (await import("./settings/metrics/actions")).mergeMetricDefinitions({ keptId: definitionId, mergedId: otherDefinitionId }, ctx)],
    ["write the Quarter note", async () => (await import("./impact/quarter-note-actions")).saveQuarterNote({ year: 2026, quarter: 3, text: "A good quarter", expectedEditedAt: null }, ctx)],
    ["choose Inbox delivery", async () => (await import("./settings/profile/delivery-actions")).updateDeliveryPreference({ channel: "off" }, ctx)],
    ["connect Slack", async () => (await import("./settings/profile/slack-actions")).startSlackConnect({}, ctx)],
    ["disconnect Slack", async () => (await import("./settings/profile/slack-actions")).disconnectSlack({}, ctx)],
    ["pay for Lane", async () => (await import("./settings/profile/billing-actions")).startPlanCheckout({ period: "yearly" }, ctx)],
    ["open a billing page", async () => (await import("./settings/profile/billing-actions")).openBillingPage({ flow: "cancel" }, ctx)],
    ["invite someone", async () => (await import("./settings/members/actions")).inviteToWorkspace({ email: "new@example.test", role: "member" }, ctx)],
    ["change someone's role", async () => (await import("./settings/members/actions")).changeMemberRole({ userId: MEMBER, role: "viewer" }, ctx)],
    ["revoke an invitation", async () => (await import("./settings/members/actions")).revokeInvitation({ invitationId: "inv_x" }, ctx)],
  ];

  it.each(cases)("refuses to %s and changes nothing", async (_name, act) => {
    const { VIEWER_REFUSAL } = await import("@/lib/auth-guard");
    const before = await workspaceState();
    const result = await act();
    expect(refusalOf(result)).toBe(VIEWER_REFUSAL);
    expect(await workspaceState()).toEqual(before);
  });
});

describe("what a Viewer still reads", () => {
  it("offers a Viewer no review controls, even on a Request they filed", async () => {
    const reviews = await (await import("./requests/[id]/reviewer-actions")).readReviews(ownRequest, ctx);
    expect(reviews).toMatchObject({ requestId: ownRequest, canAdd: false, canInvite: false, canRemove: false });
    const asked = await (await import("./requests/[id]/reviewer-actions")).readReviews(membersRequest, ctx);
    expect(asked).toMatchObject({ canAdd: false, reviewers: [{ id: reviewerId, canAnswer: false }] });
  });

  it("offers a Viewer no Release, closing, handover or follow-up, with the reason", async () => {
    const release = await (await import("./requests/[id]/release-actions")).readRequestRelease(ownRequest, ctx);
    const actions = (release as { actions: Record<string, { allowed: boolean; reason?: string }> }).actions;
    expect(Object.values(actions).every((a) => !a.allowed && a.reason === "Viewers can read this Request but can’t change it.")).toBe(true);
  });

  it("shows a Viewer every Same problem link, with nothing to change", async () => {
    const view = await (await import("./requests/[id]/same-problem-actions")).readSameProblem(ownRequest, ctx);
    expect(view).toMatchObject({ shown: true, canChange: false, iterations: { iterations: [{ requestId: ownRequest }, { requestId: membersRequest }] } });
  });

  it("lists labels and library metrics for reading, with nothing to add", async () => {
    expect(await (await import("./intake/label-actions")).listLabels(ctx)).toMatchObject({ success: true, canCreate: false });
    const metrics = await (await import("./intake/metric-actions")).listPredictionMetrics({ impact: null }, ctx);
    expect(metrics).toMatchObject({ canOpenLibrary: true, canAddMetrics: false });
  });

  it("keeps a Viewer's own profile label theirs to change", async () => {
    expect(await (await import("./settings/profile/actions")).updateProfileRole({ role: "designer" }, ctx)).toEqual({ success: true });
  });

  // #217: the first run is personal state too, so a Viewer reads, skips and reopens their own.
  it("keeps a Viewer's own first run theirs to skip", async () => {
    await connection`insert into first_run_progress (org_id, user_id, guide) values (${ORG}, ${VIEWER}, 'joined')`;
    const { updateFirstRun } = await import("./first-run-actions");
    expect(await updateFirstRun({ change: "step", step: "inbox" }, ctx)).toEqual({ success: true });
    expect(await updateFirstRun({ change: "skip" }, ctx)).toEqual({ success: true });
    expect(await connection`select steps, skipped_at is not null as skipped from first_run_progress where org_id = ${ORG} and user_id = ${VIEWER}`).toEqual([{ steps: ["inbox"], skipped: true }]);
  });

  // #219: a saved view is personal state too (the spec lets Viewers save views), and it changes nothing in the workspace.
  it("keeps a Viewer's own saved views theirs to save, rename, update and delete", async () => {
    const { saveView, renameSavedView, updateSavedView, deleteSavedView } = await import("./saved-view-actions");
    const before = await workspaceState();
    const saved = await saveView({ name: "Open work", filters: { status: "open", project: "all" } }, ctx);
    expect(saved).toMatchObject({ ok: true, view: { name: "Open work" } });
    const id = (saved as { view: { id: string } }).view.id;
    expect(await renameSavedView({ id, name: "Open now" }, ctx)).toMatchObject({ ok: true });
    expect(await updateSavedView({ id, filters: { status: "due", project: "none" } }, ctx)).toMatchObject({ ok: true });
    expect(await deleteSavedView({ id }, ctx)).toEqual({ ok: true });
    expect(await workspaceState()).toEqual(before);
  });
});
