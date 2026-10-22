import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const read = path => readFileSync(join(root, path), 'utf8')
const hash = path => createHash('sha256').update(readFileSync(join(root, path))).digest('hex')
const errors = []
const ledger = JSON.parse(read('docs/design-system/arc-source-hashes.json'))
const notes = read('docs/design-system/arc-sources.md')
const listed = new Set()

for (const item of ledger) {
  if (!item.file.startsWith('src/components/arc/') || !item.source.startsWith('https://uiarc.dev/r/')) errors.push(`Invalid Arc source record: ${item.file}`)
  if (listed.has(item.file)) errors.push(`Duplicate Arc source record: ${item.file}`)
  listed.add(item.file)
  if (!existsSync(join(root, item.file))) { errors.push(`Missing Arc source: ${item.file}`); continue }
  const actual = hash(item.file)
  if (actual !== (item.localSha256 ?? item.upstreamSha256)) errors.push(`Arc source changed without a ledger update: ${item.file}`)
  if (item.localSha256 && actual === item.upstreamSha256) errors.push(`Stale adaptation entry: ${item.file}`)
  if (item.localSha256 && !notes.includes(item.file)) errors.push(`Undocumented Arc adaptation: ${item.file}`)
}

function walk(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.isFile()) {
      const file = relative(root, path).replaceAll('\\', '/')
      if (file.startsWith('src/components/arc/')) {
        if (!listed.has(file)) errors.push(`Unrecorded Arc source: ${file}`)
      } else if (/\.(?:ts|tsx|css)$/.test(file) && !/\.(?:test|spec|stories)\.[^.]+$/.test(file)) {
        const source = readFileSync(path, 'utf8')
        if (/[@/]components\/(?:reui|library|ui|icons)(?:\/|["'])|@astryxdesign|@base-ui\/react|@heroicons\/react|\bsonner\b/i.test(source)) errors.push(`Retired UI import or reference in product source: ${file}`)
      }
    }
  }
}
walk(join(root, 'src/app'))
walk(join(root, 'src/components'))

const config = JSON.parse(read('components.json'))
const registryNames = Object.keys(config.registries ?? {}).sort()
if (JSON.stringify(registryNames) !== JSON.stringify(['@uiarc', '@uiarc-pro'])) errors.push(`Unexpected UI registries: ${registryNames.join(', ')}`)
// Arc's foundation loads once, from globals.css, inside its own cascade layer below the theme file
// and bridge (#87), so none of its light or dark defaults can paint over the theme.
if (!/^@import "\.\.\/components\/arc\/foundation\.css" layer\(arc-foundation\);$/m.test(read('src/app/globals.css'))) errors.push('Arc foundation not imported in globals.css as @import "../components/arc/foundation.css" layer(arc-foundation);')
for (const file of ['src/app/layout.tsx', 'src/app/global-error.tsx']) if (read(file).includes('arc/foundation.css')) errors.push(`${file} imports Arc foundation unlayered; globals.css brings it in its cascade layer`)
const packageJson = JSON.parse(read('package.json'))
for (const name of Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
  if (/^@astryxdesign\/|^@base-ui\/react$|^@heroicons\/react$|^@stylexjs\/stylex$|^sonner$|^cmdk$/.test(name)) errors.push(`Retired UI dependency: ${name}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  const adapted = ledger.filter(item => item.localSha256).length
  console.log(`Arc source check passed: ${ledger.length} recorded files, ${adapted} documented adaptations.`)
}
