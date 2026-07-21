import { describe, expect, it } from "vitest";

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
      source: source("No", "Still shaping this"),
      review: null,
    });
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
