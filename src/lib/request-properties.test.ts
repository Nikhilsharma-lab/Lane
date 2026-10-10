import { describe, expect, it } from "vitest";
import { projectInputSchema } from "./request-properties";

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
