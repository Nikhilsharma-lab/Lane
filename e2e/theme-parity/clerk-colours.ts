/**
 * Which theme name each Clerk colour key reads (spec #87 *Clerk*, #93), from source text:
 * Clerk's appearance types (every `color…` key), `clerkNeutralVariables` in
 * src/components/auth/clerk-appearance.ts and the theme file. Read as text because the
 * appearance module imports CSS, which Playwright cannot load.
 */
export function clerkColourTokens(appearanceSource: string, clerkTypes: string, themeCss: string) {
  const colourKeys = [...new Set([...clerkTypes.matchAll(/^\s+(color[A-Za-z]+)\??:/gm)].map((m) => m[1]))];
  if (!colourKeys.length) throw new Error("Could not read the Clerk colour keys from Clerk's appearance types");

  const start = appearanceSource.indexOf("export const clerkNeutralVariables = {");
  const block = start < 0 ? "" : appearanceSource.slice(start, appearanceSource.indexOf("};", start));
  const mapped = new Map(
    [...block.matchAll(/^\s*(color[A-Za-z]+): "var\((--[a-z0-9-]+)\)",?$/gm)].map((m) => [m[1], m[2]])
  );

  const tokens: Record<string, string> = {};
  const problems: string[] = [];
  for (const key of colourKeys) {
    const name = mapped.get(key);
    if (!name) problems.push(`${key} is not mapped to a theme name`);
    else if (!new RegExp(`^\\s*${name}:`, "m").test(themeCss)) {
      problems.push(`${key} reads ${name}, which the theme file does not define`);
    } else tokens[key] = name;
  }
  return { tokens, problems };
}
