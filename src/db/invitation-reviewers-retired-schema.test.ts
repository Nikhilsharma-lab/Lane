import postgres from "postgres";
import { requireTestDatabase } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 0044 (#211): every Reviewer is an Admin or Member. Email-address (pending-invitation) Reviewers
 * are retired: the ones saved before it are test data and are removed, and the database refuses new ones.
 * The fixture (src/test/invitation-reviewers-fixtures.sql) saved invitation Reviewers before 0044 ran.
 */
const FIXTURE_ORG = "org_invitation_reviewers";
const ORG = "org_invitation_reviewers_schema";
const MIXED = "00000000-0000-4000-8000-000000000441";
const ONLY_INVITATIONS = "00000000-0000-4000-8000-000000000442";
const MEMBERS_ONLY = "00000000-0000-4000-8000-000000000443";
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });
  await sql`insert into organizations(id,name,slug) values (${ORG},'Invitation Reviewers','invitation-reviewers-schema')`;
  await sql`insert into profiles(id,full_name,email) values ('invitation_schema_person','Person','person@invitation-schema.test')`;
});
afterAll(async () => {
  await sql`delete from organizations where id in (${ORG}, ${FIXTURE_ORG})`;
  await sql`delete from profiles where id in ('invitation_schema_person','invitation_reviewers_requester','invitation_reviewers_member')`;
  await sql.end();
});

const reviewersOf = async (requestId: string) =>
  (await sql`select reviewers from request_agreements where request_id=${requestId}`)[0]?.reviewers;
const member = (userId: string, decision: Record<string, string> | null = null) => ({
  id: crypto.randomUUID(), nominee: { kind: "member", userId }, displayNameAtSelection: userId, addedBy: "invitation_schema_person", note: "", decision,
});
const invitation = () => ({
  ...member("x"), nominee: { kind: "invitation", invitationId: "inv_new", email: "new@invited.test" }, displayNameAtSelection: "new@invited.test",
});
const reviewersValid = async (value: unknown) =>
  (await sql`select valid_request_reviewers(${sql.json(value as never)}) as valid`)[0].valid;

describe("retiring invitation Reviewers", () => {
  it("removes the invitation Reviewers saved before it, keeping every member Reviewer, their order and answers", async () => {
    expect(await reviewersOf(MIXED)).toEqual([
      {
        id: "00000000-0000-4000-8000-0000000004a2", nominee: { kind: "member", userId: "invitation_reviewers_member" },
        displayNameAtSelection: "Member", addedBy: "invitation_reviewers_requester", note: "Can we build this?",
        decision: { kind: "concern", actorId: "invitation_reviewers_member", at: "2026-10-21T09:00:00Z", reason: "No API yet" },
      },
      {
        id: "00000000-0000-4000-8000-0000000004a4", nominee: { kind: "member", userId: "invitation_reviewers_other" },
        displayNameAtSelection: "Other", addedBy: "invitation_reviewers_requester", note: "", decision: null,
      },
    ]);
    expect(await reviewersOf(ONLY_INVITATIONS)).toEqual([]);
    expect(await reviewersOf(MEMBERS_ONLY)).toEqual([
      {
        id: "00000000-0000-4000-8000-0000000004c1", nominee: { kind: "member", userId: "invitation_reviewers_member" },
        displayNameAtSelection: "Member", addedBy: "invitation_reviewers_requester", note: "",
        decision: { kind: "looks_good", actorId: "invitation_reviewers_member", at: "2026-10-21T09:00:00Z", reason: "" },
      },
    ]);
  });

  it("leaves no invitation Reviewer anywhere and changes no Request", async () => {
    expect(await sql`select 1 from request_agreements a, jsonb_array_elements(a.reviewers) r where r->'nominee'->>'kind' <> 'member'`).toEqual([]);
    const rows = await sql`select id, agreement_revision, updated_at from requests where org_id=${FIXTURE_ORG} order by id`;
    expect(rows).toEqual([
      { id: MIXED, agreement_revision: 3, updated_at: new Date("2026-10-20T09:00:00Z") },
      { id: ONLY_INVITATIONS, agreement_revision: 1, updated_at: new Date("2026-10-20T09:00:00Z") },
      { id: MEMBERS_ONLY, agreement_revision: 2, updated_at: new Date("2026-10-20T09:00:00Z") },
    ]);
  });

  it("refuses an invitation or email-address Reviewer from now on, and still accepts members", async () => {
    expect(await reviewersValid([member("a"), member("b", { kind: "looks_good", actorId: "b", at: "2026-10-25", reason: "" })])).toBe(true);
    for (const invalid of [
      [invitation()],
      [member("a"), invitation()],
      [{ ...member("a"), nominee: { kind: "email", email: "someone@example.test" } }],
      [{ ...member("a"), nominee: "someone@example.test" }],
    ])
      expect(await reviewersValid(invalid)).toBe(false);
    const [request] = await sql`insert into requests(org_id,title,description,created_by) values (${ORG},'Checkout','Fixture','invitation_schema_person') returning id`;
    await expect(
      sql`insert into request_agreements(request_id,org_id,reviewers) values (${request.id},${ORG},${sql.json([invitation()] as never)})`,
    ).rejects.toThrow(/request_reviewers_valid/);
    await sql`insert into request_agreements(request_id,org_id,reviewers) values (${request.id},${ORG},${sql.json([member("a")] as never)})`;
    await expect(
      sql`update request_agreements set reviewers=${sql.json([member("a"), invitation()] as never)} where request_id=${request.id}`,
    ).rejects.toThrow(/request_reviewers_valid/);
  });
});
