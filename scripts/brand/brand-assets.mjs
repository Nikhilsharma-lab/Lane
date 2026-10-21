// Favicon, app icons, web app manifest and Open Graph image (launch plan §6.4, prod audit O4).
//
// Every asset is derived from two sources, so none of them carries a hand-picked value:
//   - the Lane mark: the <path d> data of LaneMark in src/components/auth/auth-shell.tsx;
//   - colours and proportions: src/styles/supabase-tokens.css (light and dark --sb-background /
//     --sb-foreground), resolved from oklch to sRGB hex because icon files and the manifest are
//     read by browsers and platforms that do not evaluate CSS custom properties.
//
//   node scripts/brand/brand-assets.mjs           write the assets
//   node scripts/brand/brand-assets.mjs --check   fail if a committed asset differs from the sources
//
// Next's metadata file conventions serve the files under src/app (favicon.ico, icon.svg,
// apple-icon.png, opengraph-image.png + .alt.txt, manifest.webmanifest). The manifest's 192px and
// 512px icons have no metadata convention of their own, so they are static files in public/.
// Rendering uses next/og (Satori + resvg, WebAssembly) with its bundled Geist Regular.

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const require = createRequire(join(root, 'package.json'))
const { ImageResponse } = require('next/og')
const { createElement: h } = require('react')
const read = path => readFileSync(join(root, path), 'utf8')

// --- Sources --------------------------------------------------------------------------------

const markSource = read('src/components/auth/auth-shell.tsx').match(/export function LaneMark\(\)[\s\S]*?<\/svg>/)
if (!markSource) throw new Error('LaneMark not found in src/components/auth/auth-shell.tsx')
const markViewBox = markSource[0].match(/viewBox="([^"]+)"/)[1]
const markPaths = [...markSource[0].matchAll(/<path d="([^"]+)"/g)].map(match => match[1])
if (markPaths.length === 0) throw new Error('LaneMark has no paths')

const tokens = read('src/styles/supabase-tokens.css')
function themeBlock(selector) {
  const start = tokens.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`Token block not found: ${selector}`)
  return tokens.slice(start, tokens.indexOf('\n}', start))
}
const lightBlock = themeBlock(':root[data-visual-system="lane"]')
const darkBlock = themeBlock(':root[data-visual-system="lane"][data-theme="dark"]')
function token(block, name) {
  const match = block.match(new RegExp(`--sb-${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`Token not found: --sb-${name}`)
  return match[1].trim()
}
const sizeToken = name => {
  const value = token(tokens, name)
  if (value.endsWith('rem')) return parseFloat(value) * 16
  if (value.endsWith('px')) return parseFloat(value)
  if (value.endsWith('em')) return parseFloat(value)
  throw new Error(`Unsupported size for --sb-${name}: ${value}`)
}

// oklch(L C h) → sRGB hex (Björn Ottosson's OKLab matrices, CSS Color 4 transfer function).
function oklchToHex(value) {
  const match = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/)
  if (!match) throw new Error(`Expected an opaque oklch() colour, got ${value}`)
  const [L, C, hue] = match.slice(1).map(Number)
  const a = C * Math.cos((hue * Math.PI) / 180)
  const b = C * Math.sin((hue * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return `#${linear
    .map(channel => {
      const clamped = Math.min(1, Math.max(0, channel))
      const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
      return Math.round(encoded * 255).toString(16).padStart(2, '0')
    })
    .join('')}`
}

const colour = {
  lightForeground: oklchToHex(token(lightBlock, 'foreground')),
  darkBackground: oklchToHex(token(darkBlock, 'background')),
  darkForeground: oklchToHex(token(darkBlock, 'foreground')),
}

// The sign-in header draws the mark at --sb-icon-md beside "Lane" at --sb-text-base, 2 spacing
// units apart, tracked --sb-tracking-tight (auth.module.css .mark). The OG image scales that lockup.
const lockup = {
  mark: sizeToken('icon-md'),
  text: sizeToken('text-base'),
  gap: sizeToken('spacing') * 2,
  tracking: sizeToken('tracking-tight'),
}

const name = 'Lane'
// Same sentence as the root layout's metadata description; no claims beyond what ships.
const description = read('src/app/layout.tsx').match(/const description = "([^"]+)"/)[1]

// --- Assets ---------------------------------------------------------------------------------

const markPathSvg = markPaths.map(d => `<path d="${d}"/>`).join('')

// Browser tab icon: the bare mark, following the browser's colour scheme.
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markViewBox}"><style>path{fill:${colour.lightForeground}}@media (prefers-color-scheme:dark){path{fill:${colour.darkForeground}}}</style>${markPathSvg}</svg>\n`

function markElement(size, fill) {
  return h('svg', { width: size, height: size, viewBox: markViewBox, fill }, ...markPaths.map(d => h('path', { d })))
}

// App tiles: the dark-theme surface with the mark centred. `markRatio` keeps the mark inside the
// maskable-icon safe zone (a centred circle of 40% radius) for the manifest and apple icons.
async function tile(size, markRatio) {
  const element = h(
    'div',
    { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colour.darkBackground } },
    markElement(Math.round(size * markRatio), colour.darkForeground),
  )
  return Buffer.from(await new ImageResponse(element, { width: size, height: size }).arrayBuffer())
}

async function openGraphImage() {
  const scale = 120 / lockup.mark
  const element = h(
    'div',
    {
      style: {
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: lockup.gap * scale, background: colour.darkBackground, color: colour.darkForeground,
      },
    },
    markElement(lockup.mark * scale, colour.darkForeground),
    h('span', { style: { fontSize: lockup.text * scale, letterSpacing: `${lockup.tracking}em`, lineHeight: 1 } }, name),
  )
  return Buffer.from(await new ImageResponse(element, { width: 1200, height: 630 }).arrayBuffer())
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

const manifest = {
  name,
  short_name: name,
  description,
  start_url: '/',
  display: 'standalone',
  background_color: colour.darkBackground,
  theme_color: colour.darkBackground,
  icons: [
    { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

const SAFE_ZONE_RATIO = 0.5
const FAVICON_RATIO = 0.75

const assets = {
  'src/app/icon.svg': Buffer.from(iconSvg),
  'src/app/favicon.ico': ico(await Promise.all([16, 32, 48].map(async size => ({ size, png: await tile(size, FAVICON_RATIO) })))),
  'src/app/apple-icon.png': await tile(180, SAFE_ZONE_RATIO),
  'src/app/opengraph-image.png': await openGraphImage(),
  'src/app/opengraph-image.alt.txt': Buffer.from(name),
  'src/app/manifest.webmanifest': Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  'public/icon-192.png': await tile(192, SAFE_ZONE_RATIO),
  'public/icon-512.png': await tile(512, SAFE_ZONE_RATIO),
}

if (process.argv.includes('--check')) {
  const stale = Object.entries(assets).filter(([path, bytes]) => {
    try { return !readFileSync(join(root, path)).equals(bytes) } catch { return true }
  })
  if (stale.length > 0) {
    console.error(`Brand assets differ from the Lane mark or Supabase tokens: ${stale.map(([path]) => path).join(', ')}\nRun \`pnpm brand:assets\` and commit the result.`)
    process.exit(1)
  }
  console.log(`Brand assets match their sources (${Object.keys(assets).length} files).`)
} else {
  for (const [path, bytes] of Object.entries(assets)) writeFileSync(join(root, path), bytes)
  console.log(`Wrote ${Object.keys(assets).length} brand assets.`, colour)
}
