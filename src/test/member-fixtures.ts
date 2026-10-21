/** A Clerk roster for lifecycle tests: pickup still checks the actor is an active member. */
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
