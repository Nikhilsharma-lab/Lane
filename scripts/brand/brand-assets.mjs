// Favicon, app icons, web app manifest, browser tab colours and Open Graph image (launch plan §6.4,
// prod audit O4, #96).
//
// Every asset is derived from two sources, so none of them carries a hand-picked value:
//   - the Lane mark: the <path d> data of LaneMark in src/components/auth/auth-shell.tsx;
//   - colours and proportions: the theme file src/styles/theme.css (tweakcn's light and dark
//     --background / --foreground, and Lane additions sizes), resolved to sRGB hex because icon
//     files, the manifest and the theme-color meta tags are read by browsers and platforms that do
//     not evaluate CSS custom properties. tweakcn may export oklch, oklab, hsl, rgb or hex; all resolve.
//
//   node scripts/brand/brand-assets.mjs           write the assets
//   node scripts/brand/brand-assets.mjs --check   fail if a committed asset differs from the sources
//
// Next's metadata file conventions serve the files under src/app (favicon.ico, icon.svg,
// apple-icon.png, opengraph-image.png + .alt.txt, manifest.webmanifest). The manifest's 192px and
// 512px icons have no metadata convention of their own, so they are static files in public/.
// src/app/theme-color.json holds the light and dark tab colours the root layout's viewport reads.
// Rendering uses next/og (Satori + resvg, WebAssembly) with its bundled Geist Regular.

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const require = createRequire(join(root, 'package.json'))
const { ImageResponse } = require('next/og')
const { createElement: h } = require('react')

export const sourceFiles = {
  theme: 'src/styles/theme.css',
  mark: 'src/components/auth/auth-shell.tsx',
  layout: 'src/app/layout.tsx',
}

// --- Theme colours --------------------------------------------------------------------------

// The first :root and .dark blocks are tweakcn's export; Lane additions follow later in the file.
function themeBlock(theme, selector) {
  const start = theme.search(new RegExp(`^${selector.replace('.', '\\.')} \\{`, 'm'))
  if (start === -1) throw new Error(`Theme block not found: ${selector}`)
  return theme.slice(start, theme.indexOf('\n}', start))
}
function token(block, name) {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`Theme token not found: --${name}`)
  return match[1].trim()
}

const channel = (value, scale = 1) => (value.endsWith('%') ? parseFloat(value) / 100 : parseFloat(value) / scale)
const oklabToLinearSrgb = (L, a, b) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}
const encode = linear => (linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055)
const toByteHex = unit => Math.round(Math.min(1, Math.max(0, unit)) * 255).toString(16).padStart(2, '0')

// An opaque CSS colour (oklch, oklab, hsl, rgb or hex) → #rrggbb. OKLab uses Björn Ottosson's
// matrices and the CSS Color 4 sRGB transfer function; out-of-gamut channels are clipped.
export function cssColourToHex(value) {
  const text = value.trim().toLowerCase()
  const hex = text.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/)
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map(d => d + d).join('') : hex[1]
    if (digits.length === 8 && digits.slice(6) !== 'ff') throw new Error(`Expected an opaque colour, got ${value}`)
    return `#${digits.slice(0, 6)}`
  }
  const fn = text.match(/^(oklch|oklab|hsla?|rgba?)\((.*)\)$/)
  if (!fn) throw new Error(`Unsupported colour: ${value}`)
  const [body, alpha] = fn[2].split('/')
  if (alpha !== undefined && channel(alpha.trim()) < 1) throw new Error(`Expected an opaque colour, got ${value}`)
  const parts = body.trim().split(/[\s,]+/)
  if (parts.length === 4 && fn[1].endsWith('a') && channel(parts[3]) < 1) throw new Error(`Expected an opaque colour, got ${value}`)
  const [x, y, z] = parts
  let srgb
  if (fn[1] === 'oklch' || fn[1] === 'oklab') {
    const L = channel(x)
    const [a, b] = fn[1] === 'oklab'
      ? [channel(y, 1) * (y.endsWith('%') ? 0.4 : 1), channel(z, 1) * (z.endsWith('%') ? 0.4 : 1)]
      : (() => {
          const C = channel(y, 1) * (y.endsWith('%') ? 0.4 : 1)
          const hue = (parseFloat(z) * Math.PI) / 180
          return [C * Math.cos(hue), C * Math.sin(hue)]
        })()
    srgb = oklabToLinearSrgb(L, a, b).map(c => encode(Math.min(1, Math.max(0, c))))
  } else if (fn[1].startsWith('hsl')) {
    const hue = parseFloat(x)
    const [s, l] = [channel(y, 100), channel(z, 100)]
    srgb = [0, 8, 4].map(n => {
      const k = (n + hue / 30) % 12
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    })
  } else {
    srgb = [x, y, z].map(part => channel(part, 255))
  }
  return `#${srgb.map(toByteHex).join('')}`
}

// Light and dark --background / --foreground from tweakcn's half. Dark falls back to light and
// var() references are followed within the mode, the way the browser reads them.
export function themeColours(theme) {
  const blocks = { light: [themeBlock(theme, ':root')], dark: [themeBlock(theme, '.dark'), themeBlock(theme, ':root')] }
  const resolveSlot = (mode, name, seen = new Set()) => {
    if (seen.has(name)) throw new Error(`Theme token --${name} refers to itself`)
    seen.add(name)
    const block = blocks[mode].find(candidate => new RegExp(`--${name}:`).test(candidate))
    if (!block) throw new Error(`Theme token not found: --${name}`)
    const value = token(block, name)
    const ref = value.match(/^var\(--([\w-]+)\)$/)
    return ref ? resolveSlot(mode, ref[1], seen) : cssColourToHex(value)
  }
  const mode = name => ({ background: resolveSlot(name, 'background'), foreground: resolveSlot(name, 'foreground') })
  return { light: mode('light'), dark: mode('dark') }
}

// --- Assets ---------------------------------------------------------------------------------

function markElement(mark, size, fill) {
  return h('svg', { width: size, height: size, viewBox: mark.viewBox, fill }, ...mark.paths.map(d => h('path', { d })))
}

// ICO container holding PNG images (supported by every browser that reads favicon.ico today).
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map(image => image.png)])
}

const SAFE_ZONE_RATIO = 0.5
const FAVICON_RATIO = 0.75

// Builds every brand asset from the source texts (see sourceFiles). Returns repo path → bytes.
export async function buildBrandAssets(sources) {
  const markSource = sources.mark.match(/export function LaneMark\(\)[\s\S]*?<\/svg>/)
  if (!markSource) throw new Error('LaneMark not found in src/components/auth/auth-shell.tsx')
  const mark = {
    viewBox: markSource[0].match(/viewBox="([^"]+)"/)[1],
    paths: [...markSource[0].matchAll(/<path d="([^"]+)"/g)].map(match => match[1]),
  }
  if (mark.paths.length === 0) throw new Error('LaneMark has no paths')

  const colour = themeColours(sources.theme)
  const sizeToken = name => {
    const value = token(sources.theme, name)
    if (value.endsWith('rem')) return parseFloat(value) * 16
    if (value.endsWith('px')) return parseFloat(value)
    if (value.endsWith('em')) return parseFloat(value)
    throw new Error(`Unsupported size for --${name}: ${value}`)
  }
  // The sign-in header draws the mark at --icon-size-lg beside "Lane" at --text-base, 2 spacing
  // units apart, tracked --tracking-display (auth.module.css .mark). The OG image scales that lockup.
  const lockup = {
    mark: sizeToken('icon-size-lg'),
    text: sizeToken('text-base'),
    gap: sizeToken('spacing') * 2,
    tracking: sizeToken('tracking-display'),
  }

  const name = 'Lane'
  // Same sentence as the root layout's metadata description; no claims beyond what ships.
  const description = sources.layout.match(/const description = "([^"]+)"/)[1]

  // Browser tab icon: the bare mark, following the browser's colour scheme.
  const markPathSvg = mark.paths.map(d => `<path d="${d}"/>`).join('')
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}"><style>path{fill:${colour.light.foreground}}@media (prefers-color-scheme:dark){path{fill:${colour.dark.foreground}}}</style>${markPathSvg}</svg>\n`

  // App tiles: the dark-theme surface with the mark centred. `markRatio` keeps the mark inside the
  // maskable-icon safe zone (a centred circle of 40% radius) for the manifest and apple icons.
  const tile = async (size, markRatio) => {
    const element = h(
      'div',
      { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colour.dark.background } },
      markElement(mark, Math.round(size * markRatio), colour.dark.foreground),
    )
    return Buffer.from(await new ImageResponse(element, { width: size, height: size }).arrayBuffer())
  }

  const openGraphImage = async () => {
    const scale = 120 / lockup.mark
    const element = h(
      'div',
      {
        style: {
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: lockup.gap * scale, background: colour.dark.background, color: colour.dark.foreground,
        },
      },
      markElement(mark, lockup.mark * scale, colour.dark.foreground),
      h('span', { style: { fontSize: lockup.text * scale, letterSpacing: `${lockup.tracking}em`, lineHeight: 1 } }, name),
    )
    return Buffer.from(await new ImageResponse(element, { width: 1200, height: 630 }).arrayBuffer())
  }

  // The manifest takes one colour; the installed app opens on the dark tile surface. The browser
  // tab follows the system scheme through the layout's theme-color meta tags (theme-color.json).
  const manifest = {
    name,
    short_name: name,
    description,
    start_url: '/',
    display: 'standalone',
    background_color: colour.dark.background,
    theme_color: colour.dark.background,
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  const tabColours = { light: colour.light.background, dark: colour.dark.background }

  return {
    'src/app/icon.svg': Buffer.from(iconSvg),
    'src/app/favicon.ico': ico(await Promise.all([16, 32, 48].map(async size => ({ size, png: await tile(size, FAVICON_RATIO) })))),
    'src/app/apple-icon.png': await tile(180, SAFE_ZONE_RATIO),
    'src/app/opengraph-image.png': await openGraphImage(),
    'src/app/opengraph-image.alt.txt': Buffer.from(name),
    'src/app/manifest.webmanifest': Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    'src/app/theme-color.json': Buffer.from(`${JSON.stringify(tabColours, null, 2)}\n`),
    'public/icon-192.png': await tile(192, SAFE_ZONE_RATIO),
    'public/icon-512.png': await tile(512, SAFE_ZONE_RATIO),
  }
}

// --- Command line ---------------------------------------------------------------------------

async function main(argv) {
  const read = path => readFileSync(join(root, path), 'utf8')
  const sources = Object.fromEntries(Object.entries(sourceFiles).map(([key, path]) => [key, read(path)]))
  const assets = await buildBrandAssets(sources)
  if (argv.includes('--check')) {
    const stale = Object.entries(assets).filter(([path, bytes]) => {
      try { return !readFileSync(join(root, path)).equals(bytes) } catch { return true }
    })
    if (stale.length > 0) {
      console.error(`Brand assets differ from the Lane mark or the theme file: ${stale.map(([path]) => path).join(', ')}\nRun \`pnpm brand:assets\` and commit the result.`)
      process.exit(1)
    }
    console.log(`Brand assets match their sources (${Object.keys(assets).length} files).`)
  } else {
    for (const [path, bytes] of Object.entries(assets)) writeFileSync(join(root, path), bytes)
    console.log(`Wrote ${Object.keys(assets).length} brand assets.`, themeColours(sources.theme))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv)
