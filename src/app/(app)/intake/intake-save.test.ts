import { afterEach, expect, it, vi } from "vitest";
import { saveEditedIntake, saveNewIntake } from "./intake-save";
import { saveRequest, runTriage } from "./actions";
import { saveRequestEdits } from "../requests/[id]/edit-actions";
import { runOptimistic, type OptimisticOptions } from "@/components/requests/use-optimistic-action";
import { createPendingMutationsStore } from "@/components/requests/pending-mutations-provider";
import type { RequestInput } from "@/lib/request-schema";

vi.mock("./actions", () => ({ saveRequest: vi.fn(), runTriage: vi.fn() }));
vi.mock("../requests/[id]/edit-actions", () => ({ saveRequestEdits: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
const source = { title: "Customers abandon checkout", description: "Delivery costs are not visible until the final checkout screen.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: null, requestType: null, labelKeys: [], priority: "none", expectedImpact: null } satisfies RequestInput;
const review = { token: "signed-review", triage: { classification: "problem" as const, reframedProblem: null, extractedSolution: null }, editedProblem: "" };
const context = { orgId: "workspace" };
const session = { current: async () => "current", renew: async () => "renewed" };
const edit = { ...review, requestId: "saved-request", source, original: { ...source, expectedImpact: null, reframedProblem: null, extractedSolution: null }, initialImpact: null,
  noMeasurableImpactReason: null, unchanged: true, savedProblem: null, savedSolution: null, snapshot: "exact-saved-snapshot" };
const optimistic = <R,>(options: OptimisticOptions<R>) => runOptimistic({ overlay: null, session, refresh: () => { throw new Error("Unexpected refresh"); }, notifyError: () => { throw new Error("Unexpected toast"); } }, options);

it("New keeps signed payload and advisory picks through the actual explicit-session recovery", async () => {
  vi.stubGlobal("Clerk", { session: { getToken: async () => "usable-token" } });
  vi.mocked(saveRequest).mockResolvedValueOnce({ success: false, error: { code: "session_expired", message: "Changed expiry copy" } }).mockResolvedValueOnce({ success: true, requestId: "saved-request" });
  const input = { ...review, offerReviewers: true, reviewers: [{ nominee: { kind: "member" as const, userId: "reviewer" }, name: "Reviewer", email: "reviewer@example.test" }], reviewQuestion: "Any concern?" };
  await expect(saveNewIntake(input, context)).resolves.toEqual({ success: true, requestId: "saved-request" });
  expect(vi.mocked(saveRequest).mock.calls).toEqual(Array(2).fill([{ token: "signed-review", editedProblemText: null }, context, { nominees: [{ kind: "member", userId: "reviewer" }], note: "Any concern?" }]));
  expect(runTriage).not.toHaveBeenCalled();
});

it("New does not replay an ambiguous save or add picks for a Guest", async () => {
  vi.mocked(saveRequest).mockRejectedValueOnce(new Error("Response lost after commit"));
  await expect(saveNewIntake({ ...review, offerReviewers: false, reviewers: [], reviewQuestion: "" }, context)).rejects.toThrow("Response lost");
  expect(saveRequest).toHaveBeenCalledExactlyOnceWith({ token: "signed-review", editedProblemText: null }, context, undefined);
});

it("unchanged Edit retains snapshot, saved framing and null impact without AI or a new token", async () => {
  vi.mocked(saveRequestEdits).mockResolvedValue({ success: true });
  await expect(saveEditedIntake(edit, context, optimistic)).resolves.toEqual({ success: true, requestId: "saved-request" });
  expect(saveRequestEdits).toHaveBeenCalledExactlyOnceWith("saved-request", { snapshot: "exact-saved-snapshot", changes: { ...source, reframedProblem: null, extractedSolution: null }, token: undefined }, context);
  expect(runTriage).not.toHaveBeenCalled();
  expect(saveRequest).not.toHaveBeenCalled();
});

it("changed Edit sends the new signed framing and retains a stale-snapshot refusal", async () => {
  vi.mocked(saveRequestEdits).mockResolvedValue({ error: "This Request changed. Review its saved version." });
  const result = await saveEditedIntake({ ...edit, unchanged: false, triage: { classification: "hybrid", reframedProblem: "Customers cannot see delivery costs early enough.", extractedSolution: "Show delivery costs earlier." }, editedProblem: "Customers cannot see delivery costs early enough." }, context, optimistic);
  expect(result).toEqual({ success: false, error: { code: "save_failed", message: "This Request changed. Review its saved version." } });
  expect(saveRequestEdits).toHaveBeenCalledExactlyOnceWith("saved-request", { snapshot: "exact-saved-snapshot", changes: { ...source, reframedProblem: "Customers cannot see delivery costs early enough.", extractedSolution: "Show delivery costs earlier." }, token: "signed-review" }, context);
});

it("Edit waits for the actual same-Request optimistic predecessor and sends nothing after its failure", async () => {
  const store = createPendingMutationsStore();
  const overlay = store.view(store.getSnapshot());
  const pending = Promise.withResolvers<boolean>();
  overlay.track("saved-request", pending.promise);
  const saving = saveEditedIntake(edit, context, options => runOptimistic({ overlay, session, refresh: () => {}, notifyError: () => {} }, options));
  pending.resolve(false);
  await expect(saving).resolves.toEqual({ success: false, error: { code: "save_failed", message: "This Request has a pending change. Try again." } });
  expect(saveRequestEdits).not.toHaveBeenCalled();
});
