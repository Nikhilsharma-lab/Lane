import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("./clerk-profile.module.css", () => ({ default: { action: "action", membersPage: "membersPage", table: "table" } }));

const { clerkAccountAppearance, clerkEmbeddedAppearance, clerkNeutralVariables, clerkOrganizationAppearance } = await import("./clerk-appearance");

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

// Plan item 2.11: Clerk's sign-in, sign-up and session-task cards in Lane's auth column.
describe("clerkEmbeddedAppearance", () => {
  const { variables, elements } = clerkEmbeddedAppearance;

  it("shows keyboard focus with the visible outline token, never the transparent ring", () => {
    expect(clerkNeutralVariables.colorRing).toBe("var(--focus-outline)");
    expect(variables.colorRing).toBe("var(--focus-outline)");
    expect(JSON.stringify(clerkEmbeddedAppearance)).not.toContain("--focus-ring");
  });

  it("takes Lane's auth title, Arc's md controls and Lane's spacing unit", () => {
    expect(elements.headerTitle).toMatchObject({ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", lineHeight: "var(--leading-display)" });
    expect(elements.formFieldInput).toMatchObject({ minHeight: "var(--control-height-md)", fontSize: "var(--text-sm)" });
    expect(elements.formButtonPrimary).toMatchObject({ minHeight: "var(--control-height-md)", borderRadius: "var(--button-radius-md)" });
    expect(variables.colorPrimary).toBe("var(--primary-background)");
    expect(variables.colorPrimaryForeground).toBe("var(--primary-label)");
    expect(variables.spacing).toBe("calc(var(--sb-spacing) * 4)");
  });

  it("matches the title Lane draws on the forgot and reset pages", () => {
    const css = readFileSync(join(process.cwd(), "src/components/auth/auth.module.css"), "utf8");
    const title = /\.title \{([^}]*)\}/.exec(css)?.[1] ?? "";
    for (const value of Object.values(elements.headerTitle)) expect(title).toContain(value);
  });

  it("keeps Clerk's header, copy and steps, and reads every value from a token", () => {
    const keys = elements as Record<string, unknown>;
    for (const key of ["header", "footer", "footerAction", "main", "form"]) expect(keys[key]).toBeUndefined();
    expect(JSON.stringify(clerkEmbeddedAppearance).match(/\d+(?:\.\d+)?(?:px|rem|em)\b|#[0-9a-f]{3,8}\b/gi)).toBeNull();
  });
});
