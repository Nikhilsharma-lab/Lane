import { testSessionCookies } from "./better-auth";
import { assertE2ETarget } from "./safety";
import { createTestUser, deleteTestUser } from "./test-user";
import { createTestWorkspace } from "./workspaces";

/**
 * Makes a person and a workspace, signs a session cookie for them and asks the app's `/api/auth` whose session it is.
 * Throws, saying why, when the app's secret, address, database or table mapping isn't this run's. Playwright's setup
 * project runs it, so that fails before any suite.
 */
export async function proveAppAcceptsTestSessions(): Promise<void> {
  const { baseURL } = assertE2ETarget();
  const refuse = (reason: string): never => {
    throw new Error(`[e2e] ${baseURL} doesn't accept this run's test sessions: ${reason}`);
  };
  const user = await createTestUser("setup");
  try {
    const orgId = await createTestWorkspace(user.id, "Lane E2E setup");
    const [cookie] = await testSessionCookies(user.id, orgId);
    const response = await fetch(`${baseURL}/api/auth/get-session`, { headers: { cookie: `${cookie.name}=${cookie.value}` } });
    if (response.status === 404) refuse("its /api/auth is off, so it has no BETTER_AUTH_SECRET.");
    if (!response.ok) refuse(`its /api/auth answered ${response.status}.`);
    const answer = (await response.json()) as { user: { id: string; email: string; name: string }; session: { activeOrganizationId?: string | null } } | null;
    if (!answer) return refuse("its BETTER_AUTH_SECRET is not this run's, or it reads another database.");
    if (answer.user.id !== user.id || answer.user.email !== user.email || answer.user.name !== "Lane E2E" || answer.session.activeOrganizationId !== orgId)
      refuse("it reads the session's person or workspace differently, so e2e/helpers/better-auth.ts's table mapping has drifted from src/lib/auth-server.ts's.");
  } finally {
    await deleteTestUser(user.id);
  }
}
