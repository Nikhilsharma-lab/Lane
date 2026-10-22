// Lane's one copy of colour maths: CSS colour text → linear-light sRGB, hex and WCAG contrast.
// Used by the design check (contrast warnings), the brand-asset generator (hex for icons and
// tab colours) and the theme parity e2e (painted contrast). Types: colour.d.mts.
//
// OKLab uses Björn Ottosson's matrices and the CSS Color 4 sRGB transfer function.

const channel = (value, scale = 1) => {
  const text = value.trim()
  if (text === 'none') return 0
  return text.endsWith('%') ? Number.parseFloat(text) / 100 : Number.parseFloat(text) / scale
}
// OKLab/OKLCH a, b and chroma: 100% is 0.4.
const labChannel = value => channel(value) * (value.trim().endsWith('%') ? 0.4 : 1)

export const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export const toGamma = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const clip = c => Math.min(1, Math.max(0, c))

const oklabToLinear = (L, a, b) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}
const hslToGamma = (h, s, l) => [0, 8, 4].map(n => {
  const k = (n + h / 30) % 12
  return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
})

// A CSS colour literal (hex, white/black, rgb(a), hsl(a), oklch, oklab) → linear-light sRGB
// (unclipped, so out-of-gamut colours stay visible to callers) and alpha. null for anything
// else (color-mix, var(), other keywords).
export function parseColour(value) {
  const text = value.trim().toLowerCase()
  if (text === 'white') return { linear: [1, 1, 1], alpha: 1 }
  if (text === 'black') return { linear: [0, 0, 0], alpha: 1 }
  const hex = text.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/)
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map(d => d + d).join('') : hex[1]
    const byte = i => Number.parseInt(digits.slice(i, i + 2), 16) / 255
    return { linear: [0, 2, 4].map(i => toLinear(byte(i))), alpha: digits.length === 8 ? byte(6) : 1 }
  }
  const fn = text.match(/^(oklch|oklab|hsla?|rgba?)\((.*)\)$/)
  if (!fn) return null
  const [body, slashAlpha] = fn[2].split('/')
  const parts = body.trim().split(/[\s,]+/)
  if (parts.length < 3 || parts.length > 4) return null
  const alpha = slashAlpha !== undefined ? channel(slashAlpha) : parts.length === 4 ? channel(parts[3]) : 1
  const [x, y, z] = parts
  let linear
  if (fn[1] === 'oklab') linear = oklabToLinear(channel(x), labChannel(y), labChannel(z))
  else if (fn[1] === 'oklch') {
    const chroma = labChannel(y)
    const hue = (Number.parseFloat(z) * Math.PI) / 180
    linear = oklabToLinear(channel(x), chroma * Math.cos(hue), chroma * Math.sin(hue))
  } else if (fn[1].startsWith('hsl')) linear = hslToGamma(Number.parseFloat(x), channel(y, 100), channel(z, 100)).map(toLinear)
  else linear = [x, y, z].map(part => toLinear(channel(part, 255)))
  return { linear, alpha }
}

// An opaque colour → #rrggbb, out-of-gamut channels clipped. Throws on see-through or unknown.
export function toHex(value) {
  const colour = parseColour(value)
  if (!colour) throw new Error(`Unsupported colour (expected hex, rgb, hsl, oklch or oklab): ${value}`)
  if (colour.alpha < 1) throw new Error(`Expected an opaque colour, got ${value}`)
  return `#${colour.linear.map(c => Math.round(clip(toGamma(clip(c))) * 255).toString(16).padStart(2, '0')).join('')}`
}

// WCAG relative luminance of linear-light sRGB, channels clipped to the gamut.
export const luminance = linear => {
  const [r, g, b] = linear.map(clip)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// WCAG contrast of a text colour on a background. A see-through text colour is laid over the
// background first, blended in gamma-encoded sRGB the way browsers paint it. Throws on a colour
// it cannot read.
export function contrastRatio(foreground, background) {
  const read = value => {
    const colour = parseColour(value)
    if (!colour) throw new Error(`Unsupported colour (expected hex, rgb, hsl, oklch or oklab): ${value}`)
    return { linear: colour.linear.map(clip), alpha: colour.alpha }
  }
  const back = read(background)
  const front = read(foreground)
  const over = front.linear.map((c, i) => toLinear(front.alpha * toGamma(c) + (1 - front.alpha) * toGamma(back.linear[i])))
  const [lighter, darker] = [luminance(over), luminance(back.linear)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}
