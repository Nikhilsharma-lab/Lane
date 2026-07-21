import { describe, expect, it } from "vitest";

import {
  MAX_ATTACHMENT_BYTES,
  validateAttachmentMetadata,
  validateAttachmentSelection,
} from "./request-attachments";

describe("Request attachment validation", () => {
  it("accepts an approved PRD and keeps its original filename", () => {
    expect(
      validateAttachmentMetadata({
        fileName: "Customer trust PRD.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2_400_000,
      })
    ).toEqual({
      valid: true,
      metadata: {
        fileName: "Customer trust PRD.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2_400_000,
      },
    });
  });

  it("rejects disguised, executable, and oversized files", () => {
    expect(
      validateAttachmentMetadata({
        fileName: "research.pdf",
        mimeType: "text/html",
        sizeBytes: 100,
      }).valid
    ).toBe(false);
    expect(
      validateAttachmentMetadata({
        fileName: "installer.exe",
        mimeType: "application/octet-stream",
        sizeBytes: 100,
      }).valid
    ).toBe(false);
    expect(
      validateAttachmentMetadata({
        fileName: "large.pdf",
        mimeType: "application/pdf",
        sizeBytes: MAX_ATTACHMENT_BYTES + 1,
      }).valid
    ).toBe(false);
  });

  it("enforces the combined five-file and 25 MB contract", () => {
    const file = {
      fileName: "evidence.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5 * 1024 * 1024,
    };
    expect(validateAttachmentSelection(Array(5).fill(file))).toEqual({
      valid: true,
    });
    expect(validateAttachmentSelection(Array(6).fill(file)).valid).toBe(
      false
    );
  });
});
