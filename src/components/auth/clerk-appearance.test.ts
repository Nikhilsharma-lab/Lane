import { describe, expect, it, vi } from "vitest";

vi.mock("./clerk-profile.module.css", () => ({ default: { action: "action", membersPage: "membersPage", table: "table" } }));

const { clerkAccountAppearance, clerkOrganizationAppearance } = await import("./clerk-appearance");

// Plan item 2.10: the Organization Profile modals show only the page Settings asked for.
describe("clerkOrganizationAppearance", () => {
  it("hides Clerk's navigation in the organization modals only", () => {
    expect(clerkOrganizationAppearance.elements.navbar).toEqual({ display: "none" });
    expect(clerkOrganizationAppearance.elements.navbarMobileMenuRow).toEqual({ display: "none" });
    expect(clerkAccountAppearance.elements.navbar).not.toHaveProperty("display");
    expect(clerkAccountAppearance.elements).not.toHaveProperty("navbarMobileMenuRow");
  });

  it("never hides Clerk's page and form titles", () => {
    const elements = clerkOrganizationAppearance.elements as Record<string, unknown>;
    for (const key of ["header", "headerTitle", "headerSubtitle", "profileSectionTitle"]) expect(elements[key]).toBeUndefined();
  });

  it("caps Clerk's weights at medium and reads every value from a token", () => {
    expect(Object.values(clerkOrganizationAppearance.variables.fontWeight)).toEqual(expect.arrayContaining(["var(--weight-normal)", "var(--weight-medium)"]));
    expect(Object.values(clerkOrganizationAppearance.variables.fontWeight).every(weight => weight === "var(--weight-normal)" || weight === "var(--weight-medium)")).toBe(true);
    const literals = JSON.stringify(clerkOrganizationAppearance).match(/\d+(?:\.\d+)?(?:px|rem|em)\b|#[0-9a-f]{3,8}\b/gi);
    expect(literals).toBeNull();
  });
});
