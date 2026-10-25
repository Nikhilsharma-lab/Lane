import { describe, expect, it } from "vitest";
import {
  firstRunGuideFor, firstRunView, freeRequestsNote, parseFirstRunChange, startingProgress, withStepRead, type FirstRunProgress,
} from "./first-run-rules";

const progress = (over: Partial<FirstRunProgress> = {}): FirstRunProgress => ({ guide: "first_request", steps: [], skippedAt: null, completedAt: null, ...over });

describe("who gets which first run (#217)", () => {
  it("guides the person who created the workspace to file its first Request", () => {
    expect(firstRunGuideFor({ createdBy: "user_ada", userId: "user_ada" })).toBe("first_request");
  });

  it("shows everyone who joins later their Inbox", () => {
    expect(firstRunGuideFor({ createdBy: "user_ada", userId: "user_mo" })).toBe("joined");
    expect(firstRunGuideFor({ createdBy: null, userId: "user_mo" })).toBe("joined");
  });

  it("counts the first Request guide as finished for a creator who has already filed one", () => {
    expect(startingProgress({ guide: "first_request", filed: true })).toEqual({ guide: "first_request", completed: true });
    expect(startingProgress({ guide: "first_request", filed: false })).toEqual({ guide: "first_request", completed: false });
    expect(startingProgress({ guide: "joined", filed: true })).toEqual({ guide: "joined", completed: false });
  });
});

describe("what the first run shows", () => {
  it("starts the first Request guide at the problem framing", () => {
    expect(firstRunView(progress(), { filed: false })).toEqual({ guide: "first_request", step: "framing", read: [], filed: false });
  });

  it("resumes at the first step not read yet", () => {
    expect(firstRunView(progress({ steps: ["framing", "prediction"] }), { filed: false })).toMatchObject({ step: "reviewers" });
    expect(firstRunView(progress({ steps: ["prediction", "framing", "reviewers", "free_requests"] }), { filed: false })).toMatchObject({ step: "release" });
  });

  it("stays on the last step once every step is read, until the first Request is filed", () => {
    const all = progress({ steps: ["framing", "prediction", "reviewers", "free_requests", "release"] });
    expect(firstRunView(all, { filed: false })).toMatchObject({ step: "release", filed: false });
    expect(firstRunView(all, { filed: true })).toMatchObject({ filed: true });
  });

  it("shows the short Inbox first run to people who joined", () => {
    expect(firstRunView(progress({ guide: "joined" }), { filed: false })).toEqual({ guide: "joined" });
  });

  it("shows nothing once skipped or finished, or before there is any progress", () => {
    expect(firstRunView(progress({ skippedAt: new Date("2026-10-25T10:00:00Z") }), { filed: false })).toBeNull();
    expect(firstRunView(progress({ completedAt: new Date("2026-10-25T10:00:00Z") }), { filed: true })).toBeNull();
    expect(firstRunView(progress({ guide: "joined", completedAt: new Date("2026-10-25T10:00:00Z") }), { filed: false })).toBeNull();
    expect(firstRunView(null, { filed: false })).toBeNull();
  });

  it("records a step read once, in the guide's order, and refuses another guide's step", () => {
    expect(withStepRead("first_request", ["prediction"], "framing")).toEqual(["framing", "prediction"]);
    expect(withStepRead("first_request", ["framing"], "framing")).toEqual(["framing"]);
    expect(withStepRead("joined", [], "inbox")).toEqual(["inbox"]);
    expect(withStepRead("joined", [], "framing")).toBeNull();
    expect(withStepRead("first_request", [], "inbox")).toBeNull();
  });
});

describe("what the first run's action accepts", () => {
  it("takes a known step, skip, finish or reopen", () => {
    expect(parseFirstRunChange({ change: "step", step: "prediction" })).toEqual({ change: "step", step: "prediction" });
    expect(parseFirstRunChange({ change: "step", step: "inbox" })).toEqual({ change: "step", step: "inbox" });
    for (const change of ["skip", "finish", "reopen"]) expect(parseFirstRunChange({ change })).toEqual({ change });
  });

  it("refuses anything else, extra keys included", () => {
    for (const input of [null, "skip", [], {}, { change: "step" }, { change: "step", step: "demo" }, { change: "skip", step: "framing" },
      { change: "finish", userId: "someone_else" }, { change: "step", step: "framing", orgId: "org_x" }, { change: "delete" }])
      expect(parseFirstRunChange(input)).toBeNull();
  });
});

describe("the Free Requests line", () => {
  const free = (left: number, usedElsewhere: { kind: "company_domain" | "personal_email"; domain: string } | null = null) =>
    ({ total: usedElsewhere ? 0 : 4, used: 4 - left, left, usedElsewhere });

  it("says how many of the 4 are left", () => {
    expect(freeRequestsNote("free", free(4))).toBe("4 of 4 Free Requests left.");
    expect(freeRequestsNote("free", free(3))).toBe("3 of 4 Free Requests left.");
    expect(freeRequestsNote("lapsed", free(0))).toBe("0 of 4 Free Requests left.");
  });

  it("says when another workspace already used them, and when the workspace pays", () => {
    expect(freeRequestsNote("free", free(0, { kind: "company_domain", domain: "example.com" }))).toBe("The Free Requests for example.com were already used by another workspace.");
    expect(freeRequestsNote("paying", free(0))).toBe("This workspace pays for Lane, so creating Requests has no limit.");
  });
});
