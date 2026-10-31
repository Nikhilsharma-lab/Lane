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

  // #257 D4: Clerk lays the organization window out as a two-column grid (navigation, page). With the navigation
  // hidden, the page fell into the narrow first column; the window keeps one full-width column instead.
  it("drops the hidden navigation's column so the page uses the window's full width", () => {
    expect(clerkOrganizationAppearance.elements.cardBox).toMatchObject({ gridTemplateColumns: "minmax(0, 1fr)" });
    expect(clerkOrganizationAppearance.elements.cardBox).toMatchObject(clerkAccountAppearance.elements.cardBox);
    expect(clerkAccountAppearance.elements.cardBox).not.toHaveProperty("gridTemplateColumns");
  });

  // #257 D4: Clerk caps a member's preview at a fixed width and cuts the email off with an ellipsis; an Admin about
  // to remove someone sees the whole name and email, wrapping when the column is narrow.
  it("shows a member's name and email in full instead of cutting them off", () => {
    const elements: Record<string, unknown> = clerkOrganizationAppearance.elements;
    expect(elements.userPreview).toMatchObject({ maxWidth: "100%" });
    for (const key of ["userPreviewMainIdentifierText", "userPreviewSecondaryIdentifier"]) {
      expect(elements[key], key).toMatchObject({ whiteSpace: "normal", overflowWrap: "anywhere" });
    }
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

// Spec #87 (Clerk): every Clerk colour key reads the one theme file, so no Clerk default colour paints.
describe("clerkNeutralVariables", () => {
  it("maps every Clerk colour key to a name the theme file defines", () => {
    const clerkTypes = readFileSync(join(process.cwd(), "node_modules/@clerk/ui/dist/internal/appearance.d.ts"), "utf8");
    const colourKeys = [...new Set([...clerkTypes.matchAll(/^\s+(color[A-Za-z]+)\??:/gm)].map(match => match[1]))];
    expect(colourKeys).toHaveLength(17);
    const theme = readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");
    const variables = clerkNeutralVariables as Record<string, string>;
    for (const key of colourKeys) {
      const name = /^var\((--[a-z0-9-]+)\)$/.exec(variables[key] ?? "")?.[1];
      expect(name, key).toBeDefined();
      expect(theme, `${key} reads ${name}`).toMatch(new RegExp(`^\\s*${name}:`, "m"));
    }
  });

  // Part 2 (#93): Clerk's stock success, warning, backdrop and shimmer colours give way to Lane's.
  it("paints success, warning, backdrop, shimmer and shadow with Lane's own tokens", () => {
    expect(clerkNeutralVariables).toMatchObject({
      colorSuccess: "var(--success)",
      colorWarning: "var(--warning)",
      colorModalBackdrop: "var(--overlay-backdrop)",
      colorShimmer: "var(--hairline)",
      colorShadow: "var(--shadow-color)",
    });
    expect(JSON.stringify(clerkNeutralVariables)).not.toMatch(/--clerk-/);
  });
});

// Part 2 (#93): Clerk paints links with colorPrimary, the button plate, which is unreadable on a
// dark page; sign-in links read Lane's link ink instead, and the button keeps the plate.
describe("sign-in links", () => {
  const LINKS = ["footerActionLink", "formResendCodeLink", "identityPreviewEditButton", "formFieldAction"] as const;

  it("read the link ink token, also on hover", () => {
    const elements = clerkEmbeddedAppearance.elements as Record<string, Record<string, unknown>>;
    for (const link of LINKS) {
      expect(elements[link], link).toMatchObject({ color: "var(--link-ink)", "&:hover": { color: "var(--link-ink)" } });
    }
    expect(clerkEmbeddedAppearance.variables.colorPrimary).toBe("var(--primary)");
  });

  // The token follows --accent-ink, which has light and dark values; the parity e2e checks the
  // painted dark link's contrast.
  it("have a link ink in the theme file's Lane additions", () => {
    const theme = readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");
    const additions = theme.slice(theme.indexOf("/* Lane additions"));
    expect(additions).toMatch(/^\s*--link-ink: var\(--accent-ink\);/m);
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
    expect(elements.formFieldInput).toMatchObject({ minHeight: "var(--control-height-md)", fontSize: "var(--text-base)" });
    expect(elements.formButtonPrimary).toMatchObject({ minHeight: "var(--control-height-md)", borderRadius: "var(--button-radius-md)" });
    expect(variables.colorPrimary).toBe("var(--primary)");
    expect(variables.colorPrimaryForeground).toBe("var(--primary-foreground)");
    expect(variables.spacing).toBe("var(--space-4)");
  });

  it("sits flush in the column through Clerk's documented options, not utility classes Clerk's styles outrank", () => {
    expect(clerkEmbeddedAppearance.options).toEqual({ elevation: "flush", logoPlacement: "none" });
    expect(elements.cardBox).toEqual({ width: "100%", maxWidth: "100%" });
    expect(Object.values(elements).some(value => typeof value === "string")).toBe(false);
  });

  it("answers input focus with the border alone and hovers the primary with Lane's token", () => {
    expect(elements.formFieldInput["&[data-variant=default]"]["&:focus-within, &[data-focus-within=true]"]).toMatchObject({ boxShadow: "none", borderColor: "var(--input-border-hover)" });
    expect(elements.formButtonPrimary["@media (hover: hover) and (pointer: fine)"]["&:hover"]).toEqual({ backgroundColor: "var(--primary-hover-background)" });
  });

  it("matches the title Lane draws on the forgot and reset pages", () => {
    const css = readFileSync(join(process.cwd(), "src/components/auth/auth.module.css"), "utf8");
    const title = /\.title \{([^}]*)\}/.exec(css)?.[1] ?? "";
    for (const value of Object.values(elements.headerTitle)) expect(title).toContain(value);
  });

  it("keeps Clerk's header, copy and steps, and reads every value from a token", () => {
    const keys = elements as Record<string, unknown>;
    for (const key of ["footerAction"]) expect(keys[key]).toBeUndefined();
    expect(JSON.stringify(clerkEmbeddedAppearance).match(/\d+(?:\.\d+)?(?:px|rem|em)\b|#[0-9a-f]{3,8}\b/gi)).toBeNull();
  });
});
