/**
 * WCAG contrast between two painted colours, as the parity capture writes them
 * (`oklab(L a b / alpha)`, see capture.ts). A see-through text colour is laid
 * over its background first. Used by the Part 2 dark-mode assertions (#93).
 */
const OKLAB = /^oklab\((-?[\d.e-]+) (-?[\d.e-]+) (-?[\d.e-]+)(?: \/ (-?[\d.e-]+))?\)$/;

type Rgba = [number, number, number, number];

/** oklab → linear sRGB (Björn Ottosson's matrices), unclipped beyond [0, 1]. */
function linearRgb(value: string): Rgba {
  const match = OKLAB.exec(value.trim());
  if (!match) throw new Error(`Expected a painted oklab() colour, got "${value}"`);
  const [L, a, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (channel: number) => Math.min(1, Math.max(0, channel));
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha,
  ];
}

const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance([r, g, b]: Rgba) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string) {
  const back = linearRgb(background);
  const front = linearRgb(foreground);
  // Browsers blend in gamma-encoded sRGB.
  const over = front.map((channel, index) =>
    index === 3
      ? 1
      : toLinear(front[3] * toGamma(channel) + (1 - front[3]) * toGamma(back[index]))
  ) as Rgba;
  const [lighter, darker] = [luminance(over), luminance(back)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
