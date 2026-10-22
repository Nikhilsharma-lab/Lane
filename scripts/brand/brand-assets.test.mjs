import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildBrandAssets, cssColourToHex, themeColours } from './brand-assets.mjs'

const root = resolve(import.meta.dirname, '../..')
const read = path => readFileSync(join(root, path), 'utf8')
const repoSources = { theme: read('src/styles/theme.css'), mark: read('src/components/auth/auth-shell.tsx'), layout: read('src/app/layout.tsx') }

// Replaces a slot's value inside the first :root or .dark block only (tweakcn's half).
function withSlot(theme, selector, name, value) {
  const start = theme.search(new RegExp(`^${selector.replace('.', '\\.')} \\{`, 'm'))
  const end = theme.indexOf('\n}', start)
  const block = theme.slice(start, end).replace(new RegExp(`(--${name}:)[^;]+;`), `$1 ${value};`)
  return theme.slice(0, start) + block + theme.slice(end)
}
const manifestOf = assets => JSON.parse(assets['src/app/manifest.webmanifest'].toString())

test('changing the dark background changes the manifest colours and the app icons', async () => {
  const before = await buildBrandAssets(repoSources)
  const after = await buildBrandAssets({ ...repoSources, theme: withSlot(repoSources.theme, '.dark', 'background', 'oklch(0.4 0.1 250)') })
  assert.notEqual(manifestOf(after).theme_color, manifestOf(before).theme_color)
  assert.notEqual(manifestOf(after).background_color, manifestOf(before).background_color)
  for (const icon of ['public/icon-192.png', 'public/icon-512.png', 'src/app/apple-icon.png', 'src/app/favicon.ico']) {
    assert.ok(!after[icon].equals(before[icon]), icon)
  }
})

test('the tab colour follows the light and dark backgrounds', async () => {
  const theme = withSlot(withSlot(repoSources.theme, ':root', 'background', '#fafafa'), '.dark', 'background', 'hsl(220 20% 10%)')
  const assets = await buildBrandAssets({ ...repoSources, theme })
  assert.deepEqual(JSON.parse(assets['src/app/theme-color.json'].toString()), { light: '#fafafa', dark: '#14181f' })
})

test('the tab icon follows the light and dark foregrounds', async () => {
  const theme = withSlot(withSlot(repoSources.theme, ':root', 'foreground', 'rgb(10 20 30)'), '.dark', 'foreground', 'oklch(1 0 0)')
  const svg = (await buildBrandAssets({ ...repoSources, theme }))['src/app/icon.svg'].toString()
  assert.match(svg, /path\{fill:#0a141e\}@media \(prefers-color-scheme:dark\)\{path\{fill:#ffffff\}\}/)
})

test('resolves every colour format tweakcn exports to sRGB hex', () => {
  assert.equal(cssColourToHex('oklch(0 0 0)'), '#000000')
  assert.equal(cssColourToHex('oklch(1.0000 0 0)'), '#ffffff')
  assert.equal(cssColourToHex('oklch(0.6279554 0.2576833 29.2338851)'), '#ff0000')
  assert.equal(cssColourToHex('oklab(0.4520137 -0.0324570 -0.3115281)'), '#0000ff')
  assert.equal(cssColourToHex('hsl(120 100% 25%)'), '#008000')
  assert.equal(cssColourToHex('hsl(0, 0%, 50%)'), '#808080')
  assert.equal(cssColourToHex('rgb(255 128 0)'), '#ff8000')
  assert.equal(cssColourToHex('#ABC'), '#aabbcc')
  assert.equal(cssColourToHex('oklch(0.5 0.1 157.5 / 1)'), cssColourToHex('oklch(0.5 0.1 157.5)'))
})

test('refuses colours an icon file cannot hold', () => {
  for (const value of ['oklch(0.5 0.1 157.5 / 0.5)', '#00000080', 'color-mix(in oklab, red, blue)', 'var(--x)']) {
    assert.throws(() => cssColourToHex(value), value)
  }
})

test('a dark slot that is missing or points at another slot resolves the way the browser does', () => {
  const dark = repoSources.theme.match(/^\.dark \{[\s\S]*?\n\}/m)[0]
  const withoutDarkBackground = repoSources.theme.replace(dark, dark.replace(/\n\s*--background:[^;]+;/, ''))
  assert.equal(themeColours(withoutDarkBackground).dark.background, themeColours(repoSources.theme).light.background)
  const pointing = withSlot(repoSources.theme, '.dark', 'background', 'var(--card)')
  assert.equal(themeColours(pointing).dark.background, cssColourToHex(dark.match(/--card:\s*([^;]+);/)[1]))
})
