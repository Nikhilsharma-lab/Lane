// Replaces the tweakcn half of the theme file with a new tweakcn export and keeps the Lane additions.
//   npm run theme:paste            pastes what's on the clipboard (tweakcn → Code → Tailwind v4 → Copy)
//   npm run theme:paste -- <file>  pastes a saved export
//   npm run theme:copy             copies Lane's current tweakcn half, ready for tweakcn's Import
//   npm run theme:reset            goes back to the last committed theme file
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { laneAdditionsMarker } from './token-contract.mjs'

const root = resolve(import.meta.dirname, '../..')
const themePath = resolve(root, 'src/styles/theme.css')

function additionsStart(theme) {
  const marker = theme.indexOf(`/* ${laneAdditionsMarker}`)
  if (marker === -1) throw new Error(`The theme file has no "/* ${laneAdditionsMarker}" section, so there's nothing safe to keep. Restore it with npm run theme:reset.`)
  return marker
}

export function tweakcnHalf(theme) {
  return theme.slice(0, additionsStart(theme)).trim()
}

export function replaceTweakcnHalf(theme, exported) {
  const marker = additionsStart(theme)
  const paste = exported.trim()
  if (paste.includes(laneAdditionsMarker)) throw new Error('That paste already holds the Lane additions: copy only the tweakcn export, not the whole theme file.')
  if (!/:root\s*\{/.test(paste) || !/\.dark\s*\{/.test(paste) || !/@theme\s+inline\s*\{/.test(paste)) {
    throw new Error("That doesn't look like a tweakcn export: in tweakcn choose Code, then Tailwind v4, then Copy.")
  }
  return `${paste}\n\n${theme.slice(marker)}`
}

function main(argv) {
  if (argv[2] === '--reset') {
    execFileSync('git', ['restore', '--', 'src/styles/theme.css', 'src/app/theme-color.json'], { cwd: root })
    console.log('Theme file is back to its last saved (committed) version.')
    return
  }
  if (argv[2] === '--copy') {
    execFileSync('pbcopy', { input: tweakcnHalf(readFileSync(themePath, 'utf8')) })
    console.log("Copied Lane's current tweakcn half. In tweakcn, choose Import and paste it.")
    return
  }
  const exported = argv[2] ? readFileSync(resolve(argv[2]), 'utf8') : execFileSync('pbpaste', { encoding: 'utf8' })
  writeFileSync(themePath, replaceTweakcnHalf(readFileSync(themePath, 'utf8'), exported))
  console.log('Pasted the tweakcn export into src/styles/theme.css. The Lane additions are unchanged.')
  spawnSync(process.execPath, ['scripts/brand/brand-assets.mjs'], { cwd: root, stdio: 'ignore' })
  const check = spawnSync(process.execPath, ['scripts/design-system/token-contract.mjs'], { cwd: root, encoding: 'utf8' })
  const warnings = check.stderr.match(/Contrast warnings[\s\S]*?(?=\nRecorded exemptions|$)/)
  if (warnings) console.log(`\n${warnings[0].trim()}`)
  if (check.status !== 0) console.log(`\nThe design check found problems Lane can't paint around:\n${check.stderr.replace(warnings?.[0] ?? '', '').trim()}`)
  else console.log('\nDesign check passed. Look at Lane in the browser; it updates on its own.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
