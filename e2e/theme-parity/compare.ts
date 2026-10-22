import type { PaintedTheme } from "./capture";

export type Mode = "light" | "dark";
export type ThemeBaseline = Record<string, Partial<Record<Mode, PaintedTheme>>>;

type Colour = [number, number, number, number];

/** Colours closer than this in OKLab (and alpha) are the same colour on screen. */
const SAME_COLOUR = 0.002;

const COLOUR = /oklab\((-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+)(?: \/ (-?[\d.e-]+))?\)/g;

function split(value: string): { shape: string; colours: Colour[] } {
  const colours: Colour[] = [];
  const shape = value.replace(COLOUR, (_, l, a, b, alpha) => {
    colours.push([Number(l), Number(a), Number(b), alpha === undefined ? 1 : Number(alpha)]);
    return "<colour>";
  });
  return { shape, colours };
}

function distance(x: Colour, y: Colour) {
  if (x[3] < 0.001 && y[3] < 0.001) return 0;
  return Math.max(Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]), Math.abs(x[3] - y[3]));
}

function oklch(l: number, c: number, h: number): Colour {
  const radians = (h * Math.PI) / 180;
  return [l, c * Math.cos(radians), c * Math.sin(radians), 1];
}

type Difference = { key: string; mode: Mode; expected: string; actual: string };

/**
 * The only differences the theme switch may make (spec #87, Further Notes).
 * Each one is allowed by name; anything else fails the test.
 */
export const KNOWN_EXCEPTIONS: Record<string, (d: Difference) => boolean> = {
  // Dark --primary sits outside sRGB; a theme stored as hex clips it by about 0.006 OKLab.
  "wide-gamut dark primary": (d) =>
    d.mode === "dark" && onlyMovedAround(d, oklch(0.43627, 0.11, 157.5)),
  // The old destructive text colour sits outside sRGB too, in both modes.
  "wide-gamut destructive text": (d) => onlyMovedAround(d, oklch(0.99, 0.0112, 25)),
  // Spec #87 "Name clashes": Lane's red-text meaning of --destructive-foreground is retired and
  // the name now means tweakcn's label on a red button. Nothing paints the old meaning any more
  // (its text classes moved to the plain destructive colour, the same red), so only the root
  // name itself may change, and only to that label colour.
  "retired destructive-foreground meaning": (d) => {
    if (d.key !== "root --destructive-foreground") return false;
    const actual = split(d.actual);
    return actual.shape === "<colour>" && distance(actual.colours[0], oklch(0.99, 0.0112, 25)) <= 0.003;
  },
  // Before Geist loads, the stack falls back to plain sans-serif instead of
  // next/font's size-matched "Geist Fallback". Geist itself must still lead.
  "pre-Geist fallback font": (d) => {
    const lead = (stack: string) => stack.split(",")[0].replace(/["']/g, "").trim();
    return /Geist/.test(d.expected) && lead(d.expected) === lead(d.actual);
  },
};

function onlyMovedAround(d: Difference, reference: Colour) {
  const expected = split(d.expected);
  const actual = split(d.actual);
  if (expected.shape !== actual.shape || expected.colours.length !== actual.colours.length) {
    return false;
  }
  return expected.colours.every((colour, index) => {
    const moved = distance(colour, actual.colours[index]);
    if (moved <= SAME_COLOUR) return true;
    return distance(colour, reference) <= 0.003 && moved <= 0.012;
  });
}

function samePaint(expected: string, actual: string) {
  if (expected === actual) return true;
  const x = split(expected);
  const y = split(actual);
  return (
    x.shape === y.shape &&
    x.colours.length === y.colours.length &&
    x.colours.every((colour, index) => distance(colour, y.colours[index]) <= SAME_COLOUR)
  );
}

function flatten(theme: PaintedTheme | undefined) {
  const flat = new Map<string, string | null>();
  if (!theme) return flat;
  for (const [name, value] of Object.entries(theme.names)) flat.set(`root ${name}`, value);
  if (theme.navigationNames === null) flat.set("navigation", null);
  for (const [name, value] of Object.entries(theme.navigationNames ?? {})) {
    flat.set(`navigation ${name}`, value);
  }
  for (const [element, painted] of Object.entries(theme.elements)) {
    if (painted === null) flat.set(element, null);
    for (const [property, value] of Object.entries(painted ?? {})) {
      flat.set(`${element} ${property}`, value);
    }
  }
  return flat;
}

/**
 * Compares what is painted now against the baseline. Returns every difference
 * that no allowed exception covers, plus the ones an exception allowed.
 */
export function compareThemes(
  baseline: ThemeBaseline,
  current: ThemeBaseline,
  allowed: readonly (keyof typeof KNOWN_EXCEPTIONS)[]
) {
  const failures: string[] = [];
  const excused: string[] = [];
  const pages = new Set([...Object.keys(baseline), ...Object.keys(current)]);

  for (const pageName of pages) {
    for (const mode of ["light", "dark"] as const) {
      const expected = flatten(baseline[pageName]?.[mode]);
      const actual = flatten(current[pageName]?.[mode]);
      if (!expected.size) failures.push(`${pageName} ${mode}: not in the baseline`);
      if (!actual.size) failures.push(`${pageName} ${mode}: not captured`);
      for (const key of new Set([...expected.keys(), ...actual.keys()])) {
        const e = expected.get(key);
        const a = actual.get(key);
        if (e === a) continue;
        const where = `${pageName} ${mode} ${key}`;
        if (e === undefined || a === undefined || e === null || a === null) {
          failures.push(`${where}: expected ${String(e)}, got ${String(a)}`);
          continue;
        }
        if (samePaint(e, a)) continue;
        const difference = { key, mode, expected: e, actual: a };
        const exception = allowed.find((name) => KNOWN_EXCEPTIONS[name](difference));
        if (exception) excused.push(`${where} (${exception})`);
        else failures.push(`${where}: expected ${e}, got ${a}`);
      }
    }
  }
  return { failures, excused };
}
