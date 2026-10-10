import { expect, test, type BrowserContext, type Request } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { createServiceClient } from "../src/lib/supabase/admin";
import { provisionAndSignIn } from "./helpers/auth";
import { cleanupTestWorkspace } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

type CapturedAction = {
  url: string;
  actionId: string;
  contentType: string;
  args: unknown[];
};

function captureAction(request: Request): CapturedAction | null {
  const actionId = request.headers()["next-action"];
  if (!actionId || request.method() !== "POST") return null;

  try {
    const args: unknown = JSON.parse(request.postData() ?? "null");
    if (!Array.isArray(args)) return null;
    return {
      url: request.url(),
      actionId,
      contentType: request.headers()["content-type"] ?? "text/plain;charset=UTF-8",
      args,
    };
  } catch {
    return null;
  }
}

async function replayAction(
  context: BrowserContext,
  action: CapturedAction,
  orgId?: string
): Promise<string> {
  const args = structuredClone(action.args);
  if (orgId) args[1] = { orgId };

  // Reuse only the public action ID and payload. Cookies come from the caller's
  // own browser context, never from the authorized member's captured request.
  const response = await context.request.post(action.url, {
    headers: {
      "Next-Action": action.actionId,
      "Content-Type": action.contentType,
      Origin: new URL(action.url).origin,
    },
    data: JSON.stringify(args),
  });
  expect(response.status()).toBe(200);
  return response.text();
}

test("private attachments survive Clerk upload and download but reject anonymous and foreign workspaces", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  // This harness provisions disposable identities and removes its fixtures.
  // Deliberately refuse production even when E2E_BASE_URL is supplied by hand.
  expect(["localhost", "127.0.0.1", "lane-staging.vercel.app"]).toContain(
    new URL(baseURL!).hostname
  );

  const userA = await createTestUser("attachments-a");
  const userB = await createTestUser("attachments-b");
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const anonymous = await browser.newContext();
  const filename = "lane-private-evidence.txt";
  const contents = "Private evidence fixture: customers cannot recover their saved drafts.\n";
  let uploadedStoragePath: string | null = null;

  try {
    const pageA = await contextA.newPage();
    const orgA = await provisionAndSignIn(pageA, userA, {
      name: "Attachment Owner",
      workspaceName: "Attachment Workspace A",
    });
    const pageB = await contextB.newPage();
    const orgB = await provisionAndSignIn(pageB, userB, {
      name: "Attachment Outsider",
      workspaceName: "Attachment Workspace B",
    });
    await expect(pageB.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();

    let prepareAction: CapturedAction | null = null;
    let finalizeAction: CapturedAction | null = null;
    let downloadAction: CapturedAction | null = null;
    pageA.on("request", (request) => {
      const action = captureAction(request);
      if (action) {
        const input = action.args[0];
        if (input && typeof input === "object") {
          if ("fileName" in input && "sizeBytes" in input) prepareAction = action;
          else if ("attachmentId" in input && "requestId" in input) finalizeAction = action;
        } else if (typeof input === "string" && action.args.length === 2) {
          downloadAction = action;
        }
      }

      const url = new URL(request.url());
      const marker = "/storage/v1/object/upload/sign/request-attachments/";
      if (request.method() === "PUT" && url.pathname.startsWith(marker)) {
        uploadedStoragePath = decodeURIComponent(url.pathname.slice(marker.length));
      }
    });

    await pageA.goto("/intake");
    await pageA.getByRole("textbox", { name: "Short title" }).fill(
      "Customers cannot find saved drafts after returning to their workspace"
    );
    await pageA.getByRole("textbox", { name: "What happened?" }).fill(contents);
    await pageA.getByRole("button", { name: "Continue", exact: true }).click();
    await pageA.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: "text/plain",
      buffer: Buffer.from(contents),
    });
    await expect(pageA.getByRole("list", { name: "Files ready to upload" })).toContainText(filename);
    await pageA.getByRole("button", { name: "Review Request", exact: true }).click();
    await pageA.getByRole("button", { name: "Check Request", exact: true }).click();
    // The existing Intake gate runs normally; the auth/storage paths are never mocked.
    await expect(pageA.getByRole("button", { name: "Create Request", exact: true })).toBeVisible({ timeout: 45_000 });
    await pageA.getByRole("button", { name: "Create Request", exact: true }).click();
    await pageA.waitForURL("**/requests/**", { timeout: 45_000 });
    const requestUrl = pageA.url();
    await expect(pageA.getByText(filename, { exact: true })).toBeVisible();

    // The attachment list only includes rows finalized after Storage metadata
    // verification. A byte-for-byte download also catches broken upload payloads.
    const downloadPromise = pageA.waitForEvent("download");
    await pageA.getByRole("button", { name: "Download file", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(filename);
    const destination = testInfo.outputPath(filename);
    await download.saveAs(destination);
    expect(await readFile(destination, "utf8")).toBe(contents);
    expect(uploadedStoragePath).toMatch(new RegExp(`^${orgA}/`));
    expect(prepareAction).not.toBeNull();
    expect(finalizeAction).not.toBeNull();
    expect(downloadAction).not.toBeNull();

    await pageB.goto(requestUrl);
    await expect(pageB.getByText(/could not be found/i)).toBeVisible();
    await expect(pageB.getByText(filename, { exact: true })).toHaveCount(0);
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(requestUrl);
    await expect(anonymousPage).toHaveURL(/\/login/);
    await expect(anonymousPage.getByText(filename, { exact: true })).toHaveCount(0);

    // Knowing an action ID, attachment ID, and workspace ID is not authority.
    // Test both a forged victim context and the attacker's legitimate context.
    for (const caller of [
      { context: anonymous, orgId: undefined },
      { context: contextB, orgId: undefined },
      { context: contextB, orgId: orgB },
    ]) {
      for (const action of [prepareAction!, finalizeAction!]) {
        const body = await replayAction(caller.context, action, caller.orgId);
        expect(body).toContain('"success":false');
        expect(body).toMatch(/session_expired|request_unavailable/);
        expect(body).not.toContain('"signedUrl"');
      }
      const body = await replayAction(caller.context, downloadAction!, caller.orgId);
      expect(body).toContain("File not found");
      expect(body).not.toContain("/storage/v1/object/sign/");
    }

    // A signed URL is a temporary bearer capability; it is not expected to
    // recheck Clerk. The unsigned public-storage URL must still deny access.
    const signedUrl = new URL(download.url());
    const publicUrl = new URL(
      `/storage/v1/object/public/request-attachments/${uploadedStoragePath}`,
      signedUrl.origin
    );
    const publicResponse = await anonymous.request.get(publicUrl.href);
    expect(publicResponse.ok()).toBe(false);
    expect(await publicResponse.text()).not.toContain(contents);
  } finally {
    try {
      if (uploadedStoragePath) {
        const { error } = await createServiceClient().storage
          .from("request-attachments")
          .remove([uploadedStoragePath]);
        expect(error, "remove only this test's uploaded object").toBeNull();
      }
    } finally {
      await contextA.close();
      await contextB.close();
      await anonymous.close();
      await cleanupTestWorkspace(userA.id);
      await cleanupTestWorkspace(userB.id);
      await deleteTestUser(userA.id);
      await deleteTestUser(userB.id);
    }
  }
});
