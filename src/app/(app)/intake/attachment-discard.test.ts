import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string; requestId: string; orgId: string; uploadedBy: string;
  createdBy: string; storagePath: string; uploadedAt: Date | null;
};
const state = vi.hoisted(() => ({
  rows: [] as Row[], authorized: true,
  storageFailure: "" as "" | "throw" | "returned", deleteFailure: false,
  queried: 0, removed: [] as string[],
}));
vi.mock("@/lib/auth-guard", () => ({
  requireActiveMember: async () => state.authorized
    ? { userId: "user-test", orgId: "org-test", role: "member" } : null,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({ storage: { from: () => ({
    remove: async (paths: string[]) => {
      if (state.storageFailure === "throw") throw new Error("Storage offline");
      if (state.storageFailure === "returned") return { error: new Error("Storage refused delete") };
      state.removed.push(...paths);
      return { data: [], error: null };
    },
  }) } }),
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
  return { ...schema, db: {
    select: () => ({ from: () => ({ innerJoin: () => ({ where: (predicate: SQL) => ({
      limit: async () => { state.queried++; return state.rows.filter((row) => matches(row, predicate)); },
    }) }) }) }),
    delete: () => ({ where: async (predicate: SQL) => {
      if (state.deleteFailure) throw new Error("Database offline");
      state.rows = state.rows.filter((row) => !matches(row, predicate));
    } }),
  } };
});

const requestId = "11111111-1111-4111-8111-111111111111";
const attachmentId = "22222222-2222-4222-8222-222222222222";
const row: Row = {
  id: attachmentId, requestId, orgId: "org-test", uploadedBy: "user-test",
  createdBy: "user-test", storagePath: "org-test/request/reservation", uploadedAt: null,
};
const context = { orgId: "org-test" };
beforeEach(() => {
  state.rows = [{ ...row }]; state.authorized = true;
  state.storageFailure = ""; state.deleteFailure = false; state.queried = 0; state.removed = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("truthful attachment discard", () => {
  it("returns explicit success only after removing the pending object and reservation", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context)).toEqual({ success: true });
    expect(state.rows).toEqual([]);
    expect(state.removed).toEqual([row.storagePath]);
  });

  it.each(["throw", "returned"] as const)("retains the reservation when Storage failure is %s", async (mode) => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    state.storageFailure = mode;
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context))
      .toMatchObject({ success: false, error: { code: "storage_unavailable" } });
    expect(state.rows).toEqual([row]);
  });

  it("contains database deletion failure and allows idempotent retry", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    state.deleteFailure = true;
    await expect(discardAttachmentUpload({ requestId, attachmentId }, context))
      .resolves.toMatchObject({ success: false });
    expect(state.rows).toEqual([row]);
    state.deleteFailure = false;
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context)).toEqual({ success: true });
    expect(state.rows).toEqual([]);
  });

  it("rejects expired sessions before treating missing reservations as success", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    state.authorized = false;
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context))
      .toMatchObject({ success: false, error: { code: "session_expired" } });
    expect(state.queried).toBe(0);
    expect(state.rows).toEqual([row]);
  });

  it("rejects invalid identifiers", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    expect(await discardAttachmentUpload({ requestId, attachmentId: "invalid" }, context))
      .toMatchObject({ success: false, error: { code: "validation" } });
    expect(state.queried).toBe(0);
  });

  it("treats authenticated absence as idempotent success without deleting foreign rows", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    state.rows = [{ ...row, orgId: "foreign-org" }];
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context)).toEqual({ success: true });
    expect(state.rows).toHaveLength(1);
    expect(state.removed).toEqual([]);
  });

  it("reports already-uploaded distinctly without discarding a finalized file", async () => {
    const { discardAttachmentUpload } = await import("./attachment-actions");
    state.rows[0].uploadedAt = new Date();
    expect(await discardAttachmentUpload({ requestId, attachmentId }, context))
      .toEqual({ success: true, alreadyUploaded: true });
    expect(state.rows).toHaveLength(1);
    expect(state.removed).toEqual([]);
  });
});
