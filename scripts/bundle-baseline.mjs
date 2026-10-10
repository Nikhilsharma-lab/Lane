// Per-route client JS budget (plan items 1.13 and 1.15b, §2.2 "Client JS").
//
// Reads Next's build diagnostics (<distDir>/diagnostics/route-bundle-stats.json,
// written by `next build`), gzips every first-load chunk of every route and
// compares the totals with the committed baseline in
// docs/design-system/bundle-baseline.json.
//
//   node scripts/bundle-baseline.mjs            check; fails if a route grows > 2 KB gzip
//   node scripts/bundle-baseline.mjs --update   write the current sizes as the baseline
//
// Options: --dir <distDir> (default: $NEXT_DIST_DIR or .next),
//          --baseline <path> (default: docs/design-system/bundle-baseline.json).
//
// A route that is new since the baseline also fails the check, so it cannot
// slip past the budget; run --update in the same PR with a written waiver.
// Gzip uses zlib's default level, which is close to what a CDN serves; the
// numbers are for comparison between builds, not a byte-exact transfer size.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const TOLERANCE_BYTES = 2048
const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const update = args.includes('--update')
const distDir = option('--dir') ?? process.env.NEXT_DIST_DIR ?? '.next'
const baselinePath = resolve(root, option('--baseline') ?? 'docs/design-system/bundle-baseline.json')
const statsPath = join(root, distDir, 'diagnostics', 'route-bundle-stats.json')

if (!existsSync(statsPath)) {
  console.error(`No bundle stats at ${relative(root, statsPath)}. Run \`NEXT_DIST_DIR=${distDir} pnpm build\` first.`)
  process.exit(1)
}

const stats = JSON.parse(readFileSync(statsPath, 'utf8'))
if (!Array.isArray(stats) || !stats.every(item => typeof item?.route === 'string' && Array.isArray(item.firstLoadChunkPaths))) {
  console.error(`Unexpected format in ${relative(root, statsPath)}; Next may have changed its diagnostics output.`)
  process.exit(1)
}

// Chunk paths are recorded relative to the project root and include the dist
// directory the build used.
const gzipCache = new Map()
function gzipBytes(chunk) {
  if (!gzipCache.has(chunk)) {
    const file = resolve(root, chunk)
    if (!existsSync(file)) throw new Error(`Chunk listed in the stats is missing: ${chunk}`)
    gzipCache.set(chunk, gzipSync(readFileSync(file)).length)
  }
  return gzipCache.get(chunk)
}

const current = {}
for (const item of [...stats].sort((a, b) => a.route.localeCompare(b.route))) {
  current[item.route] = {
    gzipBytes: item.firstLoadChunkPaths.reduce((sum, chunk) => sum + gzipBytes(chunk), 0),
    uncompressedBytes: item.firstLoadUncompressedJsBytes,
    chunks: item.firstLoadChunkPaths.length,
  }
}

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`
const signed = bytes => `${bytes > 0 ? '+' : bytes < 0 ? '-' : '±'}${kb(Math.abs(bytes))}`

if (update) {
  const nextVersion = JSON.parse(readFileSync(join(root, 'node_modules/next/package.json'), 'utf8')).version
  writeFileSync(baselinePath, `${JSON.stringify({
    description: 'First-load client JS per route, gzip. Written by `node scripts/bundle-baseline.mjs --update`; checked by `pnpm bundle:check`.',
    next: nextVersion,
    toleranceBytes: TOLERANCE_BYTES,
    routes: current,
  }, null, 2)}\n`)
  for (const [route, size] of Object.entries(current)) console.log(`${route.padEnd(24)} ${kb(size.gzipBytes).padStart(10)} gzip  ${kb(size.uncompressedBytes).padStart(10)} raw  ${size.chunks} chunks`)
  console.log(`Baseline written to ${relative(root, baselinePath)} (${Object.keys(current).length} routes).`)
  process.exit(0)
}

if (!existsSync(baselinePath)) {
  console.error(`No baseline at ${relative(root, baselinePath)}. Run with --update to create it.`)
  process.exit(1)
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const tolerance = baseline.toleranceBytes ?? TOLERANCE_BYTES
const failures = []
for (const [route, size] of Object.entries(current)) {
  const before = baseline.routes?.[route]
  if (!before) {
    failures.push(`${route}: new route (${kb(size.gzipBytes)} gzip) is not in the baseline`)
    console.log(`${route.padEnd(24)} ${kb(size.gzipBytes).padStart(10)}  new`)
    continue
  }
  const delta = size.gzipBytes - before.gzipBytes
  const over = delta > tolerance
  if (over) failures.push(`${route}: ${kb(before.gzipBytes)} -> ${kb(size.gzipBytes)} (${signed(delta)}, limit +${kb(tolerance)})`)
  console.log(`${route.padEnd(24)} ${kb(size.gzipBytes).padStart(10)}  ${signed(delta).padStart(10)}${over ? '  over budget' : ''}`)
}
for (const route of Object.keys(baseline.routes ?? {})) {
  if (!current[route]) console.log(`${route.padEnd(24)} ${'removed'.padStart(10)}`)
}

if (failures.length) {
  console.error(`\nClient JS budget exceeded:\n${failures.map(line => `  ${line}`).join('\n')}`)
  console.error('If the growth is intended, run `node scripts/bundle-baseline.mjs --update` and record a waiver in the PR description.')
  process.exit(1)
}
console.log(`\nBundle check passed: no route grew more than ${kb(tolerance)} gzip.`)
