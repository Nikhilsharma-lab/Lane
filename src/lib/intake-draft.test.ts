import { describe, expect, it, vi } from "vitest";
import { createTriageToken, verifyTriageToken } from "./triage-token";
import { CONTEXT_MAX, DESCRIPTION_MAX, TITLE_MAX, USEFUL_LINK_MAX, requestSchema } from "./request-schema";
import { EMPTY_METRIC_IMPACT, IMPACT_RESULT_MAX, IMPACT_SOURCE_MAX } from "./request-impact";

import {
  clearIntakeDraft,
  intakeDraftScope,
  intakeDraftStorageKey,
  readIntakeDraft,
  writeIntakeDraft,
} from "./intake-draft";

function memoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

const NOW = Date.UTC(2026, 6, 20, 12);
const SCOPE = intakeDraftScope(
  "4b1448ae-913c-4d0d-a6f8-7a762be3e01f",
  "00c80f80-693d-49c1-a9dd-dff0cebd660b"
);

function source(title: string, description: string) {
  return {
    title,
    description,
    affectedPeople: "",
    desiredChange: "",
    observedEvidence: "",
    uncertainty: "",
    usefulLink: "",
  };
}

describe("Intake draft recovery", () => {
  it("round-trips an incomplete form without requiring valid submission data", () => {
    const storage = memoryStorage();

    writeIntakeDraft(
      storage,
      SCOPE,
      {
        source: source("No", "Still shaping this"),
        review: null,
      },
      NOW
    );

    expect(readIntakeDraft(storage, SCOPE, NOW)).toEqual({
      version: 2,
      savedAt: NOW,
      source: { ...source("No", "Still shaping this"), projectId: null, requestType: null, expectedImpact: null },
      previousProblem: "",
      review: null,
    });
  });

  it("restores an incomplete impact-only draft without dropping it", () => {
    const storage = memoryStorage();
    const expectedImpact = { kind: "metric" as const, metric: "Conversion", baseline: null, target: null, unit: "%", source: "", reviewAfterDays: null };
    writeIntakeDraft(storage, SCOPE, { source: { ...source("", ""), expectedImpact }, review: null }, NOW);
    expect(readIntakeDraft(storage, SCOPE, NOW)?.source.expectedImpact).toEqual(expectedImpact);
  });

  it("does not restore an untouched blank impact section as a draft", () => {
    const storage = memoryStorage();
    writeIntakeDraft(storage, SCOPE, { source: { ...source("", ""), expectedImpact: EMPTY_METRIC_IMPACT }, review: null }, NOW);
    expect(storage.getItem(intakeDraftStorageKey(SCOPE))).toBeNull();
  });

  it("preserves a previous review's edited problem while impact is completed", () => {
    const storage = memoryStorage();
    const previousProblem = "People cannot recover their saved changes after returning.";
    const draft = { source: source("Draft recovery", "People lose work when returning to a Request."), review: null, previousProblem };
    writeIntakeDraft(storage, SCOPE, draft, NOW);
    expect(readIntakeDraft(storage, SCOPE, NOW)).toMatchObject(draft);
  });

  it("keeps the reviewed text origin when the current description has changed", () => {
    const storage = memoryStorage();
    const previousProblemSource = { title: "Saved drafts", description: "Add a tab for saved drafts." };
    const draft = {
      source: source("Payment confirmation", "Add a confirmation after card payment."),
      review: null,
      previousProblem: "Returning customers cannot find their unfinished drafts.",
      previousProblemSource,
    };
    writeIntakeDraft(storage, SCOPE, draft, NOW);
    expect(readIntakeDraft(storage, SCOPE, NOW)).toMatchObject({
      previousProblem: "Returning customers cannot find their unfinished drafts.",
      previousProblemSource,
    });
  });

  it("keeps a property-only draft and restores its selections", () => {
    const storage = memoryStorage();
    const properties = { projectId: "00000000-0000-4000-a000-000000000001", requestType: "new_feature" as const };
    writeIntakeDraft(storage, SCOPE, { source: { ...source("", ""), ...properties }, review: null }, NOW);
    expect(readIntakeDraft(storage, SCOPE, NOW)?.source).toMatchObject(properties);
  });

  it("restores old drafts with unset properties", () => {
    const storage = memoryStorage();
    storage.setItem(intakeDraftStorageKey(SCOPE), JSON.stringify({ version: 2, savedAt: NOW, source: source("Old request", "Existing draft"), review: null }));
    expect(readIntakeDraft(storage, SCOPE, NOW)).toMatchObject({ source: { projectId: null, requestType: null, expectedImpact: null }, previousProblem: "" });
  });

  it("restores a confirmed review with its signed token and edited framing", () => {
    const storage = memoryStorage();
    const review = {
      triage: {
        classification: "hybrid" as const,
        reframedProblem:
          "Customers cannot understand what changed after a Request is reframed.",
        extractedSolution: "Add a changelog beside every Request.",
      },
      token: "signed.review.token",
      editedProblem:
        "Customers lose confidence when changes to a Request are invisible.",
    };

    writeIntakeDraft(
      storage,
      SCOPE,
      {
        source: source(
          "Show Request changes",
          "Customers need the original intent and later framing kept together."
        ),
        review,
      },
      NOW
    );

    expect(readIntakeDraft(storage, SCOPE, NOW)?.review).toEqual(review);
  });

  it.each(["a", "界", "\u0001"])("preserves a full-length signed review, including encoded text %j", (character) => {
    vi.stubEnv("TRIAGE_TOKEN_SECRET", "draft-token-test-secret".repeat(3));
    try {
      const storage = memoryStorage();
      const linkPrefix = "https://example.test/";
      const fullSource = requestSchema.parse({
        title: character.repeat(TITLE_MAX),
        description: character.repeat(DESCRIPTION_MAX),
        affectedPeople: character.repeat(CONTEXT_MAX),
        desiredChange: character.repeat(CONTEXT_MAX),
        observedEvidence: character.repeat(CONTEXT_MAX),
        uncertainty: character.repeat(CONTEXT_MAX),
        usefulLink: linkPrefix + "a".repeat(USEFUL_LINK_MAX - linkPrefix.length),
        expectedImpact: { kind: "verification", result: character.repeat(IMPACT_RESULT_MAX), source: character.repeat(IMPACT_SOURCE_MAX), reviewAfterDays: 30 },
      });
      const triage = { classification: "hybrid" as const, reframedProblem: character.repeat(DESCRIPTION_MAX), extractedSolution: character.repeat(DESCRIPTION_MAX) };
      const context = { orgId: "org_draft_size", userId: "user_draft_size" };
      const token = createTriageToken(fullSource, triage, context);
      expect(verifyTriageToken(token, context).valid).toBe(true);
      expect(token.length).toBeGreaterThan(20_000);
      const review = { triage, token, editedProblem: character.repeat(DESCRIPTION_MAX) };
      expect(writeIntakeDraft(storage, SCOPE, { source: fullSource, review }, NOW)).toBe(true);
      expect(readIntakeDraft(storage, SCOPE, NOW)).toMatchObject({ source: fullSource, review });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("removes empty, expired, future-dated, and malformed drafts", () => {
    const storage = memoryStorage();
    const key = intakeDraftStorageKey(SCOPE);

    expect(
      writeIntakeDraft(
        storage,
        SCOPE,
        {
          source: source(" ", ""),
          review: null,
        },
        NOW
      )
    ).toBe(true);
    expect(storage.getItem(key)).toBeNull();

    writeIntakeDraft(
      storage,
      SCOPE,
      {
        source: source("Expired", "Old draft"),
        review: null,
      },
      NOW - 24 * 60 * 60 * 1000 - 1
    );
    expect(readIntakeDraft(storage, SCOPE, NOW)).toBeNull();

    storage.setItem(
      key,
      JSON.stringify({
        version: 2,
        savedAt: NOW + 60_001,
        source: source("Future", "Invalid clock"),
        review: null,
      })
    );
    expect(readIntakeDraft(storage, SCOPE, NOW)).toBeNull();

    storage.setItem(key, "{not-json");
    expect(readIntakeDraft(storage, SCOPE, NOW)).toBeNull();
  });

  it("keeps drafts isolated by person and workspace and clears explicitly", () => {
    const storage = memoryStorage();
    const otherScope = intakeDraftScope(
      "79b84ae8-19a2-48c4-8d83-338463616c28",
      "00c80f80-693d-49c1-a9dd-dff0cebd660b"
    );

    writeIntakeDraft(
      storage,
      SCOPE,
      {
        source: source("Private draft", "Only for this person"),
        review: null,
      },
      NOW
    );

    expect(readIntakeDraft(storage, otherScope, NOW)).toBeNull();
    clearIntakeDraft(storage, SCOPE);
    expect(readIntakeDraft(storage, SCOPE, NOW)).toBeNull();
  });
});
