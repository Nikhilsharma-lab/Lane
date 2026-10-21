import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({
  userId: "agreement_owner",
  orgId: "org_agreement",
  orgRole: "org:member",
}));
const invitationState = vi.hoisted(() => ({
  status: "pending",
  verified: true,
}));
const users = vi.hoisted(() => [
  "agreement_owner",
  "agreement_design",
  "agreement_dev",
  "agreement_other",
]);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async () => ({
        totalCount: users.length,
        data: users.map((userId) => ({
          organization: { id: session.orgId },
          role: "org:member",
          publicUserData: {
            userId,
            identifier: userId + "@example.test",
            firstName: userId,
          },
        })),
      }),
      getOrganizationInvitationList: async () => ({
        totalCount: invitationState.status === "pending" ? 1 : 0,
        data:
          invitationState.status === "pending"
            ? [
                {
                  id: "inv_agreement",
                  organizationId: session.orgId,
                  status: "pending",
                  role: "org:member",
                  emailAddress: "invited@example.test",
                },
              ]
            : [],
      }),
      getOrganizationInvitation: async () => ({
        id: "inv_agreement",
        organizationId: session.orgId,
        status: invitationState.status,
        emailAddress: "invited@example.test",
      }),
    },
    users: {
      getUser: async (userId: string) => ({
        emailAddresses: [
          {
            emailAddress:
              userId === users[3]
                ? "invited@example.test"
                : userId + "@example.test",
            verification: {
              status: invitationState.verified ? "verified" : "unverified",
            },
          },
        ],
      }),
    },
  }),
}));
const connection = postgres(process.env.DATABASE_URL!, {
  max: 6,
  prepare: false,
});
const orgId = "org_agreement";
const prepared = {
  version: 1,
  scopeIncluded: "Reduce failed checkout",
  scopeExcluded: "Pricing",
  audience: "All shoppers",
  timing: "Before November",
  constraints: "Existing payments",
  feasibility: "Confirmed API available",
  commitmentKind: "delivery",
};
const nominees = {
  pm: { kind: "member", userId: users[0] },
  designer: { kind: "member", userId: users[1] },
  developer: { kind: "member", userId: users[2] },
};
let requestId: string;
beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${orgId},'Agreement test','agreement-test')`;
  for (const id of users)
    await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`;
  const [row] =
    await connection`insert into requests(org_id,title,description,created_by) values (${orgId},'Checkout problem','People cannot complete checkout',${users[0]}) returning id`;
  requestId = row.id;
});
afterAll(() => connection.end());
it("saves three nominations and preparation, without granting creator approval", async () => {
  const api = await import("./agreement-actions");
  expect(
    await api.prepareAgreement(
      { orgId, requestId, expectedRevision: 0, operationId: randomUUID() },
      { prepared, nominees, blockers: [] },
    ),
  ).toMatchObject({ success: true, revision: 1 });
  const [agreement] =
    await connection`select seats,snapshot from request_agreements where request_id=${requestId}`;
  expect(agreement.snapshot).toBeNull();
  expect(
    Object.values(agreement.seats).map(
      (s) => (s as { decision: unknown }).decision,
    ),
  ).toEqual([null, null, null]);
});
it("freezes the visible commitment; repeat submission returns the same durable result", async () => {
  const api = await import("./agreement-actions");
  const impact = {
    kind: "measurement",
    version: 2,
    primary: {
      key: "conversion",
      name: "",
      unit: "percent",
      current: 50,
      target: 80,
      noBaseline: false,
      check: "",
    },
    measurement: {
      audience: "all",
      platform: "all",
      windowDays: 30,
      exactDates: false,
      startDate: "",
      endDate: "",
    },
    guardrails: [],
  };
  await connection`update requests set expected_impact=${connection.json(impact)},request_type='improvement' where id=${requestId}`;
  const [request] =
    await connection`select title,description from requests where id=${requestId}`;
  const context = {
    orgId,
    requestId,
    expectedRevision: 1,
    operationId: randomUUID(),
  };
  const view = await api.readAgreement(requestId, { orgId });
  expect(view).toHaveProperty("commitmentToken");
  if ("error" in view) throw new Error(view.error);
  const first = await api.submitAgreement(context, {
    commitmentToken: view.commitmentToken,
  });
  expect(first).toMatchObject({ success: true, revision: 2 });
  expect(
    await api.submitAgreement(context, {
      commitmentToken: view.commitmentToken,
    }),
  ).toEqual(first);
  const [saved] =
    await connection`select snapshot,seats from request_agreements where request_id=${requestId}`;
  expect(saved.snapshot.request).toMatchObject(request);
  expect(saved.seats.pm.decision).toBeNull();
  await expect(
    connection`update request_agreements set snapshot='{}' where request_id=${requestId}`,
  ).rejects.toThrow(/immutable/);
});
it("records explicit agreement and rejects stale or forged seat decisions", async () => {
  const api = await import("./agreement-actions");
  expect(
    await api.decideAgreement(
      { orgId, requestId, expectedRevision: 2, operationId: randomUUID() },
      { seat: "designer", generation: 1, kind: "agree", reason: "" },
    ),
  ).toHaveProperty("error");
  expect(
    await api.decideAgreement(
      { orgId, requestId, expectedRevision: 2, operationId: randomUUID() },
      { seat: "pm", generation: 1, kind: "agree", reason: "" },
    ),
  ).toMatchObject({ success: true, revision: 3 });
  expect(
    await api.decideAgreement(
      { orgId, requestId, expectedRevision: 2, operationId: randomUUID() },
      {
        seat: "pm",
        generation: 1,
        kind: "withdraw",
        reason: "New feasibility blocker",
      },
    ),
  ).toHaveProperty("error");
});
it("blocks partial agreement at single and bulk pickup, then permits three explicit decisions", async () => {
  const lifecycle = await import("./actions");
  const api = await import("./agreement-actions");
  expect(await lifecycle.pickUpRequest(requestId, { orgId })).toHaveProperty(
    "error",
  );
  expect(
    (await lifecycle.pickUpRequests([requestId], { orgId })).moved,
  ).toEqual([]);
  session.userId = users[1];
  expect(
    await api.decideAgreement(
      { orgId, requestId, expectedRevision: 3, operationId: randomUUID() },
      { seat: "designer", generation: 1, kind: "agree", reason: "" },
    ),
  ).toMatchObject({ success: true });
  session.userId = users[2];
  expect(
    await api.decideAgreement(
      { orgId, requestId, expectedRevision: 4, operationId: randomUUID() },
      { seat: "developer", generation: 1, kind: "agree", reason: "" },
    ),
  ).toMatchObject({ success: true });
  expect(await lifecycle.pickUpRequest(requestId, { orgId })).toEqual({
    success: true,
  });
});
it("withdrawal retains In Progress and blocks Done until concern resolution and renewed agreement", async () => {
  const api = await import("./agreement-actions");
  const lifecycle = await import("./actions");
  expect(
    await api.decideAgreement(
      { orgId, requestId, expectedRevision: 5, operationId: randomUUID() },
      {
        seat: "developer",
        generation: 1,
        kind: "withdraw",
        reason: "API capacity is insufficient",
      },
    ),
  ).toMatchObject({ success: true });
  expect(await lifecycle.markDone(requestId, { orgId })).toHaveProperty(
    "error",
  );
  const [row] =
    await connection`select status from requests where id=${requestId}`;
  expect(row.status).toBe("in_progress");
  const [agreement] =
    await connection`select concerns from request_agreements where request_id=${requestId}`;
  expect(
    await api.resolveAgreementConcern(
      { orgId, requestId, expectedRevision: 6, operationId: randomUUID() },
      {
        concernId: agreement.concerns[0].id,
        reason: "Capacity verified with load evidence",
      },
    ),
  ).toMatchObject({ success: true });
  expect(await lifecycle.markDone(requestId, { orgId })).toHaveProperty(
    "error",
  );
  expect(
    await api.decideAgreement(
      { orgId, requestId, expectedRevision: 7, operationId: randomUUID() },
      { seat: "developer", generation: 1, kind: "agree", reason: "" },
    ),
  ).toMatchObject({ success: true });
  expect(await lifecycle.markDone(requestId, { orgId })).toEqual({
    success: true,
  });
});
it("replacement of a participant clears only that seat and corrections leave the snapshot intact", async () => {
  session.userId = users[0];
  const api = await import("./agreement-actions");
  expect(
    await api.replaceAgreementParticipant(
      { orgId, requestId, expectedRevision: 8, operationId: randomUUID() },
      {
        seat: "designer",
        nominee: { kind: "member", userId: users[3] },
        reason: "Designer unavailable this month",
      },
    ),
  ).toMatchObject({ success: true, revision: 9 });
  const [row] =
    await connection`select seats,snapshot from request_agreements where request_id=${requestId}`;
  expect(row.seats.pm.decision.kind).toBe("agree");
  expect(row.seats.developer.decision.kind).toBe("agree");
  expect(row.seats.designer.decision).toBeNull();
  expect(
    await api.addAgreementCorrection(
      { orgId, requestId, expectedRevision: 9, operationId: randomUUID() },
      {
        field: "description",
        wording: "People cannot finish checkout",
        reason: "Clarify wording; same scope",
      },
    ),
  ).toMatchObject({ success: true });
  const [after] =
    await connection`select snapshot from request_agreements where request_id=${requestId}`;
  expect(after.snapshot).toEqual(row.snapshot);
});
it("creates one linked successor on retry and atomically closes the original as an exception", async () => {
  const api = await import("./agreement-actions");
  const context = {
    orgId,
    requestId,
    expectedRevision: 10,
    operationId: randomUUID(),
  };
  const created = await api.createAgreementReplacement(context, {
    reason: "Scope changed after agreement",
  });
  expect(created).toMatchObject({ success: true });
  if (!("replacementId" in created) || !created.replacementId)
    throw new Error(JSON.stringify(created));
  expect(
    await api.createAgreementReplacement(context, {
      reason: "Scope changed after agreement",
    }),
  ).toEqual(created);
  const replacementId = created.replacementId;
  expect(
    await (await import("./actions")).pickUpRequest(replacementId, { orgId }),
  ).toHaveProperty("error");
  expect(
    await api.createAgreementReplacement(
      {
        orgId,
        requestId: replacementId,
        expectedRevision: 0,
        operationId: randomUUID(),
      },
      { reason: "Another replacement" },
    ),
  ).toHaveProperty("error");
  await connection`update requests set description='Changed scope with a new problem' where id=${replacementId}`;
  const confirmed = await api.confirmRequestSuperseded(
    { orgId, requestId, expectedRevision: 11, operationId: randomUUID() },
    { replacementId, reason: "Use the replacement scope" },
  );
  expect(confirmed).toMatchObject({ success: true });
  const [original] =
    await connection`select status,exception_closure from requests where id=${requestId}`;
  expect(original.status).toBe("done");
  expect(original.exception_closure).toMatchObject({
    kind: "exception",
    reasonCode: "superseded",
    replacementId,
  });
  expect(
    await (await import("./actions")).undoMarkDone(requestId, { orgId }),
  ).toHaveProperty("error");
  await expect(
    connection`update requests set exception_closure=null where id=${requestId}`,
  ).rejects.toThrow(/immutable/);
});
async function freshRequest() {
  session.userId = users[0];
  session.orgId = orgId;
  session.orgRole = "org:member";
  const [row] =
    await connection`insert into requests(org_id,title,description,created_by,request_type,expected_impact) select org_id,'Another checkout problem','People cannot finish checkout',created_by,request_type,expected_impact from requests where id=${requestId} returning id`;
  return row.id as string;
}
const contextFor = (id: string, revision: number) => ({
  orgId,
  requestId: id,
  expectedRevision: revision,
  operationId: randomUUID(),
});
async function submittedRequest() {
  const id = await freshRequest();
  const api = await import("./agreement-actions");
  expect(
    await api.prepareAgreement(contextFor(id, 0), {
      prepared,
      nominees,
      blockers: [],
    }),
  ).toMatchObject({ success: true });
  const view = await api.readAgreement(id, { orgId });
  if ("error" in view) throw new Error(view.error);
  expect(
    await api.submitAgreement(contextFor(id, 1), {
      commitmentToken: view.commitmentToken,
    }),
  ).toMatchObject({ success: true });
  return id;
}
async function agreedRequest() {
  const id = await submittedRequest();
  const api = await import("./agreement-actions");
  for (const [index, seat] of (
    ["pm", "designer", "developer"] as const
  ).entries()) {
    session.userId = users[index];
    expect(
      await api.decideAgreement(contextFor(id, index + 2), {
        seat,
        generation: 1,
        kind: "agree",
        reason: "",
      }),
    ).toMatchObject({ success: true });
  }
  return id;
}
it("denies old Open pickup, duplicate seats, foreign resources, guests and noncreator admins", async () => {
  const id = await freshRequest();
  const api = await import("./agreement-actions");
  expect(
    await (await import("./actions")).pickUpRequest(id, { orgId }),
  ).toHaveProperty("error");
  expect(
    await api.prepareAgreement(contextFor(id, 0), {
      prepared,
      nominees: { ...nominees, developer: nominees.pm },
      blockers: [],
    }),
  ).toHaveProperty("error");
  session.userId = users[3];
  session.orgRole = "org:admin";
  expect(
    await api.prepareAgreement(contextFor(id, 0), {
      prepared,
      nominees,
      blockers: [],
    }),
  ).toHaveProperty("error");
  session.orgRole = "org:guest";
  expect(await api.readAgreement(id, { orgId })).toHaveProperty("error");
  session.orgRole = "org:member";
  session.orgId = "org_foreign_agreement";
  expect(await api.readAgreement(id, { orgId })).toHaveProperty("error");
  expect(
    await api.prepareAgreement(
      { ...contextFor(id, 0), orgId: session.orgId },
      { prepared, nominees, blockers: [] },
    ),
  ).toHaveProperty("error");
  session.orgId = orgId;
  session.userId = users[0];
});
it("rejects submission of a commitment changed after preview and editing of a submitted commitment", async () => {
  const api = await import("./agreement-actions");
  const id = await freshRequest();
  await api.prepareAgreement(contextFor(id, 0), {
    prepared,
    nominees,
    blockers: [],
  });
  const view = await api.readAgreement(id, { orgId });
  if ("error" in view) throw Error(view.error);
  await connection`update requests set description='Different context' where id=${id}`;
  expect(
    await api.submitAgreement(contextFor(id, 1), {
      commitmentToken: view.commitmentToken,
    }),
  ).toHaveProperty("error");
  const submitted = await submittedRequest();
  expect(
    await api.prepareAgreement(contextFor(submitted, 2), {
      prepared: { ...prepared, audience: "New audience" },
      nominees,
      blockers: [],
    }),
  ).toHaveProperty("error");
  expect(
    await api.addAgreementCorrection(contextFor(submitted, 2), {
      field: "expectedImpact",
      wording: "New target",
      reason: "Change",
    }),
  ).toHaveProperty("error");
});
it("keeps incomplete measurement editable instead of freezing an unstartable commitment", async () => {
  const api = await import("./agreement-actions");
  const id = await freshRequest();
  await connection`update requests set expected_impact=jsonb_set(expected_impact,'{primary,current}','null'::jsonb) where id=${id}`;
  await api.prepareAgreement(contextFor(id, 0), {
    prepared,
    nominees,
    blockers: [],
  });
  const view = await api.readAgreement(id, { orgId });
  if ("error" in view) throw Error(view.error);
  expect(
    await api.submitAgreement(contextFor(id, 1), {
      commitmentToken: view.commitmentToken,
    }),
  ).toHaveProperty("error");
  const [row] =
    await connection`select snapshot from request_agreements where request_id=${id}`;
  expect(row.snapshot).toBeNull();
});
it("pending invitations never approve; only verified redemption plus active membership binds the seat", async () => {
  const api = await import("./agreement-actions");
  const id = await freshRequest();
  invitationState.status = "pending";
  const invite = {
    kind: "invitation",
    invitationId: "inv_agreement",
    email: "invited@example.test",
  };
  expect(
    await api.prepareAgreement(contextFor(id, 0), {
      prepared,
      nominees: { ...nominees, developer: invite },
      blockers: [],
    }),
  ).toMatchObject({ success: true });
  const view = await api.readAgreement(id, { orgId });
  if ("error" in view) throw Error(view.error);
  expect(
    await api.submitAgreement(contextFor(id, 1), {
      commitmentToken: view.commitmentToken,
    }),
  ).toMatchObject({ success: true });
  session.userId = users[3];
  expect(
    await api.decideAgreement(contextFor(id, 2), {
      seat: "developer",
      generation: 1,
      kind: "agree",
      reason: "",
    }),
  ).toHaveProperty("error");
  invitationState.status = "accepted";
  invitationState.verified = false;
  expect(
    await api.decideAgreement(contextFor(id, 2), {
      seat: "developer",
      generation: 1,
      kind: "agree",
      reason: "",
    }),
  ).toHaveProperty("error");
  invitationState.verified = true;
  expect(
    await api.decideAgreement(contextFor(id, 2), {
      seat: "developer",
      generation: 1,
      kind: "agree",
      reason: "",
    }),
  ).toMatchObject({ success: true });
  const [row] =
    await connection`select seats from request_agreements where request_id=${id}`;
  expect(row.seats.developer.nominee).toEqual({
    kind: "member",
    userId: users[3],
  });
  invitationState.status = "pending";
});
it("serializes withdrawal against advancement and deduplicates a lost-response retry", async () => {
  const api = await import("./agreement-actions");
  const lifecycle = await import("./actions");
  const id = await agreedRequest();
  const context = contextFor(id, 5);
  const input = {
    seat: "developer",
    generation: 1,
    kind: "withdraw",
    reason: "Blocking feasibility concern",
  };
  const [withdrawal] = await Promise.all([
    api.decideAgreement(context, input),
    lifecycle.pickUpRequest(id, { orgId }),
  ]);
  expect(withdrawal).toMatchObject({ success: true });
  expect(await api.decideAgreement(context, input)).toEqual(withdrawal);
  expect(await lifecycle.markDone(id, { orgId })).toHaveProperty("error");
  const [row] =
    await connection`select status,agreement_revision from requests where id=${id}`;
  expect(["open", "in_progress"]).toContain(row.status);
  expect(row.agreement_revision).toBe(6);
  const events =
    await connection`select id from request_agreement_events where request_id=${id} and operation_id=${context.operationId}`;
  expect(events).toHaveLength(1);
});
it("rechecks membership before advancement and preserves concerns when a seat is replaced", async () => {
  const api = await import("./agreement-actions");
  const id = await agreedRequest();
  const departed = users.pop()!;
  // Remove the actual developer from the provider roster, without touching stored agreement.
  const dev = users.splice(2, 1)[0];
  expect(
    await (await import("./actions")).pickUpRequest(id, { orgId }),
  ).toHaveProperty("error");
  users.splice(2, 0, dev);
  users.push(departed);
  expect(
    await api.decideAgreement(contextFor(id, 5), {
      seat: "developer",
      generation: 1,
      kind: "withdraw",
      reason: "Unavailable API",
    }),
  ).toMatchObject({ success: true });
  session.userId = users[0];
  expect(
    await api.replaceAgreementParticipant(contextFor(id, 6), {
      seat: "developer",
      nominee: { kind: "member", userId: users[3] },
      reason: "Original developer unavailable",
    }),
  ).toMatchObject({ success: true });
  session.userId = users[2];
  expect(
    await api.decideAgreement(contextFor(id, 7), {
      seat: "developer",
      generation: 1,
      kind: "agree",
      reason: "",
    }),
  ).toHaveProperty("error");
  session.userId = users[3];
  expect(
    await api.decideAgreement(contextFor(id, 7), {
      seat: "developer",
      generation: 2,
      kind: "agree",
      reason: "",
    }),
  ).toMatchObject({ success: true });
  expect(
    await (await import("./actions")).pickUpRequest(id, { orgId }),
  ).toHaveProperty("error");
  const view = await api.readAgreement(id, { orgId });
  if ("error" in view) throw Error(view.error);
  expect(view.agreement?.concerns[0]).toMatchObject({
    reason: "Unavailable API",
    resolution: null,
  });
});

it("legacy In Progress can finish unsubmitted; submission requires all three decisions", async () => {
  const api = await import("./agreement-actions");
  const lifecycle = await import("./actions");
  const old = await freshRequest();
  await connection`update requests set status='in_progress' where id=${old}`;
  expect(await lifecycle.markDone(old, { orgId })).toEqual({ success: true });
  const id = await submittedRequest();
  await connection`update requests set status='in_progress' where id=${id}`;
  expect(
    await api.decideAgreement(contextFor(id, 2), {
      seat: "pm",
      generation: 1,
      kind: "agree",
      reason: "",
    }),
  ).toMatchObject({ success: true });
  expect(await lifecycle.markDone(id, { orgId })).toHaveProperty("error");
  expect((await lifecycle.markDoneMany([id], { orgId })).moved).toEqual([]);
});
it("agreement activity does not reopen an expired Done undo window", async () => {
  const id = await submittedRequest();
  const api = await import("./agreement-actions");
  await connection`update requests set status='done' where id=${id}`;
  await connection`alter table requests disable trigger set_updated_at_requests`;
  try {
    await connection`update requests set updated_at=now()-interval '1 hour' where id=${id}`;
  } finally {
    await connection`alter table requests enable trigger set_updated_at_requests`;
  }
  expect(
    await api.addAgreementCorrection(contextFor(id, 2), {
      field: "description",
      wording: "Spelling clarified",
      reason: "Wording only",
    }),
  ).toMatchObject({ success: true });
  expect(
    await (await import("./actions")).undoMarkDone(id, { orgId }),
  ).toHaveProperty("error");
});
it("a successor cannot resolve dissent without attributed unavailability of that author", async () => {
  const api = await import("./agreement-actions");
  const id = await agreedRequest();
  await api.decideAgreement(contextFor(id, 5), {
    seat: "developer",
    generation: 1,
    kind: "withdraw",
    reason: "Feasibility remains unresolved",
  });
  session.userId = users[0];
  await api.replaceAgreementParticipant(contextFor(id, 6), {
    seat: "developer",
    nominee: { kind: "member", userId: users[3] },
    reason: "Another lead takes over",
  });
  const view = await api.readAgreement(id, { orgId });
  if ("error" in view) throw Error(view.error);
  session.userId = users[3];
  expect(
    await api.resolveAgreementConcern(contextFor(id, 7), {
      concernId: view.agreement!.concerns[0].id,
      reason: "I consider it resolved",
    }),
  ).toHaveProperty("error");
  const second = await agreedRequest();
  await api.decideAgreement(contextFor(second, 5), {
    seat: "developer",
    generation: 1,
    kind: "withdraw",
    reason: "Feasibility concern",
  });
  session.userId = users[0];
  await api.replaceAgreementParticipant(contextFor(second, 6), {
    seat: "developer",
    nominee: { kind: "member", userId: users[3] },
    reason: "Original developer on leave",
    unavailable: true,
  });
  const secondView = await api.readAgreement(second, { orgId });
  if ("error" in secondView) throw Error(secondView.error);
  session.userId = users[3];
  expect(
    await api.resolveAgreementConcern(contextFor(second, 7), {
      concernId: secondView.agreement!.concerns[0].id,
      reason: "Capacity evidence checked",
    }),
  ).toMatchObject({ success: true });
});
it("shows affected replacement fields before confirmation and freezes their final comparison", async () => {
  const api = await import("./agreement-actions");
  const id = await submittedRequest();
  const created = await api.createAgreementReplacement(contextFor(id, 2), {
    reason: "Different delivery scope",
  });
  if (!("replacementId" in created) || !created.replacementId)
    throw Error("No replacement");
  const next = created.replacementId;
  await connection`update requests set description='Different scope' where id=${next}`;
  let view = await api.readAgreement(next, { orgId });
  if ("error" in view) throw Error(view.error);
  expect(view.links[0].changedFields).toEqual(["description"]);
  expect(
    await api.confirmRequestSuperseded(contextFor(id, 3), {
      replacementId: next,
      reason: "Use changed scope",
    }),
  ).toMatchObject({ success: true });
  await connection`update requests set title='New title' where id=${next}`;
  view = await api.readAgreement(next, { orgId });
  if ("error" in view) throw Error(view.error);
  expect(
    await api.submitAgreement(contextFor(next, 0), {
      commitmentToken: view.commitmentToken,
    }),
  ).toMatchObject({ success: true });
  const [link] =
    await connection`select changed_fields from request_replacements where replacement_id=${next}`;
  expect(link.changed_fields).toEqual(
    expect.arrayContaining(["title", "description"]),
  );
});
