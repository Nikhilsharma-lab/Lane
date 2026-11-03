import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import postcss from 'postcss'
import { toHex, parseColour } from './colour.mjs'
import { auditTokenReferences, laneAdditionsMarker } from './token-contract.mjs'

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
const mapping = JSON.parse(read('docs/design-system/references/polar/preview-mapping.json'))
const source = Object.fromEntries(JSON.parse(read('docs/design-system/references/polar/polar-token-comparison.json')).rows.map(row => [row.name, row.definition]))
const css = read('src/styles/theme.css')
const bridge = read('src/styles/theme-bridge.css')

const productSources = {}
function collect(folder) {
  for (const entry of readdirSync(new URL(`../../${folder}`, import.meta.url), { withFileTypes: true })) {
    const file = `${folder}/${entry.name}`
    if (entry.isDirectory()) collect(file)
    else if (/\.(?:css|tsx?)$/.test(file) && !/\.(?:test|spec|d)\./.test(file)) productSources[file] = read(file)
  }
}
collect('src')

test('Lane owns the global namespace and product styles have no legacy palette dependency', () => {
  const additions = css.slice(css.indexOf(`/* ${laneAdditionsMarker}`))
  postcss.parse(additions).walkDecls(d => {
    if (d.prop.startsWith('--')) assert.ok(d.prop.startsWith('--lane-'), d.prop)
  })
  for (const [file, source] of Object.entries(productSources)) assert.ok(!/--polar-|data-preview-palette/.test(source), file)
  assert.deepEqual(auditTokenReferences(productSources), [])
})

test('captured source evidence remains unchanged', () => {
  const manifest = JSON.parse(read('docs/design-system/references/polar/manifest.json'))
  for (const [file, digest] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(read(`docs/design-system/references/polar/${file}`)).digest('hex'), digest, file)
  }
})

test('secondary accent and gradient states use the source blue family in both modes', () => {
  for (const dark of [false, true]) {
    const values = {}
    postcss.parse(css + '\n' + bridge).walkRules(rule => {
      if (rule.selector === ':root' || dark && rule.selector === '.dark') rule.walkDecls(d => { values[d.prop] = d.value })
    })
    for (const [role, lightSource, darkSource] of [
      ['--lane-accent-strong', '--color-blue-700', '--color-blue-400'],
      ['--lane-link-ink', '--color-blue-700', '--color-blue-400'],
      ['--lane-gradient-from', '--color-blue-50', '--color-blue-950'],
      ['--lane-gradient-to', '--color-blue-200', '--color-blue-900'],
    ]) assert.equal(toHex(resolve(values[role], values)), toHex(source[dark ? darkSource : lightSource]), role)
  }
})

function resolve(value, values, trail = []) {
  return value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    assert.ok(!trail.includes(name), `Circular token: ${name}`)
    assert.ok(values[name], `Missing token: ${name}`)
    return resolve(values[name], values, [...trail, name])
  })
}

for (const dark of [false, true]) test(`Lane ${dark ? 'dark' : 'light'} theme matches every approved source colour role`, () => {
  const expected = {}, actual = {}
  for (const block of mapping) if (dark || !block.selector.includes('.dark')) Object.assign(expected, block.tokens)
  // Browser-serialized Lab values are compared using the captured upstream definition.
  for (const [key, value] of Object.entries(expected)) if (key.startsWith('--polar-') && value.startsWith('lab(')) expected[key] = resolve(source[key.replace('--polar-', '--')], source)
  postcss.parse(css + "\n" + bridge).walkRules(rule => {
    if (rule.selector !== ':root' && !(dark && rule.selector === '.dark')) return
    rule.walkDecls(d => { actual[d.prop] = d.value })
  })
  for (const [key, value] of Object.entries(expected)) {
    if (key.startsWith('--polar-')) continue
    assert.ok(actual[key], `Missing product role: ${key}`)
    const want = resolve(value, expected), got = resolve(actual[key], actual)
    if (parseColour(want) && parseColour(got)) assert.equal(toHex(got), toHex(want), key)
    else assert.equal(got, want, key)
  }
  assert.equal(actual['--spacing'], '0.25rem')
  assert.equal(actual['--font-sans'], 'Geist, sans-serif')
  assert.equal(actual['--radius'], '0.5rem')
  assert.ok(!css.includes('data-preview-palette'), 'Product theme must not depend on fixture attributes')
})
