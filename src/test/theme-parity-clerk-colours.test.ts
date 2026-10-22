import { describe, expect, it } from "vitest";
import { clerkColourTokens } from "../../e2e/theme-parity/clerk-colours";

// Spec #87 Part 2 (#93): the parity test checks that every Clerk colour key reads a name the
// theme file defines, from the source texts alone (the appearance module imports CSS, which
// Playwright cannot load).
const CLERK_TYPES = `
type Variables = {
  colorPrimary?: CssColor;
  colorSuccess?: CssColor;
  colorShadow?: CssColor;
  fontFamily?: string;
};
`;
const THEME = `
:root {
  --primary: oklch(0.5 0.1 157.5);
  --shadow-color: #000000;
}
/* Lane additions */
:root {
  --success: hsl(156.5deg 86.5% 26.1%);
}
`;
const appearance = (body: string) => `
import styles from "./clerk-profile.module.css";
export const clerkNeutralVariables = {
${body}
};
export const clerkEmbeddedAppearance = { variables: { colorPrimary: "var(--elsewhere)" } };
`;

describe("clerkColourTokens", () => {
  it("lists the theme name each Clerk colour key reads", () => {
    const source = appearance(`  colorPrimary: "var(--primary)",\n  colorSuccess: "var(--success)",\n  colorShadow: "var(--shadow-color)",\n  fontFamily: "var(--font-sans)",`);
    expect(clerkColourTokens(source, CLERK_TYPES, THEME)).toEqual({
      tokens: { colorPrimary: "--primary", colorSuccess: "--success", colorShadow: "--shadow-color" },
      problems: [],
    });
  });

  it("reports a Clerk colour key left unmapped", () => {
    const source = appearance(`  colorPrimary: "var(--primary)",\n  colorShadow: "var(--shadow-color)",`);
    expect(clerkColourTokens(source, CLERK_TYPES, THEME).problems).toEqual(["colorSuccess is not mapped to a theme name"]);
  });

  it("reports a key that reads a name the theme file does not define, or a literal", () => {
    const source = appearance(`  colorPrimary: "var(--primary)",\n  colorSuccess: "var(--clerk-success)",\n  colorShadow: "#000000",`);
    expect(clerkColourTokens(source, CLERK_TYPES, THEME).problems).toEqual([
      "colorSuccess reads --clerk-success, which the theme file does not define",
      "colorShadow is not mapped to a theme name",
    ]);
  });

  it("fails loudly when Clerk's colour keys can't be read", () => {
    expect(() => clerkColourTokens(appearance(""), "type Variables = {};", THEME)).toThrow(/Clerk colour keys/);
  });
});
