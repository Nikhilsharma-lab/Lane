import { describe, it, expect } from "vitest";
import {
  requestSchema,
  editedProblemSchema,
  problemFramingSchema,
  TITLE_MIN,
  TITLE_MAX,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
} from "./request-schema";

describe("requestSchema", () => {
  it("valid input passes", () => {
    const result = requestSchema.safeParse({
      title: "Fix the export flow",
      description: "Users lose their filters when exporting the board.",
      affectedPeople: "",
      desiredChange: "",
      observedEvidence: "",
      uncertainty: "",
      usefulLink: "",
    });
    expect(result.success).toBe(true);
  });

  it("sub-min title fails with the min message", () => {
    const result = requestSchema.safeParse({
      title: "ab",
      description: "A perfectly long enough description.",
      affectedPeople: "",
      desiredChange: "",
      observedEvidence: "",
      uncertainty: "",
      usefulLink: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        `Please give this a short title — at least ${TITLE_MIN} characters`
      );
    }
  });

  it("empty title fails with the required message", () => {
    const result = requestSchema.safeParse({
      title: "",
      description: "A perfectly long enough description.",
      affectedPeople: "",
      desiredChange: "",
      observedEvidence: "",
      uncertainty: "",
      usefulLink: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Title is required");
    }
  });

  it("over-max description fails", () => {
    const result = requestSchema.safeParse({
      title: "Valid title",
      description: "x".repeat(DESCRIPTION_MAX + 1),
      affectedPeople: "",
      desiredChange: "",
      observedEvidence: "",
      uncertainty: "",
      usefulLink: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        `Description must be at most ${DESCRIPTION_MAX} characters`
      );
    }
  });

  it("boundary values pass (title at max, description at min)", () => {
    const result = requestSchema.safeParse({
      title: "x".repeat(TITLE_MAX),
      description: "x".repeat(DESCRIPTION_MIN),
      affectedPeople: "",
      desiredChange: "",
      observedEvidence: "",
      uncertainty: "",
      usefulLink: "",
    });
    expect(result.success).toBe(true);
  });

  it("trims source fields before they reach AI or storage", () => {
    const result = requestSchema.safeParse({
      title: "  Export flow  ",
      description: "  People lose their filters during export.  ",
      affectedPeople: "  Design leads  ",
      desiredChange: "",
      observedEvidence: "",
      uncertainty: "",
      usefulLink: "",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toEqual({
      title: "Export flow",
      description: "People lose their filters during export.",
      affectedPeople: "Design leads",
      desiredChange: "",
      observedEvidence: "",
      uncertainty: "",
      usefulLink: "",
    });
  });

  it("requires useful links to use HTTPS", () => {
    const result = requestSchema.safeParse({
      title: "A valid title",
      description: "A sufficiently detailed description",
      affectedPeople: "",
      desiredChange: "",
      observedEvidence: "",
      uncertainty: "",
      usefulLink: "http://example.com/prd",
    });

    expect(result.success).toBe(false);
  });
});

describe("editedProblemSchema", () => {
  it("null passes (problem-classified requests have nothing to edit)", () => {
    const result = editedProblemSchema.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("in-range string is trimmed before save", () => {
    const result = editedProblemSchema.safeParse("  A reframed problem.  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("A reframed problem.");
  });

  it("over-max string fails (the server-gap fix)", () => {
    const result = editedProblemSchema.safeParse("x".repeat(DESCRIPTION_MAX + 1));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        `Problem framing must be at most ${DESCRIPTION_MAX} characters`
      );
    }
  });

  it("rejects empty solution and hybrid framing", () => {
    const result = problemFramingSchema.safeParse("   ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        `Problem framing needs at least ${DESCRIPTION_MIN} characters`
      );
    }
  });
});
