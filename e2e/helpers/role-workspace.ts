import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { WORKSPACE_ROLES } from "../../src/lib/role-rules";
import { cleanupTestWorkspace, finishFirstRuns, provisionTestWorkspace } from "./cleanup";
import { withE2EDatabase } from "./database";
import { createTestUser, deleteTestUser, signInTestUser, type TestUser } from "./test-user";
import { addTestMember, type WorkspaceRole } from "./workspaces";

export type Person = TestUser & { name: string; page: Page };

const NAMES: Record<WorkspaceRole, string> = { admin: "Ada Admin", member: "Mina Member", guest: "Gita Guest", viewer: "Vera Viewer" };

/** A goal ready for pickup: a conversion rate, 62% now, 80% after release. */
const GOAL = {
  kind: "measurement", version: 4,
  primary: { key: "conversion", name: "", unit: "percent", current: 62, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};

/**
 * #402: one workspace with a person in each of Lane's four roles (or `roles`; the Admin always), each signed in in a
 * browser of their own, their first run behind them. `close` deletes everyone and everything in it.
 */
export async function createRoleWorkspace(browser: Browser, workspaceName: string, roles: readonly WorkspaceRole[] = WORKSPACE_ROLES) {
  const users: TestUser[] = [];
  const contexts: BrowserContext[] = [];
  const close = async () => {
    for (const context of contexts) await context.close();
    // The Admin made the workspace, so it goes first, with everything in it.
    for (const { id } of users) {
      await cleanupTestWorkspace(id);
      await deleteTestUser(id);
    }
  };
  async function person(role: WorkspaceRole): Promise<Person> {
    const user = await createTestUser(`role-${role}`);
    users.push(user);
    const context = await browser.newContext();
    contexts.push(context);
    return { ...user, name: NAMES[role], page: await context.newPage() };
  }
  try {
    const admin = await person("admin");
    const orgId = await provisionTestWorkspace({ userId: admin.id, email: admin.email, name: admin.name, workspaceName });
    const people = { admin } as Record<WorkspaceRole, Person>;
    for (const role of roles.filter((each) => each !== "admin")) {
      const teammate = await person(role);
      people[role] = teammate;
      await addTestMember(orgId, teammate.id, role);
      await withE2EDatabase(async (sql) => {
        await sql`update profiles set full_name = ${teammate.name}, last_workspace_id = ${orgId} where id = ${teammate.id}`;
        await finishFirstRuns(sql, orgId, [teammate.id], "joined");
      });
    }
    for (const each of Object.values(people)) await signInTestUser(each.page, each, orgId);
    return { orgId, workspaceName, people, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** A person's Open Request, ready for pickup; a Guest's is filed as a Guest files one, with no goal. Returns its id. */
export async function seedRoleRequest(orgId: string, author: Pick<Person, "id">, title: string, { guestSubmission = false } = {}): Promise<string> {
  return withE2EDatabase(async (sql) => {
    const goal = guestSubmission ? { guest_submission: true } : { expected_impact: sql.json(GOAL) };
    const [{ id }] = await sql<{ id: string }[]>`
      insert into requests ${sql({ org_id: orgId, title, description: "Returning customers give up when checkout asks for their card again.", created_by: author.id, ...goal })}
      returning id`;
    return id;
  });
}

/** Waits for React to take the control over: typing or a click before that is lost, as the page is only its HTML. */
export async function hydrated(control: Locator): Promise<void> {
  await expect.poll(() => control.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber")))).toBe(true);
}

/** A person's comment on a Request. */
export async function seedComment(requestId: string, author: Pick<Person, "id">, body: string): Promise<void> {
  await withE2EDatabase((sql) => sql`insert into comments ${sql({ request_id: requestId, author_id: author.id, body })}`);
}
