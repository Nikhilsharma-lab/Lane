import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Reservation = {
  id: string;
  orgId: string;
  requestId: string;
  uploadedBy: string;
  sizeBytes: number;
  uploadedAt?: Date;
  uploadExpiresAt?: Date;
};

const state = vi.hoisted(() => ({
  rows: [] as Reservation[],
  clientFailure: false,
  signingFailure: false,
  returnedFailure: false,
  cleanupFailure: false,
  queryFailure: false,
  expiryWriteFailure: false,
  expiryWriteMissing: false,
  signedUrl: "",
  signingOptions: [] as unknown[],
  cleanupAttempts: 0,
}));

vi.mock("@/lib/auth-guard", () => ({
  signedInAsViewer: async () => false,
  VIEWER_REFUSAL: "viewer",
  requireCanContribute: async () => ({ userId: "user-test", orgId: "org-test", role: "member" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => {
    if (state.clientFailure) throw new Error("Storage client unavailable");
    return { storage: { from: () => ({
      createSignedUploadUrl: async (_path: string, options: unknown) => {
        state.signingOptions.push(options);
        if (state.signingFailure) throw new Error("Storage signer unavailable");
        return state.returnedFailure
          ? { data: null, error: new Error("Storage declined signing") }
          : { data: { signedUrl: state.signedUrl }, error: null };
      },
    }) } };
  },
}));

vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const tx = {
    execute: async () => undefined,
    select: () => ({ from: () => ({ where: async () => [{
      fileCount: state.rows.filter((row) => row.requestId === REQUEST_ID).length,
      totalBytes: state.rows.filter((row) => row.requestId === REQUEST_ID)
        .reduce((sum, row) => sum + row.sizeBytes, 0),
    }] }) }),
    insert: () => ({ values: async (row: Reservation) => { state.rows.push(row); } }),
  };
  return {
    ...schema,
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: REQUEST_ID }] }) }) }),
      transaction: async (run: (connection: typeof tx) => Promise<boolean>) => {
        if (state.queryFailure) throw new Error("Reservation transaction unavailable");
        return run(tx);
      },
      update: () => ({ set: (values: Partial<Reservation>) => ({ where: (predicate: SQL) => ({
        returning: async () => {
          if (state.expiryWriteFailure) throw new Error("Expiry persistence unavailable");
          if (state.expiryWriteMissing) return [];
          const rows = state.rows.filter((row) => matches(row, predicate));
          rows.forEach((row) => Object.assign(row, values));
          return rows.map((row) => ({ id: row.id }));
        },
      }) }) }),
      delete: () => ({ where: async (predicate: SQL) => {
        state.cleanupAttempts += 1;
        if (state.cleanupFailure) throw new Error("Cleanup database unavailable");
        // Interpret the real Drizzle predicate against in-memory rows, so a
        // broadened cleanup would actually remove the unrelated fixture.
        state.rows = state.rows.filter((row) => !matches(row, predicate));
      } }),
    },
  };
});

function matches(row: Reservation, predicate: SQL) {
  const query = new PgDialect().sqlToQuery(predicate);
  const fields = { id: "id", org_id: "orgId", request_id: "requestId", uploaded_by: "uploadedBy" } as const;
  return [...query.sql.matchAll(/"(id|org_id|request_id|uploaded_by)" = \$(\d+)/g)]
    .every((match) => row[fields[match[1] as keyof typeof fields]] === query.params[Number(match[2]) - 1])
    && (!query.sql.includes('"uploaded_at" is null') || !row.uploadedAt);
}

function signedUrl(payload: unknown) {
  const tokenPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `https://storage.example.test/signed?token=header.${tokenPayload}.signature`;
}

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const other: Reservation = {
  id: "22222222-2222-4222-8222-222222222222", orgId: "other-org",
  requestId: "33333333-3333-4333-8333-333333333333", uploadedBy: "other-user", sizeBytes: 100,
};
const existing: Reservation = {
  id: "44444444-4444-4444-8444-444444444444", orgId: "org-test",
  requestId: REQUEST_ID, uploadedBy: "user-test", sizeBytes: 100,
};
const input = { requestId: REQUEST_ID, fileName: "evidence.txt", mimeType: "text/plain", sizeBytes: 100 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T10:00:00.000Z"));
  state.rows = [{ ...other }, { ...existing }];
  state.clientFailure = state.signingFailure = state.returnedFailure = false;
  state.cleanupFailure = state.queryFailure = false;
  state.expiryWriteFailure = state.expiryWriteMissing = false;
  state.signedUrl = signedUrl({ exp: 1791720000 }); // 2026-10-11 12:00 UTC
  state.signingOptions = [];
  state.cleanupAttempts = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("attachment reservation cleanup", () => {
  it.each(["clientFailure", "signingFailure", "returnedFailure", "expiryWriteFailure", "expiryWriteMissing"] as const)(
    "releases only its reservation after %s, allowing a healthy retry",
    async (failure) => {
      const { prepareAttachmentUpload } = await import("./attachment-actions");
      state[failure] = true;
      const failed = await prepareAttachmentUpload(input, { orgId: "org-test" });
      expect(failed).toMatchObject({ success: false, error: { code: "storage_unavailable" } });
      expect(state.rows).toEqual([other, existing]);
      state[failure] = false;
      const retry = await prepareAttachmentUpload(input, { orgId: "org-test" });
      expect(retry).toMatchObject({ success: true });
      expect(state.rows).toHaveLength(3);
    }
  );

  it("records the provider expiry before returning a non-overwriting upload capability", async () => {
    const { prepareAttachmentUpload } = await import("./attachment-actions");
    const result = await prepareAttachmentUpload(input, { orgId: "org-test" });
    expect(result).toMatchObject({ success: true, signedUrl: state.signedUrl });
    if (!result.success) throw new Error("Expected prepared upload");
    expect(state.rows.find((row) => row.id === result.attachmentId)).toMatchObject({
      orgId: "org-test", uploadedBy: "user-test", requestId: REQUEST_ID,
      uploadExpiresAt: new Date("2026-10-11T12:00:00.000Z"),
    });
    expect(state.signingOptions).toEqual([{ upsert: false }]);
    expect(state.rows).toContainEqual(existing);
    expect(state.rows).toContainEqual(other);
    expect(state.cleanupAttempts).toBe(0);
  });

  it.each([
    ["missing token", "https://storage.example.test/signed"],
    ["invalid URL", "not-a-url"],
    ["invalid JSON", "https://storage.example.test/signed?token=header.bm90LWpzb24.signature"],
    ["missing expiry", signedUrl({})],
    ["string expiry", signedUrl({ exp: "1791720000" })],
    ["expired capability", signedUrl({ exp: 1791712800 })],
    ["fractional expiry", signedUrl({ exp: 1791720000.5 })],
    ["out-of-range date", signedUrl({ exp: Number.MAX_SAFE_INTEGER })],
  ])("does not disclose a capability with %s and releases only its reservation", async (_label, url) => {
    const { prepareAttachmentUpload } = await import("./attachment-actions");
    state.signedUrl = url;
    const result = await prepareAttachmentUpload(input, { orgId: "org-test" });
    expect(result).toMatchObject({ success: false, error: { code: "storage_unavailable" } });
    expect(result).not.toHaveProperty("signedUrl");
    expect(state.rows).toEqual([other, existing]);
    expect(state.cleanupAttempts).toBe(1);
  });

  it("does not exhaust the five-file quota after repeated thrown signing failures", async () => {
    const { prepareAttachmentUpload } = await import("./attachment-actions");
    state.signingFailure = true;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect(await prepareAttachmentUpload(input, { orgId: "org-test" }))
        .toMatchObject({ success: false, error: { code: "storage_unavailable" } });
    }
    expect(state.rows).toEqual([other, existing]);
  });

  it("contains cleanup errors and preserves the upload failure response", async () => {
    const { prepareAttachmentUpload } = await import("./attachment-actions");
    state.clientFailure = state.cleanupFailure = true;
    const result = await prepareAttachmentUpload(input, { orgId: "org-test" });
    expect(result).toMatchObject({ success: false, error: { code: "storage_unavailable" } });
    expect(state.cleanupAttempts).toBe(1);
    expect(state.rows).toContainEqual(other);
  });

  it("does not delete anything if reservation never commits", async () => {
    const { prepareAttachmentUpload } = await import("./attachment-actions");
    state.queryFailure = true;
    await prepareAttachmentUpload(input, { orgId: "org-test" });
    expect(state.rows).toEqual([other, existing]);
    expect(state.cleanupAttempts).toBe(0);
  });
});
