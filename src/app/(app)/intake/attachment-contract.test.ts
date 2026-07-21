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

describe("Private Request attachment contract", () => {
  it("creates the Request before uploading directly to private storage", () => {
    expect(FORM).toContain("const result: SaveResponse = await saveRequest");
    expect(FORM).toContain("setCreatedRequestId(result.requestId)");
    expect(FORM).toContain(
      "uploadAttachment(attachment, result.requestId)"
    );
    expect(FORM).toContain("prepareAttachmentUpload");
    expect(FORM).toContain("uploadToSignedUrl");
    expect(FORM).toContain("finalizeAttachmentUpload");
    expect(FORM).toContain("Files upload only after you confirm");
  });

  it("derives identity from the session and scopes every reservation", () => {
    expect(ACTIONS).toContain("requireActiveMember(context.orgId)");
    expect(ACTIONS).toContain("eq(requests.orgId, orgId)");
    expect(ACTIONS).toContain("eq(requests.createdBy, userId)");
    expect(ACTIONS).toContain("uploadedBy: auth.userId");
    expect(ACTIONS).toContain("pg_advisory_xact_lock");
  });

  it("uses generated paths and verifies the object before finalizing", () => {
    expect(ACTIONS).toContain(
      "`${auth.orgId}/${parsed.data.requestId}/${attachmentId}`"
    );
    expect(ACTIONS).toContain(".createSignedUploadUrl");
    expect(ACTIONS).toContain(".info(attachment.storagePath)");
    expect(ACTIONS).toContain("data.size !== attachment.sizeBytes");
    expect(ACTIONS).toContain("uploadedAt: new Date()");
  });

  it("mints a short-lived, filename-preserving download after access checks", () => {
    expect(DOWNLOADS).toContain("requireActiveMember(context.orgId)");
    expect(DOWNLOADS).toContain('auth.role === "guest"');
    expect(DOWNLOADS).toContain("requestCreatedBy !== auth.userId");
    expect(DOWNLOADS).toContain(".createSignedUrl(attachment.storagePath, 60");
    expect(DOWNLOADS).toContain("download: attachment.fileName");
  });
});
