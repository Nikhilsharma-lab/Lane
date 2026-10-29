import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { auditCss } from './token-contract.mjs'
import * as tokenContract from './token-contract.mjs'

test('rejects fixed visual values including fallbacks and local tokens', () => {
  for (const declaration of ['padding: 12px', 'border-radius: .5rem', 'color: #fff', 'background: rgb(0 0 0 / .5)', 'box-shadow: 0 2px 4px black', '--row: 32px', 'gap: var(--gap, 8px)', 'font-weight: 500', 'line-height: 1.4', 'color: color-mix(in oklab, var(--foreground) 20%, transparent)']) {
    assert.ok(auditCss(`.control { ${declaration} }`).length, declaration)
  }
})
test('accepts tokens, derived spacing and geometric mechanics', () => {
  assert.deepEqual(auditCss('.control { padding: var(--space-2); width: calc(var(--space-1) * 10); border-radius: var(--radius-control); opacity: .5; transform: scale(.98); height: 100%; margin: 0; line-height: 1; }'), [])
})

test('pages cannot redefine shared control tokens even with token-valued overrides', () => {
  for (const token of ['--button-padding-sm', '--input-background', '--badge-gap', '--segment-radius']) {
    const css = `.page { ${token}: var(--space-1) }`
    assert.equal(auditCss(css, 'src/components/shell/page.module.css').length, 1, token)
    assert.deepEqual(auditCss(css, 'src/styles/theme-bridge.css'), [])
    assert.deepEqual(auditCss(css, 'src/components/arc/button/button.module.css'), [])
  }
  assert.deepEqual(auditCss('.page { padding: var(--button-padding-sm); --content-width: calc(var(--space-1) * 80) }'), [])
  assert.deepEqual(auditCss('.row[data-selected] { --badge-background: var(--selection-background) }'), [])
})

test('search inputs have one shared component owner', () => {
  assert.equal(typeof tokenContract.auditSharedControls, 'function')
  for (const prop of ['type="search"', 'type={"search"}', 'role="searchbox"']) {
    const source = `const view = <input ${prop} />`
    assert.equal(tokenContract.auditSharedControls(source, 'src/components/shell/page.tsx').length, 1)
    assert.deepEqual(tokenContract.auditSharedControls(source, 'src/components/arc/search-field/search-field.tsx'), [])
  }
  assert.deepEqual(tokenContract.auditSharedControls('const view = <SearchField label="Search" value="" onValueChange={change} />'), [])
  assert.deepEqual(tokenContract.auditSharedControls('const view = <input type="file" />'), [])
})
test('only the theme file has dark-mode selectors; light/dark differences are theme tokens', () => {
  for (const css of [':global([data-theme="dark"]) .thumb { box-shadow: none; }', ':global(.dark) .row { background: var(--surface); }', '.dark .row { color: var(--foreground); }', '@media (prefers-color-scheme: dark) { .row { color: var(--foreground); } }']) {
    const errors = auditCss(css, 'src/components/shell/page.module.css')
    assert.equal(errors.length, 1, `${css}\n${errors.join('\n')}`)
    assert.match(errors[0], /^src\/components\/shell\/page\.module\.css:1 .*dark/)
    assert.deepEqual(auditCss(css, 'src/styles/theme.css'), [])
  }
  assert.deepEqual(auditCss('.darkMode .row, .dark-panel { color: var(--foreground); } @media (prefers-color-scheme: light) { .x { color: var(--foreground); } }', 'src/components/shell/page.module.css'), [])
})
test('responsive thresholds and comments are not declarations', () => {
  assert.deepEqual(auditCss('/* old padding: 8px */ @media (max-width: 640px) { .x { padding: var(--space-2); } }'), [])
})
test('accessibility clipping allows only its mechanical declarations', () => {
  assert.deepEqual(auditCss('.srOnly { width: 1px; height: 1px; margin: -1px; clip: rect(0,0,0,0); }'), [])
  assert.ok(auditCss('.srOnly { padding: 12px; color: #fff; }').length)
})
test('mask paint is geometry; visual paint is not', () => {
  assert.deepEqual(auditCss('.x { mask-image: linear-gradient(black, transparent); }'), [])
  assert.ok(auditCss('.x { background: black; }').length)
})
test('palette token names are not literal colours', () => {
  assert.deepEqual(auditCss('.x { color: var(--label-purple); background: var(--project-blue); }'), [])
})
test('nothing reads the retired Supabase token names', () => {
  for (const value of ['var(--sb-spacing)', 'calc(var(--sb-spacing) * 2)', 'var(--sidebar-width, var(--sb-sidebar-width))']) {
    const errors = auditCss(`.x { padding: ${value}; }`, 'src/components/shell/page.module.css')
    assert.equal(errors.length, 1, value)
    assert.match(errors[0], /retired --sb-\* token/)
  }
})
test('inline styles cannot bypass the CSS contract', async () => {
  const { auditInlineStyles } = await import('./token-contract.mjs')
  assert.ok(auditInlineStyles('const x = <div style={{ padding: 12, borderRadius: "8px" }} />').length)
  assert.ok(auditInlineStyles('const x = <div style={{ fontWeight: 500 }} />').length)
  assert.deepEqual(auditInlineStyles('const x = <div style={{ padding: "var(--space-3)", width: measuredWidth, opacity: .5 }} />'), [])
  assert.deepEqual(auditInlineStyles('const x = <svg width={24} viewBox="0 0 24 24" />'), [])
})

test('Lucide icons cannot set fixed dimensions through props or aliases', () => {
  assert.equal(typeof tokenContract.auditIcons, 'function', 'icon auditing must be part of the shared contract')
  for (const prop of ['size={24}', 'size="24"', 'width={18}', 'height={18}', 'size={"1rem"}']) {
    assert.equal(tokenContract.auditIcons(`import { Send as SendIcon } from 'lucide-react'; const view = <SendIcon ${prop} />`).length, 1, prop)
  }
  assert.equal(tokenContract.auditIcons(`import * as Icons from 'lucide-react'; const view = <Icons.Send size={24} />`).length, 1)
})

test('dynamic icon slots and LucideIcon-typed bindings use the same contract', () => {
  assert.equal(typeof tokenContract.auditIcons, 'function')
  for (const source of [
    `import { type LucideIcon } from 'lucide-react'; const Icon: LucideIcon = chooseIcon(); const view = <Icon size={24} />`,
    `import { type LucideIcon as Glyph } from 'lucide-react'; function Control({ icon: Icon }: { icon: Glyph }) { return <Icon size={24} /> }`,
    `import { type LucideIcon } from 'lucide-react'; type Props = { endIcon?: LucideIcon }; function Control({ endIcon: End }: Props) { return <End size={24} /> }`,
    `import { type LucideIcon } from 'lucide-react'; interface Props { icon: LucideIcon } function Control({ icon: Glyph }: Props) { return <Glyph size={24} /> }`,
    `import { Check, X } from 'lucide-react'; const Icon = selected ? Check : X; const view = <Icon width={24} />`,
    `import { Check, X } from 'lucide-react'; const icons = { success: Check, error: X }; const Icon = icons[state]; const view = <Icon height={24} />`,
    `const view = <status.icon size={24} />`,
  ]) assert.equal(tokenContract.auditIcons(source).length, 1, source)
})

test('fixed Tailwind icon dimensions are rejected including variants and conditional classes', () => {
  assert.equal(typeof tokenContract.auditIcons, 'function')
  for (const value of ['"size-4"', '"h-4 w-5"', '"md:size-6"', '"!size-[18px]"', '"size-[1.25rem]"', '"size-4!"', 'cn("size-4", styles.icon)', 'small ? "size-3" : "size-4"']) {
    assert.ok(tokenContract.auditIcons(`import { Send } from 'lucide-react'; const view = <Send className={${value}} />`).length, value)
  }
})

test('custom outer SVG dimensions use tokens while drawing geometry stays literal', () => {
  assert.equal(typeof tokenContract.auditIcons, 'function')
  assert.equal(tokenContract.auditIcons('<svg width="16" height={16} viewBox="0 0 16 16"><rect width="14" height="14" /><path d="M0 0h16" /></svg>').length, 2)
  assert.deepEqual(tokenContract.auditIcons('<svg data-ui-icon viewBox="0 0 16 16"><defs><mask id="cutout" width="16" height="16"><rect width="16" height="16" /></mask></defs><path d="M0 0h16" strokeWidth={1.5} /></svg>'), [])
})

test('icons accept shared defaults, semantic roles and token dimensions', () => {
  assert.equal(typeof tokenContract.auditIcons, 'function')
  for (const attributes of ['', 'data-icon-size="xs"', 'data-icon-size="2xl"', 'size="var(--icon-size-sm)"', 'width="var(--icon-size-md)" height="var(--icon-size-md)"', 'className="size-[var(--icon-size-md)]"', 'className="size-(--icon-size-sm)"', 'className={styles.icon}']) {
    assert.deepEqual(tokenContract.auditIcons(`import { Send } from 'lucide-react'; const view = <Send ${attributes} />`), [], attributes)
  }
  assert.deepEqual(tokenContract.auditIcons('<svg data-ui-icon data-icon-size="md" viewBox="0 0 24 24" />'), [])
  assert.deepEqual(tokenContract.auditIcons('<Button size="sm" /><div className="size-4" /><img width="40" height="40" />'), [])
  assert.deepEqual(tokenContract.auditIcons(`import { Send } from 'lucide-react'; const Banner = () => <Send />; const view = <Banner className="w-48" />`), [])
})

test('unsupported icon roles cannot silently fall back to the default', () => {
  assert.equal(typeof tokenContract.auditIcons, 'function')
  assert.equal(tokenContract.auditIcons(`import { Send } from 'lucide-react'; const view = <Send data-icon-size="giant" />`).length, 1)
  assert.equal(tokenContract.auditIcons('<svg data-ui-icon data-icon-size="16" />').length, 1)
})

test('the application audit combines CSS, inline style and icon violations', () => {
  const root = mkdtempSync(join(tmpdir(), 'lane-icon-contract-'))
  try {
    for (const folder of ['app', 'components', 'styles']) mkdirSync(join(root, 'src', folder), { recursive: true })
    writeFileSync(join(root, 'src/styles/controls.css'), '.control { gap: 8px; }')
    writeFileSync(join(root, 'src/components/control.tsx'), `import { Send } from 'lucide-react'; const control = <Send size={24} style={{ margin: 8 }} />`)
    const errors = tokenContract.auditTree(root)
    assert.equal(errors.length, 3)
    assert.ok(errors.some(error => error.includes('gap: 8px')))
    assert.ok(errors.some(error => error.includes('inline margin: 8')))
    assert.ok(errors.some(error => error.includes('icon Send size={24}')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// The one-theme-file contract (#90). Fixtures are whole mini repos so each rule is
// observed through the same entry point the theme switch turns on.
const cleanTheme = `@import "tailwindcss";
@custom-variant dark (&:is(.dark *));
:root { --background: oklch(1 0 0); --foreground: oklch(0.1 0 0); --primary: oklch(0.525 0.12 157.5); --primary-foreground: oklch(0.98 0 0); --radius: 0.5rem; }
.dark { --background: oklch(0.19 0 0); --foreground: oklch(0.95 0 0); --primary: oklch(0.436 0.11 157.5); --primary-foreground: oklch(0.95 0 0); }
@theme inline { --color-background: var(--background); --radius-sm: calc(var(--radius) - 4px); }

/* Lane additions */
:root { --accent-ink: var(--primary); --hairline: oklch(0 0 0 / .081); --corner-lg: calc(var(--radius) * 4 / 3); --duration-standard: 200ms; }
.dark { --accent-ink: oklch(0.76 0.15 157.5); --hairline: oklch(1 0 0 / .075); }
`
const cleanBridge = `:root { --accent: var(--accent-ink); --border: var(--hairline); --radius-surface: var(--corner-lg); }
[data-ui-surface="floating"] { --border: var(--hairline); }
@theme inline { --radius-lg: var(--corner-lg); }
`
const cleanFoundation = ':root { --accent: #0562ef; --border: rgb(0 0 0 / .1); --background: #fff; --radius-surface: 12px; }\n:root[data-theme="dark"] { --accent: #6ba3ff; }\n'

function themeFixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'lane-theme-contract-'))
  const files = {
    'src/styles/theme.css': cleanTheme,
    'src/styles/theme-bridge.css': cleanBridge,
    'src/components/arc/foundation.css': cleanFoundation,
    'src/components/arc/motion-tokens.ts': 'export const motionTokens = { duration: { standard: 0.2 } }\n',
    'src/components/row.module.css': '.row { color: var(--accent); padding: var(--space-2); border-radius: var(--radius-surface); }\n',
    'src/app/page.tsx': 'export default function Page() { return <div style={{ padding: "var(--space-3)" }} /> }\n',
    ...overrides,
  }
  for (const [file, contents] of Object.entries(files)) {
    if (contents === undefined) continue
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), contents)
  }
  return root
}
function auditFixture(overrides) {
  const root = themeFixture(overrides)
  try { return tokenContract.auditThemeContract(root) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('a clean one-theme-file repo passes', () => {
  const result = auditFixture()
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.warnings, [])
})

test('visual literals outside the theme file fail, including the retired token files', () => {
  for (const [file, css] of [
    ['src/components/row.module.css', '.row { color: #fff; }'],
    ['src/styles/supabase-tokens.css', ':root { --sb-foreground: oklch(0.1 0 0); }'],
    ['src/styles/lane-arc-theme.css', ':root { --overlay: color-mix(in oklab, var(--background) 80%, transparent); }'],
  ]) {
    const { errors } = auditFixture({ [file]: css })
    assert.ok(errors.length, file)
    assert.ok(errors.every(error => error.startsWith(file)), errors.join('\n'))
    assert.ok(errors.some(error => error.includes(css.match(/: (.+?);/)[1])), errors.join('\n'))
  }
})

test('the theme file must keep its Lane additions marker', () => {
  const { errors } = auditFixture({ 'src/styles/theme.css': cleanTheme.replace('/* Lane additions */', '') })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^src\/styles\/theme\.css .*Lane additions/)
})

test('Lane additions never reuse a name the tweakcn half defines, including its @theme inline keys', () => {
  for (const [line, name] of [['--radius-sm: calc(var(--radius) * 2 / 3);', '--radius-sm'], ['--background: oklch(0.99 0 0);', '--background'], ['--color-background: var(--hairline);', '--color-background']]) {
    const theme = cleanTheme.replace('--duration-standard: 200ms;', `--duration-standard: 200ms; ${line}`).replace('--hairline: oklch(1 0 0 / .075);', `--hairline: oklch(1 0 0 / .075); ${line}`)
    const { errors } = auditFixture({ 'src/styles/theme.css': theme })
    assert.ok(errors.length >= 1, `${name}\n${errors.join('\n')}`)
    assert.ok(errors.every(error => error.startsWith('src/styles/theme.css:') && error.includes(name) && /tweakcn/.test(error)), errors.join('\n'))
  }
})

test('the bridge holds only renames of names the theme file defines', () => {
  for (const line of ['--accent: #0562ef;', '--radius-surface: calc(var(--radius) * 2);', '--border: color-mix(in oklab, var(--foreground) 8%, transparent);', '--border: transparent;', '--radius-surface: 0;', '--accent: var(--accent-ink, #0562ef);', '--accent: var(--brand-ink);']) {
    const { errors } = auditFixture({ 'src/styles/theme-bridge.css': cleanBridge.replace('--accent: var(--accent-ink);', `--accent: var(--accent-ink); ${line}`) })
    assert.equal(errors.length, 1, `${line}\n${errors.join('\n')}`)
    assert.match(errors[0], /^src\/styles\/theme-bridge\.css:1 /)
  }
  for (const selector of ['.dark', ':root[data-theme="dark"]', '@media (prefers-color-scheme: dark) { :root']) {
    const { errors } = auditFixture({ 'src/styles/theme-bridge.css': `${cleanBridge}${selector} { --accent: var(--accent-ink); }${selector.startsWith('@') ? ' }' : ''}\n` })
    assert.equal(errors.length, 1, `${selector}\n${errors.join('\n')}`)
    assert.match(errors[0], /mode/)
  }
})

test('every Arc foundation name is defined by the theme file or the bridge', () => {
  const foundation = `${cleanFoundation}:root[data-theme="dark"][data-accent="blue"] { --control-on: #3b82f6; }\n`
  const { errors } = auditFixture({ 'src/components/arc/foundation.css': foundation })
  assert.equal(errors.length, 1, errors.join('\n'))
  assert.match(errors[0], /^src\/components\/arc\/foundation\.css:3 --control-on /)
  // Arc's per-slot icon variable carries no value of its own.
  assert.deepEqual(auditFixture({ 'src/components/arc/foundation.css': `${cleanFoundation}:where([data-icon-size="xs"]) { --icon-size: var(--accent); }\n` }).errors, [])
})

test('Lane additions colours need both a light and a dark value', () => {
  const lightOnly = cleanTheme.replace('--duration-standard: 200ms;', '--duration-standard: 200ms; --success: oklch(0.6 0.15 150);')
  const lightErrors = auditFixture({ 'src/styles/theme.css': lightOnly }).errors
  assert.equal(lightErrors.length, 1, lightErrors.join('\n'))
  assert.match(lightErrors[0], /^src\/styles\/theme\.css:8 --success .*dark/)
  const darkOnly = cleanTheme.replace('--hairline: oklch(1 0 0 / .075);', '--hairline: oklch(1 0 0 / .075); --project-slate: #64748b;')
  const darkErrors = auditFixture({ 'src/styles/theme.css': darkOnly }).errors
  assert.equal(darkErrors.length, 1, darkErrors.join('\n'))
  assert.match(darkErrors[0], /^src\/styles\/theme\.css:9 --project-slate .*light/)
  // A colour function whose channels are all references follows them; only literal channels need a dark value.
  const referenced = cleanTheme.replace('--duration-standard: 200ms;', '--duration-standard: 200ms; --edge-colour: 0 0% 0%; --edge: 0 1px 0 hsl(var(--edge-colour) / calc(.04 * var(--edge-strength)));').replace('--hairline: oklch(1 0 0 / .075);', '--hairline: oklch(1 0 0 / .075); --edge-colour: 0 0% 100%;')
  assert.deepEqual(auditFixture({ 'src/styles/theme.css': referenced }).errors, [])
  // The tweakcn half is never policed for modes: tweakcn shares fonts, radius and shadows.
  assert.deepEqual(auditFixture({ 'src/styles/theme.css': cleanTheme.replace('--radius: 0.5rem;', '--radius: 0.5rem; --sidebar: #fcfcfc;') }).errors, [])
})

test('hard-to-read text pairs warn in light and dark but never fail', () => {
  // tweakcn's stock Supabase preset: dark label on pale mint, and a dim dark-mode body text.
  const theme = cleanTheme
    .replace('--primary: oklch(0.525 0.12 157.5); --primary-foreground: oklch(0.98 0 0);', '--primary: #72e3ad; --primary-foreground: #ffffff;')
    .replace('--foreground: oklch(0.95 0 0);', '--foreground: hsl(0 0% 25%);')
  const { errors, warnings } = auditFixture({ 'src/styles/theme.css': theme })
  assert.deepEqual(errors, [])
  assert.equal(warnings.length, 2, warnings.join('\n'))
  assert.match(warnings[0], /light: --primary-foreground on --primary is \d\.\d+:1/)
  assert.match(warnings[1], /dark: --foreground on --background is \d\.\d+:1/)
})

test('avatar initials on each avatar tone are contrast-checked in light and dark', () => {
  // A dark-mode tone left as a pale light value makes the light initials unreadable.
  const theme = cleanTheme
    .replace('--duration-standard: 200ms;', '--duration-standard: 200ms; --avatar-tone-slate: oklch(0.96 0.005 240);')
    .replace('--hairline: oklch(1 0 0 / .075);', '--hairline: oklch(1 0 0 / .075); --avatar-tone-slate: oklch(0.9 0.005 240);')
  const { errors, warnings } = auditFixture({ 'src/styles/theme.css': theme })
  assert.deepEqual(errors, [])
  assert.equal(warnings.length, 1, warnings.join('\n'))
  assert.match(warnings[0], /dark: --foreground on --avatar-tone-slate is \d\.\d+:1/)
})

test('the theme CLI exits cleanly with contrast warnings and fails on rule breaks', () => {
  const script = join(import.meta.dirname, 'token-contract.mjs')
  const run = overrides => {
    const root = themeFixture(overrides)
    try { return spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' }) } finally { rmSync(root, { recursive: true, force: true }) }
  }
  const warned = run({ 'src/styles/theme.css': cleanTheme.replace('--primary-foreground: oklch(0.98 0 0);', '--primary-foreground: oklch(0.6 0.1 157.5);') })
  assert.equal(warned.status, 0, warned.stderr)
  assert.match(warned.stdout + warned.stderr, /--primary-foreground on --primary/)
  const broken = run({ 'src/components/row.module.css': '.row { gap: 8px; }' })
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /gap: 8px/)
})

// #262: the JavaScript motion presets are the theme's motion scale written for Motion, so CSS and
// JavaScript animations agree. design:check compares them with theme.css and rejects any bounce.
const motionTheme = cleanTheme.replace('--duration-standard: 200ms;', '--duration-instant: 100ms; --duration-fast: 150ms; --duration-standard: 200ms; --duration-exit: var(--duration-fast); --ease-enter: cubic-bezier(.16, 1, .3, 1);')
const motionPresets = `export const motionTokens = {
  duration: { instant: 0.1, fast: 0.15, exit: 0.15, standard: 0.2 },
  ease: { enter: [0.16, 1, 0.3, 1] },
  spring: { snappy: { type: "spring", visualDuration: 0.15, bounce: 0 }, smooth: { type: "spring", visualDuration: 0.2, bounce: 0 } },
  stagger: { item: 0.035 },
} as const;
`
const motionFile = 'src/components/arc/motion-tokens.ts'
const motionErrors = presets => auditFixture({ 'src/styles/theme.css': motionTheme, [motionFile]: presets }).errors

test('the JavaScript motion presets on the theme scale pass', () => {
  assert.deepEqual(motionErrors(motionPresets), [])
})

test('a JavaScript duration or ease that differs from the theme fails', () => {
  for (const [from, to, name] of [
    ['fast: 0.15', 'fast: 0.16', 'duration.fast'],
    ['exit: 0.15', 'exit: 0.18', 'duration.exit'],
    ['enter: [0.16, 1, 0.3, 1]', 'enter: [0.16, 1, 0.3, 0.9]', 'ease.enter'],
  ]) {
    const errors = motionErrors(motionPresets.replace(from, to))
    assert.equal(errors.length, 1, errors.join('\n'))
    assert.ok(errors[0].startsWith(motionFile) && errors[0].includes(name), errors[0])
  }
})

test('a JavaScript duration the theme has no name for fails, so the long considered step stays out', () => {
  const errors = motionErrors(motionPresets.replace('standard: 0.2 }', 'standard: 0.2, considered: 0.48 }'))
  assert.equal(errors.length, 1, errors.join('\n'))
  assert.match(errors[0], /duration\.considered/)
})

test('every spring has bounce 0 and settles on a theme duration', () => {
  for (const [spring, words] of [
    ['{ type: "spring", visualDuration: 0.15, bounce: 0.12 }', /bounce/],
    ['{ type: "spring", visualDuration: 0.15 }', /bounce/],
    ['{ type: "spring", visualDuration: 0.42, bounce: 0 }', /visualDuration/],
    ['{ type: "spring", stiffness: 520, damping: 38 }', /stiffness/],
  ]) {
    const errors = motionErrors(motionPresets.replace('{ type: "spring", visualDuration: 0.15, bounce: 0 }', spring))
    assert.equal(errors.length, 1, `${spring}\n${errors.join('\n')}`)
    assert.ok(errors[0].includes('spring.snappy') && words.test(errors[0]), errors[0])
  }
})

test('a missing motion presets file is reported', () => {
  const errors = auditFixture({ [motionFile]: undefined }).errors
  assert.equal(errors.length, 1)
  assert.match(errors[0], /motion-tokens\.ts.*missing/)
})

test('motion timings and springs written outside the presets fail', () => {
  assert.equal(typeof tokenContract.auditMotionLiterals, 'function')
  for (const source of [
    'animate(x, 1, { duration: .14 })',
    'const t = { duration: reduced ? 0 : .22, ease }',
    'const t = { opacity: { duration: motionTokens.duration.fast, delay: .04 } }',
    'const t = { ...motionTokens.spring.smooth, visualDuration: .3 }',
    'const t = { type: "spring", bounce: 0.1 }',
    'const t = { type: "spring", stiffness: 300, damping: 30 }',
    'const v = { open: { transition: { delayChildren: .03 } } }',
  ]) assert.equal(tokenContract.auditMotionLiterals(source, 'src/components/shell/panel.tsx').length, 1, source)
  for (const source of [
    'animate(x, 1, { duration: motionTokens.duration.fast, delay: motionTokens.stagger.item })',
    'const t = reduced ? { duration: 0 } : motionTokens.spring.smooth',
    'const t = { type: "spring", visualDuration: motionTokens.duration.standard, bounce: 0 }',
    'const t = { delay: motionTokens.duration.instant * .75 }',
    // Lifetimes and interaction delays are not motion: a toast stays 10s, a tooltip waits 600ms.
    'toast({ title, duration: 10 })',
    'const tip = { delay: 600 }',
  ]) assert.deepEqual(tokenContract.auditMotionLiterals(source, 'src/components/shell/panel.tsx'), [], source)
  assert.deepEqual(tokenContract.auditMotionLiterals('const t = { duration: .14 }', motionFile), [])
})

test('the repo audit reads motion literals in .ts and .tsx files', () => {
  const errors = auditFixture({
    'src/components/shell/sidebar-motion.ts': 'export const fold = { duration: .22 }\n',
    'src/components/shell/sidebar-motion.test.ts': 'const fixture = { duration: .22 }\n',
  }).errors
  assert.equal(errors.length, 1, errors.join('\n'))
  assert.match(errors[0], /^src\/components\/shell\/sidebar-motion\.ts:1 .*duration/)
})

test('product code draws key caps only through the shared KeyCap', () => {
  assert.equal(typeof tokenContract.auditKeyCaps, 'function')
  assert.equal(tokenContract.auditKeyCaps('const hint = <p>Press <kbd className={styles.key}>C</kbd></p>', 'src/components/shell/hint.tsx').length, 1)
  assert.deepEqual(tokenContract.auditKeyCaps('const hint = <p>Press <KeyCap>C</KeyCap></p>', 'src/components/shell/hint.tsx'), [])
  assert.deepEqual(tokenContract.auditKeyCaps('const cap = <kbd className={styles.kbd}>C</kbd>', 'src/components/arc/shortcut-recorder/shortcut-recorder.tsx'), [])
  assert.deepEqual(tokenContract.auditKeyCaps('const cap = <kbd>C</kbd>', 'src/components/keyboard/key-caps.tsx'), [])
  const errors = auditFixture({ 'src/app/hint.tsx': 'export const Hint = () => <kbd>/</kbd>\n' }).errors
  assert.equal(errors.length, 1, errors.join('\n'))
  assert.match(errors[0], /^src\/app\/hint\.tsx:1 .*KeyCap/)
})

test('the repo check no longer exempts the retired Supabase-era token files', () => {
  assert.ok(auditCss(':root { --sb-foreground: oklch(0.1 0 0); }', 'src/styles/supabase-tokens.css').length)
  assert.ok(auditCss(':root { --overlay: color-mix(in oklab, var(--background) 80%, transparent); }', 'src/styles/lane-arc-theme.css').length)
  assert.deepEqual(auditCss(':root { --hairline: oklch(0 0 0 / .081); }', 'src/styles/theme.css'), [])
})

test('a missing theme file is reported, not thrown', () => {
  const { errors } = auditFixture({ 'src/styles/theme.css': undefined })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /src\/styles\/theme\.css.*missing/)
})
