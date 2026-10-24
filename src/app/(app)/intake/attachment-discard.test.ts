import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string; requestId: string; orgId: string; uploadedBy: string;
  createdBy: string; storagePath: string; mimeType: string; sizeBytes: number;
  uploadedAt: Date | null; discardedAt: Date | null; uploadBlockedAt: Date | null;
};
type Upload = {
  path: string; body: Blob; options: { upsert: boolean; contentType: string };
  discardedAt: Date | null;
};
const state = vi.hoisted(() => ({
  rows: [] as Row[], authorized: true,
  storageFailure: "" as "" | "client" | "throw" | "returned",
  verificationFailure: "" as "" | "throw" | "returned" | "missing" | "nonempty",
  updateFailure: "" as "" | "discardedAt" | "uploadBlockedAt",
  queried: 0, uploads: [] as Upload[], inspected: [] as string[],
  removed: [] as string[], deletedRows: 0,
}));
vi.mock("@/lib/auth-guard", () => ({
  guardActiveMember: async () => state.authorized
    ? { userId: "user-test", orgId: "org-test", role: "member" } : { error: "Session ended", sessionExpired: true },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => {
    if (state.storageFailure === "client") throw new Error("Storage client unavailable");
    return { storage: { from: () => ({
      upload: async (path: string, body: Blob, options: Upload["options"]) => {
        state.uploads.push({
          path, body, options,
          discardedAt: state.rows.find((row) => row.storagePath === path)?.discardedAt ?? null,
        });
        if (state.storageFailure === "throw") throw new Error("Storage offline");
        if (state.storageFailure === "returned") return { error: new Error("Storage refused upload") };
        return { data: { path }, error: null };
      },
      info: async (path: string) => {
        state.inspected.push(path);
        if (state.verificationFailure === "throw") throw new Error("Storage verification unavailable");
        if (state.verificationFailure === "returned") return { data: null, error: new Error("Cannot inspect object") };
        if (state.verificationFailure === "missing") return { data: null, error: null };
        return { data: { size: state.verificationFailure === "nonempty" ? 100 : 0 }, error: null };
      },
      // Keep destructive operations observable: cancellation must never delete
      // a path that an outstanding signed capability could recreate.
      remove: async (paths: string[]) => {
        state.removed.push(...paths);
        return { data: [], error: null };
      },
    }) } };
  },
}));
function matches(row: Row, predicate: SQL) {
  const query = new PgDialect().sqlToQuery(predicate);
  const fields = {
    id: "id", request_id: "requestId", org_id: "orgId", uploaded_by: "uploadedBy", created_by: "createdBy",
  } as const;
  return [...query.sql.matchAll(/"(id|request_id|org_id|uploaded_by|created_by)" = \$(\d+)/g)]
    .every((match) => row[fields[match[1] as keyof typeof fields]] === query.params[Number(match[2]) - 1])
    && (!query.sql.includes('"uploaded_at" is null') || !row.uploadedAt);
}
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const connection = {
    execute: async () => undefined,
    select: () => ({ from: () => ({ innerJoin: () => ({ where: (predicate: SQL) => ({
      limit: async () => {
        state.queried++;
        return state.rows.filter((row) => matches(row, predicate)).map((row) => ({ ...row }));
      },
    }) }) }) }),
    update: () => ({ set: (values: Partial<Row>) => ({ where: async (predicate: SQL) => {
      if (state.updateFailure && state.updateFailure in values) throw new Error("Database offline");
      state.rows.filter((row) => matches(row, predicate)).forEach((row) => Object.assign(row, values));
    } }) }),
    delete: () => ({ where: async (predicate: SQL) => {
      const remaining = state.rows.filter((row) => !matches(row, predicate));
      state.deletedRows += state.rows.length - remaining.length;
      state.rows = remaining;
    } }),
  };
  return { ...schema, db: {
    ...connection,
    transaction: async <T>(run: (tx: typeof connection) => Promise<T>) => {
      const before = state.rows.map((row) => ({ ...row }));
      try {
        return await run(connection);
      } catch (error) {
        state.rows = before;
        throw error;
      }
    },
  } };
});

const requestId = "11111111-1111-4111-8111-111111111111";
const attachmentId = "22222222-2222-4222-8222-222222222222";
const row: Row = {
  id: attachmentId, requestId, orgId: "org-test", uploadedBy: "user-test",
  createdBy: "user-test", storagePath: "org-test/request/reservation", mimeType: "text/plain", sizeBytes: 100,
  uploadedAt: null, discardedAt: null, uploadBlockedAt: null,
};
const context = { orgId: "org-test" };
beforeEach(() => {
  state.rows = [{ ...row }]; state.authorized = true;
  state.storageFailure = ""; state.verificationFailure = ""; state.updateFailure = "";
  state.queried = 0; state.uploads = []; state.inspected = []; state.removed = []; state.deletedRows = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("truthful attachment discard", () => {
  it("marks cancellation before occupying the path with a verified empty live object and retains the row", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context)).toEqual({ success: true });
    expect(state.rows).toEqual([{ ...row, discardedAt: expect.any(Date), uploadBlockedAt: expect.any(Date) }]);
    expect(state.uploads).toHaveLength(1);
    const upload = state.uploads[0];
    expect(upload).toMatchObject({
      path: row.storagePath, discardedAt: expect.any(Date),
      options: { upsert: true, contentType: "text/plain" },
    });
    expect(upload.body).toBeInstanceOf(Blob);
    expect(upload.body.size).toBe(0);
    expect(upload.body.type).toBe("text/plain");
    expect(state.inspected).toEqual([row.storagePath]);
    expect(state.removed).toEqual([]);
    expect(state.deletedRows).toBe(0);
  });

  it.each(["client", "throw", "returned"] as const)("retains cancelled quota when Storage failure is %s", async (mode) => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    state.storageFailure = mode;
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context))
      .toMatchObject({ success: false, error: { code: "storage_unavailable" } });
    expect(state.rows).toEqual([{ ...row, discardedAt: expect.any(Date) }]);
    expect(state.inspected).toEqual([]);
    expect(state.removed).toEqual([]);
    expect(state.deletedRows).toBe(0);
  });

  it.each(["throw", "returned", "missing", "nonempty"] as const)(
    "does not mark the capability blocked when verification is %s", async (mode) => {
      const { discardAttachmentUpload } = await import("./attachment-actions");
      state.verificationFailure = mode;
      expect(await discardAttachmentUpload({ requestId, attachmentId }, context))
        .toMatchObject({ success: false, error: { code: "storage_unavailable" } });
      expect(state.rows).toEqual([{ ...row, discardedAt: expect.any(Date) }]);
      expect(state.uploads).toHaveLength(1);
      expect(state.inspected).toEqual([row.storagePath]);
      expect(state.removed).toEqual([]);
      expect(state.deletedRows).toBe(0);
    }
  );

  it("does not touch Storage unless cancellation is durably recorded", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    state.updateFailure = "discardedAt";
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context))
      .toMatchObject({ success: false, error: { code: "storage_unavailable" } });
    expect(state.rows).toEqual([row]);
    expect(state.uploads).toEqual([]);
    expect(state.inspected).toEqual([]);
  });

  it("retains quota after failure to record the blocker and allows a safe retry", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    state.updateFailure = "uploadBlockedAt";
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context))
      .toMatchObject({ success: false, error: { code: "storage_unavailable" } });
    expect(state.rows).toEqual([{ ...row, discardedAt: expect.any(Date) }]);
    const discardedAt = state.rows[0].discardedAt;
    state.updateFailure = "";
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context)).toEqual({ success: true });
    expect(state.rows).toEqual([{ ...row, discardedAt, uploadBlockedAt: expect.any(Date) }]);
    expect(state.uploads).toHaveLength(2);
    expect(state.removed).toEqual([]);
    expect(state.deletedRows).toBe(0);
  });

  it("retries a cancelled but unblocked upload and preserves the first cancellation time", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    const discardedAt = new Date("2026-10-11T08:00:00.000Z");
    state.rows[0].discardedAt = discardedAt;
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context)).toEqual({ success: true });
    expect(state.rows).toEqual([{ ...row, discardedAt, uploadBlockedAt: expect.any(Date) }]);
    expect(state.uploads).toHaveLength(1);
  });

  it("returns idempotent success without replacing an already confirmed blocker", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    const blocked = { ...row, discardedAt: new Date(), uploadBlockedAt: new Date() };
    state.rows = [blocked];
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context)).toEqual({ success: true });
    expect(state.rows).toEqual([blocked]);
    expect(state.uploads).toEqual([]);
    expect(state.inspected).toEqual([]);
    expect(state.removed).toEqual([]);
    expect(state.deletedRows).toBe(0);
  });

  it("rejects expired sessions before treating missing reservations as success", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    state.authorized = false;
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context))
      .toMatchObject({ success: false, error: { code: "session_expired" } });
    expect(state.queried).toBe(0);
    expect(state.rows).toEqual([row]);
    expect(state.uploads).toEqual([]);
  });

  it("rejects invalid identifiers", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    expect(await discardAttachmentUpload({ requestId, attachmentId: "invalid" }, context))
      .toMatchObject({ success: false, error: { code: "validation" } });
    expect(state.queried).toBe(0);
    expect(state.uploads).toEqual([]);
  });

  it.each([
    { orgId: "foreign-org" },
    { uploadedBy: "foreign-user" },
    { createdBy: "foreign-creator" },
    { requestId: "33333333-3333-4333-8333-333333333333" },
    { id: "44444444-4444-4444-8444-444444444444" },
  ])("does not discard a reservation outside the caller's scope: %j", async (difference) => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    const foreign = { ...row, ...difference };
    state.rows = [foreign];
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context)).toEqual({ success: true });
    expect(state.rows).toEqual([foreign]);
    expect(state.uploads).toEqual([]);
    expect(state.removed).toEqual([]);
    expect(state.deletedRows).toBe(0);
  });

  it("treats authenticated absence as idempotent success", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    state.rows = [];
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context)).toEqual({ success: true });
    expect(state.uploads).toEqual([]);
    expect(state.removed).toEqual([]);
  });

  it("reports already-uploaded distinctly without touching a finalized file", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    const finalized = { ...row, uploadedAt: new Date() };
    state.rows = [finalized];
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context))
      .toEqual({ success: true, alreadyUploaded: true });
    expect(state.rows).toEqual([finalized]);
    expect(state.uploads).toEqual([]);
    expect(state.inspected).toEqual([]);
    expect(state.removed).toEqual([]);
    expect(state.deletedRows).toBe(0);
  });
});
