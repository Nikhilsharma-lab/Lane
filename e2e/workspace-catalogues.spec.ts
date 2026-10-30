import { test } from "@playwright/test";
import { provisionAndSignIn } from "./helpers/auth";
import { cleanupTestWorkspace } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, signInTestUser } from "./helpers/test-user";
import {
  catalogueSurfaces, createCatalogueLabel, createCatalogueProject, openCatalogueDraft,
  verifyCataloguePickers, type CatalogueRecorder,
} from "./helpers/workspace-catalogues";

// No Requests or AI reviews are created. The external acceptance recipe reuses
// its exact authorized team; this standard suite owns its one isolated user.
test("Project and Label pickers retain create failures, retry and scope", async ({ browser, page }, testInfo) => {
  test.setTimeout(360_000);
  const user = await createTestUser("catalogues");
  const recorder: CatalogueRecorder = {
    pending: async (kind, name, projectId) => { await testInfo.attach(`pending-${kind}`, { body: JSON.stringify({ kind, name, projectId }), contentType: "application/json" }); },
    aborted: async (kind, name) => { await testInfo.attach(`not-dispatched-${kind}`, { body: JSON.stringify({ kind, name, abortedBeforeDispatch: true }), contentType: "application/json" }); },
    confirmed: async (kind, entry) => { await testInfo.attach(`confirmed-${kind}`, { body: JSON.stringify(entry), contentType: "application/json" }); },
  };
  const capture = async (name: string) => { await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" }); };
  try {
    const orgId = await provisionAndSignIn(page, user, { name: "Catalogue acceptance", workspaceName: "Catalogue acceptance" });
    await openCatalogueDraft(page, orgId);
    const { project } = await createCatalogueProject(page, orgId, "Catalogue acceptance Project", recorder, capture);
    const { label: workspaceLabel } = await createCatalogueLabel(page, orgId, "Catalogue workspace label", null, recorder, capture, true);
    const { label: projectLabel } = await createCatalogueLabel(page, orgId, "Catalogue Project label", project, recorder, capture);
    for (const surface of catalogueSurfaces) {
      const context = await browser.newContext({ viewport: { width: surface.width, height: 900 }, colorScheme: surface.colorScheme });
      try {
        const viewer = await context.newPage();
        await signInTestUser(viewer, user, orgId);
        await verifyCataloguePickers(viewer, orgId, { project, workspaceLabel, projectLabel }, async name => {
          await testInfo.attach(`${surface.width}-${surface.colorScheme}-${name}`, { body: await viewer.screenshot(), contentType: "image/png" });
        });
      } finally { await context.close(); }
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
