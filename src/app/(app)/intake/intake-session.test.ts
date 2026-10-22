import { describe, expect, it } from "vitest";
import type { IntakeDraft } from "@/lib/intake-draft";
import type { RequestInput } from "@/lib/request-schema";
import { composerDraft, restoredComposer, settleLostUploads } from "./intake-session";

const plan = { kind: "measurement" as const, version: 2 as const, primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: 62, target: 80, noBaseline: false, check: "" as const }, measurement: { audience: "all" as const, platform: "web" as const, windowDays: 30 as const, exactDates: false, startDate: "", endDate: "" }, guardrails: [] };
const source = (title: string): RequestInput => ({ title, description: "Customers abandon checkout at delivery.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: null, requestType: null, priority: "none", expectedImpact: plan });
const hybrid = { classification: "hybrid" as const, reframedProblem: "Delivery costs surprise buyers.", extractedSolution: "Show them earlier." };
const base = { triage: null, token: null, editedProblem: "", source: null, values: source("Typing now"), previousProblem: "", previousProblemSource: null, reviewers: undefined };

describe("composerDraft", () => {
  it("keeps the form's values while composing, with earlier problem wording", () => {
    expect(composerDraft({ ...base, stage: "compose", previousProblem: "Earlier wording" })).toEqual({ source: source("Typing now"), review: null, previousProblem: "Earlier wording", previousProblemSource: null, reviewers: undefined });
  });
  it("keeps a review with the source it was run on, not what the form holds now", () => {
    const draft = composerDraft({ ...base, stage: "framing", triage: hybrid, token: "signed", editedProblem: "Buyers are surprised.", source: source("Reviewed") });
    expect(draft).toMatchObject({ source: source("Reviewed"), review: { triage: hybrid, token: "signed", editedProblem: "Buyers are surprised." }, previousProblem: "Buyers are surprised." });
  });
  it("keeps no review once the composer has left the review steps", () => {
    expect(composerDraft({ ...base, stage: "uploading", triage: hybrid, token: "signed", source: source("Reviewed") }).review).toBeNull();
  });
});

describe("restoredComposer", () => {
  const draft = (patch: Partial<IntakeDraft>): IntakeDraft => ({ version: 1 as IntakeDraft["version"], savedAt: 0, source: source("Saved"), review: null, ...patch });
  it("resumes a review at framing and ties its wording to the reviewed text", () => {
    const restored = restoredComposer(draft({ review: { triage: hybrid, token: "signed", editedProblem: "Buyers are surprised." } }));
    expect(restored.review?.token).toBe("signed");
    expect(restored.previousProblem).toBe("Buyers are surprised.");
    expect(restored.previousProblemSource).toEqual({ title: "Saved", description: source("Saved").description });
  });
  it("never ties older wording without an origin to this Request", () => {
    expect(restoredComposer(draft({ previousProblem: "Old wording" }))).toMatchObject({ review: null, previousProblem: "Old wording", previousProblemSource: null });
  });
  it("goes back to compose when the review's Expected impact is no longer complete", () => {
    const incomplete = { ...source("Saved"), expectedImpact: { ...plan, primary: { ...plan.primary, key: "" as const } } };
    expect(restoredComposer(draft({ source: incomplete, review: { triage: hybrid, token: "signed", editedProblem: "x" } })).review).toBeNull();
  });
  it("restores reviewer picks and their question", () => {
    const people = [{ nominee: { kind: "member" as const, userId: "u1" }, name: "Sam", email: "sam@x.test" }];
    expect(restoredComposer(draft({ reviewers: { people, question: "Can we build it?" } }))).toMatchObject({ reviewers: people, reviewQuestion: "Can we build it?" });
  });
});

describe("settleLostUploads", () => {
  const lost = { requestId: "r1", title: "T", files: [{ key: "a", name: "a.png", attachmentId: "res-a" }, { key: "b", name: "b.png", attachmentId: "res-b" }, { key: "c", name: "c.png", attachmentId: null }] };
  it("drops a file that had finished, clears reservations, and keeps the rest", async () => {
    const kept = await settleLostUploads(lost, async ({ attachmentId }) => attachmentId === "res-a" ? { success: true, alreadyUploaded: true } : { success: true });
    expect(kept).toEqual([{ key: "b", name: "b.png", attachmentId: null }, { key: "c", name: "c.png", attachmentId: null }]);
  });
  it("keeps a reservation it could not clear", async () => {
    const kept = await settleLostUploads(lost, async ({ attachmentId }) => { if (attachmentId === "res-b") throw new Error("offline"); return { success: false }; });
    expect(kept.map((file) => file.attachmentId)).toEqual(["res-a", "res-b", null]);
  });
});
