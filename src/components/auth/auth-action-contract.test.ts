import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AUTH_ROUTES = join(process.cwd(), "src/app/(auth)");
const AUTH_ACTION = join(
  process.cwd(),
  "src/components/auth/auth-action.tsx"
);
const GLOBAL_STYLES = join(process.cwd(), "src/app/globals.css");

const ALLOWED_RAW_BUTTONS = [
  {
    file: "src/app/(auth)/invite/[token]/page.tsx",
    marker: "Switch",
  },
] as const;

function getTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? getTsxFiles(path)
      : entry.name.endsWith(".tsx")
        ? [path]
        : [];
  });
}

type Oklch = [lightness: number, chroma: number, hue: number];

function getOklchToken(block: string, token: string): Oklch {
  const value = block.match(
    new RegExp(`--${token}:\\s*oklch\\(([^)]+)\\)`)
  )?.[1];
  if (!value) throw new Error(`Missing --${token} OKLCH token`);

  const components = value.trim().split(/\s+/).map(Number);
  if (components.length !== 3 || components.some(Number.isNaN)) {
    throw new Error(`Invalid --${token} OKLCH token`);
  }
  return components as Oklch;
}

function relativeLuminance([lightness, chroma, hue]: Oklch) {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.max(0, Math.min(1, channel)));

  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(first: Oklch, second: Oklch) {
  const luminances = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

describe("Auth and Onboarding action contract", () => {
  it("prevents routes from bypassing the shared semantic action", () => {
    const bypasses = getTsxFiles(AUTH_ROUTES)
      .filter((file) =>
        readFileSync(file, "utf8").includes(
          'from "@/components/ui/button"'
        )
      )
      .map((file) => file.replace(`${process.cwd()}/`, ""));

    expect(bypasses).toEqual([]);
  });

  it("keeps raw buttons limited to selection and account-switch controls", () => {
    const rawButtons = getTsxFiles(AUTH_ROUTES)
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const count = source.match(/<button\b/g)?.length ?? 0;
        return count
          ? [{ file: file.replace(`${process.cwd()}/`, ""), count }]
          : [];
      })
      .sort((a, b) => a.file.localeCompare(b.file));

    expect(rawButtons).toEqual(
      ALLOWED_RAW_BUTTONS.map(({ file }) => ({ file, count: 1 })).sort(
        (a, b) => a.file.localeCompare(b.file)
      )
    );

    for (const exception of ALLOWED_RAW_BUTTONS) {
      const source = readFileSync(
        join(process.cwd(), exception.file),
        "utf8"
      );
      expect(source).toContain(exception.marker);
    }
  });

  it("prevents route-level action geometry and color overrides", () => {
    const overrides = getTsxFiles(AUTH_ROUTES)
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const actions = source.match(/<AuthAction\b[\s\S]*?>/g) ?? [];
        return actions
          .filter((action) =>
            /\b(?:className|size|style|variant)\s*=/.test(action)
          )
          .map(() => file.replace(`${process.cwd()}/`, ""));
      });

    expect(overrides).toEqual([]);
  });

  it("keeps Lucide action icons on inherited semantic color", () => {
    const source = readFileSync(AUTH_ACTION, "utf8");
    const stateIcon = source.match(/<StateIcon\b[\s\S]*?\/>/)?.[0];

    expect(source).toContain("type LucideIcon");
    expect(source).toContain('"children" | "className" | "size" | "style" | "variant"');
    expect(stateIcon).toBeDefined();
    expect(stateIcon).toContain('data-icon="inline-start"');
    expect(stateIcon).toContain("strokeWidth={1.8}");
    expect(stateIcon).not.toMatch(/\b(?:color|fill|stroke)\s*=/);
  });

  it("keeps disabled labels and icons readable in both themes", () => {
    const source = readFileSync(GLOBAL_STYLES, "utf8");
    const themes = [
      source.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1],
      source.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1],
    ];

    for (const theme of themes) {
      expect(theme).toBeDefined();
      const surface = getOklchToken(theme!, "disabled");
      const foreground = getOklchToken(theme!, "disabled-foreground");
      expect(contrastRatio(surface, foreground)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
