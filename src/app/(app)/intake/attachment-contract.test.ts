import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const ACTIONS = source(
  "src/app/(app)/intake/attachment-actions.ts"
);
const DOWNLOADS = source(
  "src/app/(app)/requests/[id]/actions.ts"
);
const FORM = source("src/app/(app)/intake/intake-form.tsx");
const STORAGE = source("src/lib/attachment-storage.ts");
const REVIEW_DETAILS = source("src/components/requests/request-review-supporting-details.tsx");

describe("Private Request attachment contract", () => {
  it("creates the Request before uploading directly to private storage", () => {
    expect(FORM).toContain("callAction(() => saveRequest(payload, context, picks))");
    // The upload session (intake-uploads.ts) uploads the saved Request's files.
    expect(FORM.indexOf("callAction(() => saveRequest(payload, context, picks))")).toBeLessThan(FORM.indexOf("uploads().uploadSaved(result.requestId"));
    expect(FORM).toContain("setCreatedRequestId(result.requestId)");
    expect(FORM).toContain("prepareAttachmentUpload");
    expect(FORM).toContain("uploadToSignedUrl");
    expect(FORM).toContain("finalizeAttachmentUpload");
    expect(FORM).toContain("Files upload after saving.");
    expect(REVIEW_DETAILS).toContain("Files upload after you save the Request.");
  });

  it("derives identity from the session and scopes every reservation", () => {
    expect(ACTIONS).toContain("guardActiveMember(context.orgId,");
    expect(ACTIONS).toContain("eq(requests.orgId, orgId)");
    expect(ACTIONS).toContain("eq(requests.createdBy, userId)");
    expect(ACTIONS).toContain("uploadedBy: auth.userId");
    expect(ACTIONS).toContain("pg_advisory_xact_lock");
  });

  it("uses generated paths and verifies the object before finalizing", () => {
    expect(ACTIONS).toContain(
      "`${auth.orgId}/${parsed.data.requestId}/${attachmentId}`"
    );
    // Storage calls live in attachment-storage.ts.
    expect(ACTIONS).toContain("await signUpload(storagePath)");
    expect(STORAGE).toContain(".createSignedUploadUrl(path, { upsert: false })");
    expect(ACTIONS).toContain("await storedObject(attachment.storagePath)");
    expect(ACTIONS).toContain("stored.size !== attachment.sizeBytes");
    expect(ACTIONS).toContain("uploadedAt: new Date()");
  });

  it("mints a short-lived, filename-preserving download after access checks", () => {
    expect(DOWNLOADS).toContain("guardActiveMember(context.orgId,");
    // Visibility is part of the lookup itself (request-access.ts).
    expect(DOWNLOADS).toContain("seeable(auth),");
    expect(DOWNLOADS).toContain("signDownload(attachment.storagePath, attachment.fileName)");
    expect(STORAGE).toContain(".createSignedUrl(path, 60, { download: fileName })");
  });
});
