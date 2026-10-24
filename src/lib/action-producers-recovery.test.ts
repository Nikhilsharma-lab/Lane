import { describe, expect, it, vi } from "vitest";
import { callAction, isSessionFailure } from "./action-call";
import { queryCounter } from "@/db";
import { runTriage, saveRequest } from "@/app/(app)/intake/actions";
import { prepareAttachmentUpload, finalizeAttachmentUpload, discardAttachmentUpload } from "@/app/(app)/intake/attachment-actions";
import { listProjects, createProject } from "@/app/(app)/intake/project-actions";
import { listLabels, createLabel } from "@/app/(app)/intake/label-actions";
import { markNotificationRead, markNotificationUnread, markAllNotificationsRead } from "@/app/(app)/notifications/actions";
import { readRequestRelease } from "@/app/(app)/requests/[id]/release-actions";
import { readRequestOutcome } from "@/app/(app)/requests/[id]/outcome-actions";
import { readReviews, loadReviewerPeople } from "@/app/(app)/requests/[id]/reviewer-actions";
import { addComment, getAttachmentDownloadUrl, deleteRequest, setRequestPriority, undoMarkDone } from "@/app/(app)/requests/[id]/actions";
import { saveRequestEdits } from "@/app/(app)/requests/[id]/edit-actions";
import { saveOnboardingRole } from "@/app/(auth)/onboarding/actions";

const boundary = vi.hoisted(() => ({ session: { userId: null, orgId: null, orgRole: null } as { userId: string | null; orgId: string | null; orgRole: string | null } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => boundary.session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const orgId = "org_test_a";
const context = { orgId };
const id = "00000000-0000-4000-a000-000000000001";
const attachment = { requestId: id, attachmentId: id };
const actions: [string, () => Promise<unknown>][] = [
  ["Intake review", () => runTriage({ title: "Need", description: "Customer problem" }, context)],
  ["Intake save", () => saveRequest({ token: "invalid", editedProblemText: null }, context)],
  ["prepare upload", () => prepareAttachmentUpload({ requestId: id, fileName: "proof.txt", mimeType: "text/plain", sizeBytes: 1 }, context)],
  ["finalize upload", () => finalizeAttachmentUpload(attachment, context)],
  ["discard upload", () => discardAttachmentUpload(attachment, context)],
  ["list Projects", () => listProjects(context)],
  ["create Project", () => createProject({ name: "Website" }, context)],
  ["list labels", () => listLabels(context)],
  ["create label", () => createLabel({ name: "New" }, context)],
  ["read notification", () => markNotificationRead(id, context)],
  ["unread notification", () => markNotificationUnread(id, context)],
  ["read all notifications", () => markAllNotificationsRead(context)],
  ["Release read", () => readRequestRelease(id, context)],
  ["Outcome read", () => readRequestOutcome(id, context)],
  ["Reviews read", () => readReviews(id, context)],
  ["Reviewer people", () => loadReviewerPeople(context)],
  ["comment", () => addComment(id, new FormData(), context)],
  ["download", () => getAttachmentDownloadUrl(id, context)],
  ["delete", () => deleteRequest(id, context)],
  ["priority", () => setRequestPriority(id, "high", context)],
  ["undo Done", () => undoMarkDone(id, context)],
  ["edits", () => saveRequestEdits(id, {}, context)],
];

describe("production action guard signals", () => {
  it.each(actions)("%s preserves explicit expiry before database/provider work", async (_name, action) => {
    boundary.session = { userId: null, orgId: null, orgRole: null };
    const run = vi.fn(action);
    const renew = vi.fn(async () => "renewed");
    const observed = await queryCounter.measure(() => callAction(run, { current: async () => "old", renew }));
    expect(isSessionFailure({ value: observed.result })).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(observed.statements).toBe(0);
  });
  it.each(actions)("%s never calls renewal for a wrong workspace or unknown role", async (_name, action) => {
    for (const session of [
      { userId: "user_test_member_a", orgId: "different_workspace", orgRole: "org:member" },
      { userId: "user_test_member_a", orgId, orgRole: "org:unknown" },
    ]) {
      boundary.session = session;
      const run = vi.fn(action);
      const renew = vi.fn(async () => "renewed");
      const observed = await queryCounter.measure(() => callAction(run, { current: async () => "current", renew }));
      expect(isSessionFailure({ value: observed.result })).toBe(false);
      expect(observed.result).toHaveProperty("error");
      expect(run).toHaveBeenCalledTimes(1);
      expect(renew).not.toHaveBeenCalled();
      expect(observed.statements).toBe(0);
    }
  });
  it("onboarding preserves its copy and only no-user emits expiry", async () => {
    boundary.session = { userId: null, orgId: null, orgRole: null };
    expect(await saveOnboardingRole({ role: "designer" })).toEqual({ error: "Sign in to continue.", sessionExpired: true });
    boundary.session = { userId: "signed_in", orgId: null, orgRole: null };
    expect(await saveOnboardingRole({ role: "designer" })).toEqual({ error: "Create or join a workspace before choosing your role." });
    expect(await saveOnboardingRole({ role: "invalid" })).toEqual({ error: "Choose a valid role." });
  });
});
