type Oklch = [lightness: number, chroma: number, hue: number]
type Theme = Map<string, string>

function declarations(block: string): Theme {
  return new Map(
    Array.from(block.matchAll(/--([\w-]+):\s*([^;]+);/g), (match) => [
      match[1],
      match[2].trim(),
    ])
  )
}

export function colorThemes(css: string) {
  const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1]
  const darkBlock = css.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1]
  if (!rootBlock || !darkBlock) throw new Error("Missing Lane colour theme blocks")
  const lightTheme = declarations(rootBlock)
  return {
    lightTheme,
    darkTheme: new Map([...lightTheme, ...declarations(darkBlock)]),
  }
}

function oklchLuminance([lightness, chroma, hue]: Oklch) {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function hexLuminance(hex: string) {
  const full = hex.length === 3 ? Array.from(hex, (value) => value.repeat(2)).join("") : hex
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(full.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export function colorLuminance(theme: Theme, token: string, seen = new Set<string>()): number {
  if (seen.has(token)) throw new Error(`Circular colour token: ${token}`)
  seen.add(token)
  const value = theme.get(token)
  if (!value) throw new Error(`Missing colour token: ${token}`)
  const alias = value.match(/^var\(--([\w-]+)\)$/)?.[1]
  if (alias) return colorLuminance(theme, alias, seen)
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) return hexLuminance(hex)
  const components = value.match(/^oklch\(([^)]+)\)$/)?.[1]
  if (components) {
    const parsed = components.trim().split(/\s+/).map(Number)
    if (parsed.length === 3 && parsed.every(Number.isFinite)) return oklchLuminance(parsed as Oklch)
  }
  // Alpha requires a known compositing surface. Do not silently treat it as opaque.
  throw new Error(`Invalid or unsupported opaque colour token: ${token}`)
}

export function contrastRatio(theme: Theme, foreground: string, background: string) {
  const values = [colorLuminance(theme, foreground), colorLuminance(theme, background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}
