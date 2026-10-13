import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, profiles, requests, requestAttachments, workspaces } from "@/db";

const ORG = "org_attachment_capabilities";
const USER = "user_attachment_capabilities";
const state = vi.hoisted(() => ({
  objects: new Map<string, { size: number; contentType: string }>(),
  capabilities: new Map<string, { path: string; expires: number }>(),
  blockFailure: false,
  infoFailure: false,
  infoHook: null as null | (() => Promise<void>),
  signFailure: false,
  user: "user_attachment_capabilities",
}));
vi.mock("@/lib/auth-guard", () => ({
  requireActiveMember: async (orgId: string) => orgId === "org_attachment_capabilities"
    ? { userId: state.user, orgId, role: "member" } : null,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({ storage: { from: () => ({
    createSignedUploadUrl: async (path: string) => {
      if (state.signFailure) throw new Error("Signing unavailable");
      const expires = Math.floor(Date.now() / 1000) + 7200;
      const token = `e30.${Buffer.from(JSON.stringify({ exp: expires })).toString("base64url")}.provider-signature`;
      const signedUrl = `https://storage.invalid/upload/${path}?token=${token}`;
      state.capabilities.set(signedUrl, { path, expires: expires * 1000 });
      return { data: { signedUrl }, error: null };
    },
    info: async (path: string) => {
      const data = state.objects.get(path) ?? null;
      const hook = state.infoHook;
      state.infoHook = null;
      await hook?.();
      return { data, error: state.infoFailure ? new Error("Storage info unavailable") : null };
    },
    upload: async (path: string, body: Blob, options: { upsert: boolean; contentType: string }) => {
      if (state.blockFailure) return { error: new Error("Storage unavailable") };
      if (!options.upsert && state.objects.has(path)) return { error: new Error("Asset already exists") };
      state.objects.set(path, { size: body.size, contentType: options.contentType });
      return { data: { path }, error: null };
    },
  }) } }),
}));
import { prepareAttachmentUpload, finalizeAttachmentUpload, discardAttachmentUpload } from "./attachment-actions";

let requestId: string;
const context = { orgId: ORG };
beforeAll(async () => {
  await db.insert(workspaces).values({ id: ORG, name: "Attachment capabilities", slug: ORG });
  await db.insert(profiles).values({ id: USER, fullName: "Upload owner", email: "capabilities@example.test" });
});
beforeEach(async () => {
  state.objects.clear(); state.capabilities.clear(); state.blockFailure = false; state.infoFailure = false; state.infoHook = null; state.signFailure = false; state.user = USER;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  requestId = randomUUID();
  await db.insert(requests).values({ id: requestId, orgId: ORG, title: "Upload security", description: "Capability accounting", createdBy: USER });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, ORG));
  await db.delete(profiles).where(eq(profiles.id, USER));
});
const prepare = (sizeBytes = 10 * 1024 * 1024) => prepareAttachmentUpload({ requestId, fileName: "proof.txt", mimeType: "text/plain", sizeBytes }, context);
const rows = () => db.select().from(requestAttachments).where(and(eq(requestAttachments.orgId, ORG), eq(requestAttachments.requestId, requestId)));
function upload(url: string, size = 10 * 1024 * 1024) {
  const capability = state.capabilities.get(url)!;
  expect(capability.expires).toBeGreaterThan(Date.now());
  if (state.objects.has(capability.path)) throw new Error("Asset already exists");
  state.objects.set(capability.path, { size, contentType: "text/plain" });
}

describe("signed upload capability accounting", () => {
  it("retains cancelled capabilities in quota so prepare/cancel cannot mint unlimited URLs", async () => {
    for (let i = 0; i < 2; i++) {
      const result = await prepare();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(await discardAttachmentUpload({ requestId, attachmentId: result.attachmentId }, context)).toEqual({ success: true });
      expect(() => upload(result.signedUrl)).toThrow("Asset already exists");
    }
    expect(await rows()).toHaveLength(2);
    expect(await prepare()).toMatchObject({ success: false, error: { code: "limit_reached" } });
    expect(state.capabilities.size).toBe(2);
  });

  it("does not let a cancelled upload become a visible attachment", async () => {
    const prepared = await prepare();
    if (!prepared.success) throw new Error("Preparation failed");
    await discardAttachmentUpload({ requestId, attachmentId: prepared.attachmentId }, context);
    expect(() => upload(prepared.signedUrl)).toThrow("Asset already exists");
    expect(await finalizeAttachmentUpload({ requestId, attachmentId: prepared.attachmentId }, context)).toMatchObject({ success: false });
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0].uploadedAt).toBeNull();
  });

  it("keeps an invalid upload counted while its signed URL can still be reused", async () => {
    const prepared = await prepare();
    if (!prepared.success) throw new Error("Preparation failed");
    upload(prepared.signedUrl, 20);
    expect(await finalizeAttachmentUpload({ requestId, attachmentId: prepared.attachmentId }, context)).toMatchObject({ success: false, error: { code: "upload_incomplete" } });
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0].uploadedAt).toBeNull();
  });

  it("keeps successful finalization idempotent and never discards the saved file", async () => {
    const prepared = await prepare();
    if (!prepared.success) throw new Error("Preparation failed");
    upload(prepared.signedUrl);
    const input = { requestId, attachmentId: prepared.attachmentId };
    expect(await finalizeAttachmentUpload(input, context)).toEqual({ success: true });
    expect(await finalizeAttachmentUpload(input, context)).toEqual({ success: true });
    expect(await discardAttachmentUpload(input, context)).toEqual({ success: true, alreadyUploaded: true });
    expect(state.objects.size).toBe(1);
  });

  it("releases quota only after expiry while retaining the empty path blocker", async () => {
    for (let i = 0; i < 5; i++) {
      const prepared = await prepare(100);
      if (!prepared.success) throw new Error("Preparation failed");
      upload(prepared.signedUrl, 100);
      await discardAttachmentUpload({ requestId, attachmentId: prepared.attachmentId }, context);
    }
    expect(await prepare(100)).toMatchObject({ success: false, error: { code: "limit_reached" } });
    await db.update(requestAttachments).set({ uploadExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(requestAttachments.requestId, requestId));
    expect(await prepare(100)).toMatchObject({ success: true });
    expect(await rows()).toHaveLength(6);
    expect(state.objects.size).toBe(5);
    expect([...state.objects.values()].every(object => object.size === 0)).toBe(true);
  });

  it.each(["blockFailure", "infoFailure"] as const)("keeps expired quota on %s and allows cancellation retry", async failure => {
    const inputs = [];
    state[failure] = true;
    for (let i = 0; i < 5; i++) {
      const prepared = await prepare(100);
      if (!prepared.success) throw new Error("Preparation failed");
      const input = { requestId, attachmentId: prepared.attachmentId };
      inputs.push(input);
      expect(await discardAttachmentUpload(input, context)).toMatchObject({ success: false });
    }
    await db.update(requestAttachments).set({ uploadExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(requestAttachments.requestId, requestId));
    expect(await prepare(100)).toMatchObject({ success: false, error: { code: "limit_reached" } });
    expect((await rows()).every(row => row.discardedAt && !row.uploadBlockedAt)).toBe(true);
    state[failure] = false;
    expect(await discardAttachmentUpload(inputs[0], context)).toEqual({ success: true });
    expect(await prepare(100)).toMatchObject({ success: true });
  });

  it("does not free cancelled rows with unknown provider expiry", async () => {
    for (let i = 0; i < 5; i++) {
      const prepared = await prepare(100);
      if (!prepared.success) throw new Error("Preparation failed");
      await discardAttachmentUpload({ requestId, attachmentId: prepared.attachmentId }, context);
    }
    await db.update(requestAttachments).set({ uploadExpiresAt: null }).where(eq(requestAttachments.requestId, requestId));
    expect(await prepare(100)).toMatchObject({ success: false, error: { code: "limit_reached" } });
  });

  it("cancellation wins against a finalizer using metadata read before cancellation", async () => {
    const prepared = await prepare(100);
    if (!prepared.success) throw new Error("Preparation failed");
    upload(prepared.signedUrl, 100);
    const input = { requestId, attachmentId: prepared.attachmentId };
    let readMetadata!: () => void;
    let resume!: () => void;
    const metadataRead = new Promise<void>(resolve => { readMetadata = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    state.infoHook = async () => { readMetadata(); await paused; };
    const finalize = finalizeAttachmentUpload(input, context);
    await metadataRead;
    try {
      expect(await discardAttachmentUpload(input, context)).toEqual({ success: true });
    } finally { resume(); }
    expect(await finalize).toMatchObject({ success: false, error: { code: "upload_incomplete" } });
    const [row] = await rows();
    expect(row.uploadedAt).toBeNull();
    expect(row.discardedAt).not.toBeNull();
    expect(state.objects.get(row.storagePath)?.size).toBe(0);
  });

  it("serializes simultaneous prepares against the five-file quota", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => prepare(100)));
    expect(results.filter(result => result.success)).toHaveLength(5);
    expect(results.filter(result => !result.success)).toHaveLength(3);
    expect(await rows()).toHaveLength(5);
    expect(state.capabilities.size).toBe(5);
  });

  it("does not let another member cancel or finalize an owner's reservation", async () => {
    const prepared = await prepare(100);
    if (!prepared.success) throw new Error("Preparation failed");
    upload(prepared.signedUrl, 100);
    const input = { requestId, attachmentId: prepared.attachmentId };
    state.user = "another-member";
    expect(await discardAttachmentUpload(input, context)).toEqual({ success: true });
    expect(await finalizeAttachmentUpload(input, context)).toMatchObject({ success: false, error: { code: "request_unavailable" } });
    const [row] = await rows();
    expect(row.discardedAt).toBeNull();
    expect(state.objects.get(row.storagePath)?.size).toBe(100);
  });

});
