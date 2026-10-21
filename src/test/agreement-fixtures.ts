/** Explicit agreed fixtures for pre-existing lifecycle tests; never used by production. */
import { db, requests, requestAgreements } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { commitmentValues, type AgreementSeats } from "@/lib/request-agreement";
const users = [
  "fixture_agreement_pm",
  "fixture_agreement_designer",
  "fixture_agreement_developer",
];
export function fixtureClerkClient(orgId: string, actorIds: string[]) {
  return {
    organizations: {
      getOrganizationMembershipList: async () => {
        const ids = [...new Set([...users, ...actorIds])];
        return {
          totalCount: ids.length,
          data: ids.map((userId) => ({
            organization: { id: orgId },
            role: "org:member",
            publicUserData: { userId, identifier: `${userId}@example.test` },
          })),
        };
      },
    },
  };
}
export async function seedAgreedRequests(orgId: string) {
  const rows = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, orgId));
  for (const request of rows) {
    const existing = await db
      .select()
      .from(requestAgreements)
      .where(
        and(
          eq(requestAgreements.orgId, orgId),
          eq(requestAgreements.requestId, request.id),
        ),
      );
    if (existing.length) continue;
    const seats = Object.fromEntries(
      (["pm", "designer", "developer"] as const).map((d, i) => [
        d,
        {
          generation: 1,
          nominee: { kind: "member", userId: users[i] },
          displayNameAtSelection: users[i],
          decision: {
            kind: "agree",
            actorId: users[i],
            at: "2026-10-21T00:00:00.000Z",
            reason: "",
          },
        },
      ]),
    ) as AgreementSeats;
    const prepared = {
      version: 1 as const,
      scopeIncluded: "Test scope",
      scopeExcluded: "Other scope",
      audience: "Test audience",
      timing: "Test timing",
      constraints: "Test constraints",
      feasibility: "Test feasibility",
      commitmentKind: "delivery" as const,
    };
    await db
      .insert(requestAgreements)
      .values({
        requestId: request.id,
        orgId,
        prepared,
        seats,
        submittedBy: request.createdBy,
        submittedAt: new Date(),
        snapshot: {
          version: 1,
          request: commitmentValues(request),
          prepared,
          attachmentIds: [],
        },
      });
  }
}
export async function removeAgreementFixtures(orgId: string) {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/lane_test"
  )
    throw new Error("Agreement fixture cleanup is local lane_test only");
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`alter table request_agreements disable trigger protect_agreement_snapshot`,
    );
    try {
      await tx
        .delete(requestAgreements)
        .where(eq(requestAgreements.orgId, orgId));
    } finally {
      await tx.execute(
        sql`alter table request_agreements enable trigger protect_agreement_snapshot`,
      );
    }
  });
}
