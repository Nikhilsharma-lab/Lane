import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  for (const token of ['--sb-spacing', '--button-padding-sm', '--input-background', '--badge-gap', '--segment-radius']) {
    const css = `.page { ${token}: var(--space-1) }`
    assert.equal(auditCss(css, 'src/components/shell/page.module.css').length, 1, token)
    assert.deepEqual(auditCss(css, 'src/styles/lane-arc-theme.css'), [])
    assert.equal(auditCss(css, 'src/components/arc/button/button.module.css').length, token.startsWith('--sb-') ? 1 : 0)
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
  assert.deepEqual(auditCss('.x { color: var(--sb-color-red-900); background: var(--project-blue); }'), [])
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
