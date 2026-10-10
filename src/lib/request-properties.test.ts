import { describe, expect, it } from "vitest";
import { projectIdSchema, projectInputSchema } from "./request-properties";
import { projectIdOrNull } from "./request-constants";

describe("Project input", () => {
  it("normalizes whitespace while retaining a meaningful name", () => {
    expect(projectInputSchema.parse({ name: "  B2B   App \n ", description: " Customers " })).toEqual({ name: "B2B App", description: "Customers" });
  });
  it("defaults an omitted description to null", () => {
    expect(projectInputSchema.parse({ name: "Website" })).toEqual({ name: "Website", description: null });
  });
  it.each([{ name: "   " }, { name: "a".repeat(81) }, { name: "Website", description: "a".repeat(301) }])("rejects invalid projects %j", (input) => {
    expect(projectInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("projectIdOrNull (plan item 1.13)", () => {
  it.each([
    "6f1c2a9e-3b4d-4e5f-8a6b-7c8d9e0f1a2b", "6F1C2A9E-3B4D-4E5F-8A6B-7C8D9E0F1A2B",
    "00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff",
    "6f1c2a9e-3b4d-0e5f-8a6b-7c8d9e0f1a2b", "6f1c2a9e-3b4d-4e5f-0a6b-7c8d9e0f1a2b",
    "all", "none", "", " 6f1c2a9e-3b4d-4e5f-8a6b-7c8d9e0f1a2b", null, undefined, 42,
  ])("agrees with projectIdSchema for %j", (value) => {
    const parsed = projectIdSchema.safeParse(value);
    expect(projectIdOrNull(value)).toBe(parsed.success ? parsed.data : null);
  });
});
