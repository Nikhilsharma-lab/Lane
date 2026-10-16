import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { intakeDraftScope } from "./intake-draft";
import { clearUnfinishedUploads, readLostUploads, readUnfinishedUploads, unfinishedUploadsKey, unfinishedUploadsScope, writeUnfinishedUploads, type UnfinishedUploads } from "./unfinished-uploads";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const NOW = Date.UTC(2026, 9, 11, 12);
const SCOPE = unfinishedUploadsScope("user_member", "org_a");
const record: UnfinishedUploads = {
  requestId: "00000000-0000-4000-8000-000000000123",
  title: "Checkout drops at the phone step",
  files: [
    { key: "a", name: "phone-step.png", attachmentId: "00000000-0000-4000-8000-0000000000aa" },
    { key: "b", name: "funnel.csv", attachmentId: null },
  ],
};

describe("Unfinished uploads record (plan item 2.3, S3)", () => {
  it("round-trips the Request and the files that had not finished, stamped with this document", () => {
    const storage = memoryStorage();
    expect(writeUnfinishedUploads(storage, SCOPE, record, NOW)).toBe(true);
    expect(readUnfinishedUploads(storage, SCOPE, NOW + 1000)).toEqual({ ...record, origin: performance.timeOrigin });
  });

  it("is reload evidence only when an earlier document wrote it", () => {
    const storage = memoryStorage();
    // This document's own record: its composer may still be uploading, or was just left.
    writeUnfinishedUploads(storage, SCOPE, record, NOW);
    expect(readLostUploads(storage, SCOPE, NOW)).toBeNull();
    expect(readUnfinishedUploads(storage, SCOPE, NOW)).not.toBeNull();
    // A record the document before a reload left keeps its origin when rewritten.
    const earlier = { ...record, origin: performance.timeOrigin - 60_000 };
    writeUnfinishedUploads(storage, SCOPE, earlier, NOW);
    expect(readLostUploads(storage, SCOPE, NOW)).toEqual(earlier);
    writeUnfinishedUploads(storage, SCOPE, { ...earlier, files: earlier.files.slice(1) }, NOW);
    expect(readLostUploads(storage, SCOPE, NOW)?.origin).toBe(earlier.origin);
    // A record without an origin came from an earlier document too.
    storage.setItem(unfinishedUploadsKey(SCOPE), JSON.stringify({ version: 1, savedAt: NOW, ...record }));
    expect(readLostUploads(storage, SCOPE, NOW)).toEqual(record);
  });

  it("uses the Intake draft's person-and-workspace scope", () => {
    expect(SCOPE).toBe(intakeDraftScope("user_member", "org_a"));
    const storage = memoryStorage();
    writeUnfinishedUploads(storage, SCOPE, record, NOW);
    expect(readUnfinishedUploads(storage, unfinishedUploadsScope("user_member", "org_b"), NOW)).toBeNull();
    expect(readUnfinishedUploads(storage, unfinishedUploadsScope("user_other", "org_a"), NOW)).toBeNull();
  });

  it("expires after 24 hours and rejects a record from the future", () => {
    const storage = memoryStorage();
    writeUnfinishedUploads(storage, SCOPE, record, NOW);
    expect(readUnfinishedUploads(storage, SCOPE, NOW + 24 * 60 * 60 * 1000 + 1)).toBeNull();
    expect(storage.values.size).toBe(0);
    writeUnfinishedUploads(storage, SCOPE, record, NOW + 5 * 60 * 1000);
    expect(readUnfinishedUploads(storage, SCOPE, NOW)).toBeNull();
  });

  it("drops bad JSON and records of the wrong shape", () => {
    const storage = memoryStorage();
    const key = unfinishedUploadsKey(SCOPE);
    for (const raw of ["{", "null", JSON.stringify({ version: 1, savedAt: NOW, ...record, files: [] }), JSON.stringify({ version: 1, savedAt: NOW, ...record, files: [{ key: "a", name: "", attachmentId: null }] }), JSON.stringify({ version: 2, savedAt: NOW, ...record })]) {
      storage.setItem(key, raw);
      expect(readUnfinishedUploads(storage, SCOPE, NOW)).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    }
  });

  it("clears the record when no file is left, and on request", () => {
    const storage = memoryStorage();
    writeUnfinishedUploads(storage, SCOPE, record, NOW);
    writeUnfinishedUploads(storage, SCOPE, { ...record, files: [] }, NOW);
    expect(storage.values.size).toBe(0);
    writeUnfinishedUploads(storage, SCOPE, record, NOW);
    clearUnfinishedUploads(storage, SCOPE);
    expect(storage.values.size).toBe(0);
  });

  it("survives storage that throws", () => {
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(writeUnfinishedUploads(throwing, SCOPE, record, NOW)).toBe(false);
    expect(readUnfinishedUploads(throwing, SCOPE, NOW)).toBeNull();
    expect(() => clearUnfinishedUploads(throwing, SCOPE)).not.toThrow();
  });

  it("never uses localStorage or a schema library", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/unfinished-uploads.ts"), "utf8");
    expect(source).not.toContain("localStorage");
    expect(source).not.toMatch(/from "zod"/);
  });
});
