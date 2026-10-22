import postcss from 'postcss'
import ts from 'typescript'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Source definitions are audited separately by provenance. Consumers have no blanket vendor exemption.
// A policy names where values may be written and which file owns shared control tokens. The one theme
// file (#87) is the only place values live; Arc's foundation is locked by arc-source-check and loads in
// a lower cascade layer; the bridge is policed by auditBridge instead, so a value there is reported once.
export const themeFiles = {
  theme: 'src/styles/theme.css',
  bridge: 'src/styles/theme-bridge.css',
  foundation: 'src/components/arc/foundation.css',
}
const themePolicy = (files = themeFiles) => ({ sources: new Set([files.theme, files.foundation, files.bridge]), controlOwner: files.bridge, ownerMayMix: false })
const length = /(?<![\w-])-?(?:\d*\.)?\d+(?:px|rem|em|ms|s|pt)\b/gi
const paint = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\(|(?<![\w-])(?:black|white|red|blue|green|gray|grey)\b(?!-)/i

export function auditCss(css, file = 'component.css', policy = themePolicy()) {
  const { sources, controlOwner, ownerMayMix } = policy
  const errors = []
  const tree = postcss.parse(css, { from: file })
  // Light and dark differences live in the theme file as tokens with both values; a dark
  // selector anywhere else is a second, hidden place a mode's look is decided.
  if (!sources.has(file)) tree.walk(node => {
    const darkRule = node.type === 'rule' && /\.dark(?![\w-])|data-theme=["']?dark/.test(node.selector)
    const darkMedia = node.type === 'atrule' && node.name === 'media' && /prefers-color-scheme:\s*dark/.test(node.params)
    if (darkRule || darkMedia) errors.push(`${file}:${node.source.start.line} ${darkRule ? node.selector : `@media ${node.params}`} is a dark-mode selector: put the light and dark values in a Lane additions token`)
  })
  tree.walkDecls(d => {
    if (sources.has(file)) return
    const selector = d.parent.selector ?? ''
    const accessibility = /(?:srOnly|sr-only|visually-hidden)/i.test(selector)
    const mechanicalClip = accessibility && /^(?:width|height|margin)$/.test(d.prop) && /^-?1px$/.test(d.value)
    const mask = /mask/.test(d.prop)
    const dimensions = [...d.value.matchAll(length)].filter(m => Number.parseFloat(m[0]) !== 0)
    const fixedType = /^(?:font-weight|line-height|letter-spacing)$/.test(d.prop) && /^-?[.\d]+$/.test(d.value) && !['0', '1'].includes(d.value)
    // Component geometry/materials belong to their shared implementation. Semantic
    // Badge tone and row-density composition remain legitimate context decisions.
    const sharedControlToken = /^--(?:sb-|button-|input-|segment-|badge-(?:height|padding-|gap$|font-weight|sm-(?:height|padding|font|gap|icon-padding)|icon-padding))/.test(d.prop)
    const ownsControlTokens = file === controlOwner || file.startsWith('src/components/arc/')
    if (sharedControlToken && (!ownsControlTokens || d.prop.startsWith('--sb-') && file !== controlOwner)) {
      errors.push(`${file}:${d.source.start.line} shared control override ${d.prop}: update the shared component or theme mapping`)
    }
    // The Supabase-era token files are retired: nothing may read their names again.
    if (/var\(\s*--sb-/.test(d.value)) errors.push(`${file}:${d.source.start.line} ${d.prop} reads a retired --sb-* token: use the theme file's name`)
    if ((!mechanicalClip && dimensions.length) || (!mask && paint.test(d.value) && !(ownerMayMix && file === controlOwner && d.prop.startsWith("--") && d.value.startsWith("color-mix(") && !/#[\da-f]|\b(?:rgb|oklch)\(/i.test(d.value))) || fixedType) {
      errors.push(`${file}:${d.source.start.line} ${d.prop}: ${d.value}`)
    }
  })
  return errors
}

// A search shell owns padding, focus and clear-button behavior in one place.
// Recreating it with token-valued CSS still bypasses that shared component.
export function auditSharedControls(source, file = 'component.tsx') {
  if (file === 'src/components/arc/search-field/search-field.tsx') return []
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const errors = []
  const literal = attribute => {
    const value = attribute.initializer
    if (!value) return undefined
    if (ts.isStringLiteral(value)) return value.text
    if (ts.isJsxExpression(value) && value.expression && ts.isStringLiteral(value.expression)) return value.expression.text
    return undefined
  }
  function visit(node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(tree) === 'input') {
      const search = node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
        && (attribute.name.getText(tree) === 'type' && literal(attribute) === 'search'
          || attribute.name.getText(tree) === 'role' && literal(attribute) === 'searchbox'))
      if (search) errors.push(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1} search input must use Arc SearchField`)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return errors
}

// Static JSX style values are also consumers. Measured geometry and MotionValues remain dynamic.
export function auditInlineStyles(source, file = 'component.tsx') {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const errors = []
  function visit(node, inStyle = false) {
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'style') inStyle = true
    if (inStyle && ts.isPropertyAssignment(node)) {
      const prop = node.name.getText(tree).replace(/['"]/g, '').replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
      const value = node.initializer
      const numeric = ts.isNumericLiteral(value) && /^(?:padding|margin|gap|width|height|min-|max-|top|left|right|bottom|border|font-size)/.test(prop) && Number(value.text) !== 0
      const literal = ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
      const numericType = ts.isNumericLiteral(value) && auditCss(`.inline { ${prop}: ${value.text} }`).length
      if (numeric || numericType || (literal && auditCss(`.inline { ${prop}: ${value.text} }`).length)) {
        errors.push(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1} inline ${prop}: ${value.getText(tree)}`)
      }
    }
    ts.forEachChild(node, child => visit(child, inStyle))
  }
  visit(tree)
  return errors
}

// Audit icon consumers, not SVG drawing coordinates. CSS supplies Lucide defaults and
// data-ui-icon sizing; named roles select a shared token instead of a one-off size.
export function auditIcons(source, file = 'component.tsx') {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const errors = []
  const icons = new Set()
  const namespaces = new Set()
  const iconTypes = new Set()
  const propTypes = new Map()
  const declarations = []
  const roles = new Set(['xs', 'sm', 'md', 'lg', 'xl', '2xl'])
  const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)) }
  const strings = node => {
    const values = []
    if (node) walk(node, child => { if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) values.push(child.text) })
    return values
  }
  for (const node of tree.statements) {
    if (!ts.isImportDeclaration(node) || node.moduleSpecifier.text !== 'lucide-react') continue
    const bindings = node.importClause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
    if (bindings && ts.isNamedImports(bindings)) for (const specifier of bindings.elements) {
      const original = (specifier.propertyName ?? specifier.name).text
      if (original === 'LucideIcon') iconTypes.add(specifier.name.text)
      else if (!specifier.isTypeOnly && !node.importClause.isTypeOnly && original !== 'createLucideIcon') icons.add(specifier.name.text)
    }
  }
  for (const node of tree.statements) {
    if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) propTypes.set(node.name.text, node.type.members)
    if (ts.isInterfaceDeclaration(node)) propTypes.set(node.name.text, node.members)
  }
  const isIconType = node => node && (ts.isTypeReferenceNode(node) && iconTypes.has(node.typeName.getText(tree)) || ts.isUnionTypeNode(node) && node.types.some(isIconType))
  const membersOf = node => node && (ts.isTypeLiteralNode(node) ? node.members : ts.isTypeReferenceNode(node) ? propTypes.get(node.typeName.getText(tree)) : undefined)
  walk(tree, node => {
    if (ts.isVariableDeclaration(node)) declarations.push(node)
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && isIconType(node.type) && ts.isIdentifier(node.name)) icons.add(node.name.text)
    if (ts.isParameter(node) && ts.isObjectBindingPattern(node.name)) {
      for (const member of membersOf(node.type) ?? []) {
        if (!ts.isPropertySignature(member) || !isIconType(member.type)) continue
        const binding = node.name.elements.find(element => (element.propertyName ?? element.name).getText(tree) === member.name.getText(tree))
        if (binding && ts.isIdentifier(binding.name)) icons.add(binding.name.text)
      }
    }
  })
  // Follow local aliases and maps (const Icon = icons[state]) without requiring a
  // project-wide typecheck. `.icon` JSX members are the app's dynamic icon slots.
  const referencesIcon = node => {
    if (ts.isIdentifier(node)) return icons.has(node.text)
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return referencesIcon(node.expression)
    if (ts.isConditionalExpression(node)) return referencesIcon(node.whenTrue) || referencesIcon(node.whenFalse)
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) return referencesIcon(node.expression)
    if (ts.isArrayLiteralExpression(node)) return node.elements.some(referencesIcon)
    if (ts.isObjectLiteralExpression(node)) return node.properties.some(property => ts.isPropertyAssignment(property) && referencesIcon(property.initializer) || ts.isShorthandPropertyAssignment(property) && icons.has(property.name.text))
    return false
  }
  let changed = true
  while (changed) {
    changed = false
    for (const declaration of declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer || icons.has(declaration.name.text)) continue
      if (referencesIcon(declaration.initializer)) { icons.add(declaration.name.text); changed = true }
    }
  }
  const fixedDimension = value => {
    if (!value) return false
    if (ts.isJsxExpression(value)) return fixedDimension(value.expression)
    if (ts.isNumericLiteral(value)) return true
    if (ts.isPrefixUnaryExpression(value)) return fixedDimension(value.operand)
    return (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && /^-?(?:\d*\.)?\d+(?:px|rem|em|pt|vh|vw)?$/.test(value.text.trim())
  }
  const fixedClass = /(?:^|:)!?(?:size|w|h|min-w|min-h|max-w|max-h)-(?:\d+(?:\.\d+)?|px|\[-?(?:\d*\.)?\d+(?:px|rem|em|pt|vh|vw)?\])!?$/
  walk(tree, node => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return
    const tag = node.tagName.getText(tree)
    const attributes = node.attributes.properties.filter(ts.isJsxAttribute)
    const marked = attributes.some(attribute => attribute.name.getText(tree) === 'data-ui-icon')
    if (!(tag === 'svg' || tag === 'motion.svg' || marked || icons.has(tag) || namespaces.has(tag.split('.')[0]) || /\.icon$/.test(tag))) return
    for (const attribute of attributes) {
      const name = attribute.name.getText(tree)
      const fixedProp = /^(?:size|width|height)$/.test(name) && fixedDimension(attribute.initializer)
      const fixedClasses = name === 'className' && strings(attribute.initializer).some(value => value.split(/\s+/).some(className => fixedClass.test(className)))
      const invalidRole = name === 'data-icon-size' && strings(attribute.initializer).some(value => !roles.has(value))
      if (fixedProp || fixedClasses || invalidRole) {
        const line = tree.getLineAndCharacterOfPosition(attribute.getStart(tree)).line + 1
        errors.push(`${file}:${line} icon ${tag} ${attribute.getText(tree)}: use shared icon tokens or a supported data-icon-size role`)
      }
    }
  })
  return errors
}

export function auditTree(root, policy = themePolicy()) {
  const errors = []
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.css')) errors.push(...auditCss(readFileSync(path, 'utf8'), relative(root, path).replaceAll('\\', '/'), policy))
      else if (entry.name.endsWith('.tsx') && !/\.(?:test|spec|stories)\./.test(entry.name)) {
        const source = readFileSync(path, 'utf8')
        const file = relative(root, path).replaceAll('\\', '/')
        errors.push(...auditInlineStyles(source, file), ...auditIcons(source, file), ...auditSharedControls(source, file))
      }
    }
  }
  for (const folder of ['src/app', 'src/components', 'src/styles']) walk(join(root, folder))
  return errors
}

// The one-theme-file contract (#87, #90). Paths are parameters so fixtures can point the
// same rules at their own files.

// Known places the one-theme-file rule does not reach, recorded so the check is honest.
export const themeExemptions = [
  { file: 'src/components/arc/motion-tokens.ts', reason: "Arc's JavaScript motion values (durations, eases, springs) drive Motion and stay pristine Arc; lining them up with the theme's CSS motion is Stage B" },
  { arcSlot: '--icon-size', reason: "Arc's per-slot icon variable: each slot points it at a theme icon size; it has no value of its own" },
]

// Everything after this comment is Lane's half; everything before it is the tweakcn paste.
export const laneAdditionsMarker = 'Lane additions'

// Splits the theme file at the marker. Returns null when the marker is gone, so a careless
// re-paste that wipes Lane's half is caught.
function splitTheme(css, file) {
  const tree = postcss.parse(css, { from: file })
  const marker = tree.nodes.findIndex(node => node.type === 'comment' && node.text.startsWith(laneAdditionsMarker))
  if (marker === -1) return null
  return { tree, tweakcn: tree.nodes.slice(0, marker), additions: tree.nodes.slice(marker + 1) }
}

const darkScope = /\.dark\b|\[data-theme=["']?dark/
const colourLiteral = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|(?<![\w-])(?:black|white)\b(?!-)/i

// A literal colour in Lane additions is assumed to change between light and dark, so it
// needs both values even when they match; otherwise dark mode silently falls back to light.
// Expressions over tweakcn slots (var(), color-mix of a slot) inherit their mode from the slot.
export function auditThemeFile(css, file = themeFiles.theme) {
  const theme = splitTheme(css, file)
  if (!theme) return [`${file} has no /* ${laneAdditionsMarker} */ marker: restore Lane's half below the tweakcn paste`]
  const errors = []
  // A re-paste replaces the tweakcn half wholesale; an addition sharing one of its names
  // (its @theme inline keys included) would silently fight it.
  const tweakcnNames = new Set()
  for (const node of theme.tweakcn) node.walkDecls?.(d => { if (d.prop.startsWith('--')) tweakcnNames.add(d.prop) })
  for (const node of theme.additions) node.walkDecls?.(d => {
    if (tweakcnNames.has(d.prop)) errors.push(`${file}:${d.source.start.line} ${d.prop} is a name tweakcn exports: give the Lane addition its own name and point consumers at it in the bridge`)
  })
  const light = new Map()
  const dark = new Map()
  for (const node of theme.additions) node.walkDecls?.(d => {
    if (!d.prop.startsWith('--') || insideTheme(d)) return
    const scope = d.parent.type === 'rule' && darkScope.test(d.parent.selector) ? dark : light
    if (!scope.has(d.prop)) scope.set(d.prop, d)
  })
  for (const [name, d] of light) if (!dark.has(name) && colourLiteral.test(d.value)) {
    errors.push(`${file}:${d.source.start.line} ${name} has a light colour but no dark value: add it to the Lane additions .dark block`)
  }
  for (const [name, d] of dark) if (!light.has(name)) {
    errors.push(`${file}:${d.source.start.line} ${name} has a dark value but no light value: add it to the Lane additions :root block`)
  }
  return errors
}

// Custom properties that reach the page. Tailwind's `@theme inline` keys only shape utility
// classes and emit no property, so they do not count as defined.
const insideTheme = node => { for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'theme') return true; return false }
const declaredNames = tree => {
  const names = new Set()
  tree.walkDecls(d => { if (d.prop.startsWith('--') && !insideTheme(d)) names.add(d.prop) })
  return names
}
const modeScope = /\.dark\b|data-theme|prefers-color-scheme/

// The bridge is plumbing: `--hook: var(--name);` and nothing else, so values live in one
// file and the path from theme to screen is one hop. Anything that changes between light
// and dark belongs in Lane additions, never in a bridge selector.
export function auditBridge(css, themeCss, file = themeFiles.bridge) {
  const errors = []
  const defined = themeCss === null ? null : declaredNames(postcss.parse(themeCss))
  const modeRules = new Set()
  const tree = postcss.parse(css, { from: file })
  tree.walkRules(rule => {
    const atRule = rule.parent?.type === 'atrule' ? `${rule.parent.name} ${rule.parent.params}` : ''
    if (modeScope.test(rule.selector) || modeScope.test(atRule)) {
      modeRules.add(rule)
      errors.push(`${file}:${rule.source.start.line} ${rule.selector} is a mode-specific selector: put light and dark values in Lane additions`)
    }
  })
  tree.walkDecls(d => {
    if (modeRules.has(d.parent)) return
    const rename = d.value.trim().match(/^var\((--[a-z0-9-]+)\)$/i)
    if (!rename) errors.push(`${file}:${d.source.start.line} ${d.prop}: ${d.value} is a value, not a rename: move it to the theme file`)
    else if (defined && !defined.has(rename[1])) errors.push(`${file}:${d.source.start.line} ${d.prop} reads ${rename[1]}, which the theme file does not define`)
  })
  return errors
}

// Arc's own values sit in a lower cascade layer; they can only paint where Lane leaves an
// Arc name undefined. Every name Arc declares must therefore be defined by the theme or bridge.
export function auditArcCoverage(foundationCss, themeCss, bridgeCss, file = themeFiles.foundation) {
  const defined = new Set([...declaredNames(postcss.parse(themeCss ?? '')), ...declaredNames(postcss.parse(bridgeCss ?? ''))])
  const slots = new Set(themeExemptions.filter(exemption => exemption.arcSlot).map(exemption => exemption.arcSlot))
  const reported = new Set()
  const errors = []
  postcss.parse(foundationCss, { from: file }).walkDecls(d => {
    if (!d.prop.startsWith('--') || defined.has(d.prop) || slots.has(d.prop) || reported.has(d.prop)) return
    reported.add(d.prop)
    errors.push(`${file}:${d.source.start.line} ${d.prop} is not defined by the theme file or bridge, so Arc's default can paint`)
  })
  return errors
}

// Text-on-surface pairs tweakcn exports, plus avatar initials (--foreground) on Lane's avatar
// tones. Nikhil may keep a pair below AA on purpose, so these are warnings for him, never failures.
export const contrastPairs = [
  ['foreground', 'background'], ['card-foreground', 'card'], ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'], ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'background'], ['muted-foreground', 'muted'], ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'], ['sidebar-foreground', 'sidebar'],
  ['sidebar-primary-foreground', 'sidebar-primary'], ['sidebar-accent-foreground', 'sidebar-accent'],
  ...['blue', 'green', 'violet', 'amber', 'coral', 'slate'].map(tone => ['foreground', `avatar-tone-${tone}`]),
]
export const minimumContrast = 4.5

const channel = value => value.trim() === 'none' ? 0 : value.trim().endsWith('%') ? Number.parseFloat(value) / 100 : Number.parseFloat(value)
const toLinear = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const oklabToLinear = (l, a, b) => {
  const [l_, m_, s_] = [l + 0.3963377774 * a + 0.2158037573 * b, l - 0.1055613458 * a - 0.0638541728 * b, l - 0.0894841775 * a - 1.291485548 * b].map(v => v ** 3)
  return [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_]
}
const hslToSrgb = (h, s, l) => [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)) })

// Linear-light sRGB of an opaque colour literal, or null for anything else (see-through,
// color-mix, unknown syntax): those pairs are skipped rather than guessed.
function linearRgb(value) {
  const text = value.trim().toLowerCase()
  const hex = text.match(/^#([\da-f]{3,8})$/)
  if (hex) {
    let digits = hex[1]
    if (digits.length <= 4) digits = [...digits].map(d => d + d).join('')
    if (digits.length === 8 && digits.slice(6) !== 'ff') return null
    return [0, 2, 4].map(i => toLinear(Number.parseInt(digits.slice(i, i + 2), 16) / 255))
  }
  if (text === 'white') return [1, 1, 1]
  if (text === 'black') return [0, 0, 0]
  const fn = text.match(/^(rgba?|hsla?|oklch|oklab)\((.*)\)$/)
  if (!fn) return null
  const [colour, alpha] = fn[2].split('/')
  if (alpha !== undefined && channel(alpha) < 1) return null
  const parts = colour.trim().split(/[\s,]+/)
  if (parts.length !== 3) return null
  if (fn[1].startsWith('rgb')) return parts.map(part => toLinear(part.endsWith('%') ? channel(part) : Number.parseFloat(part) / 255))
  if (fn[1].startsWith('hsl')) return hslToSrgb(Number.parseFloat(parts[0]), channel(parts[1]), channel(parts[2])).map(toLinear)
  const lightness = channel(parts[0])
  if (fn[1] === 'oklab') return oklabToLinear(lightness, channel(parts[1]), channel(parts[2]))
  const chroma = channel(parts[1])
  const hue = channel(parts[2]) * Math.PI / 180
  return oklabToLinear(lightness, chroma * Math.cos(hue), chroma * Math.sin(hue))
}
const luminance = rgb => { const [r, g, b] = rgb.map(c => Math.min(1, Math.max(0, c))); return 0.2126 * r + 0.7152 * g + 0.0722 * b }

// Reads tweakcn's light and dark slots the way the browser would: dark falls back to light,
// and var() references are followed within the same mode.
export function contrastReport(themeCss, file = themeFiles.theme) {
  const light = new Map()
  const dark = new Map()
  postcss.parse(themeCss, { from: file }).walkDecls(d => {
    if (!d.prop.startsWith('--') || insideTheme(d) || d.parent.type !== 'rule') return
    if (darkScope.test(d.parent.selector)) dark.set(d.prop, d.value)
    else if (d.parent.selector === ':root') light.set(d.prop, d.value)
  })
  const resolve = (mode, name, seen = new Set()) => {
    if (seen.has(name)) return null
    seen.add(name)
    const value = (mode === 'dark' ? dark.get(name) : undefined) ?? light.get(name)
    if (value === undefined) return null
    const ref = value.trim().match(/^var\((--[\w-]+)\)$/)
    return ref ? resolve(mode, ref[1], seen) : linearRgb(value)
  }
  const warnings = []
  for (const mode of ['light', 'dark']) for (const [text, surface] of contrastPairs) {
    const ink = resolve(mode, `--${text}`)
    const paper = resolve(mode, `--${surface}`)
    if (!ink || !paper) continue
    const [high, low] = [luminance(ink), luminance(paper)].sort((x, y) => y - x)
    const ratio = (high + 0.05) / (low + 0.05)
    if (ratio < minimumContrast) warnings.push(`${file} ${mode}: --${text} on --${surface} is ${ratio.toFixed(2)}:1, below ${minimumContrast}:1`)
  }
  return warnings
}

export function auditThemeContract(root, files = themeFiles) {
  // Arc's foundation stays byte-identical and is locked by arc-source-check; it loads in a
  // lower cascade layer, and the coverage rule proves none of its values can paint.
  const errors = auditTree(root, themePolicy(files))
  const read = file => existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null
  const theme = read(files.theme)
  if (theme === null) errors.push(`${files.theme} is missing: it is the only place visual values may be written`)
  else errors.push(...auditThemeFile(theme, files.theme))
  const bridge = read(files.bridge)
  if (bridge === null) errors.push(`${files.bridge} is missing: Arc and Lane names need their renames onto the theme file`)
  else errors.push(...auditBridge(bridge, theme, files.bridge))
  const foundation = read(files.foundation)
  if (foundation === null) errors.push(`${files.foundation} is missing: the Arc coverage rule needs Arc's foundation`)
  else if (theme !== null) errors.push(...auditArcCoverage(foundation, theme, bridge, files.foundation))
  for (const exemption of themeExemptions) if (exemption.file && !existsSync(join(root, exemption.file))) {
    errors.push(`${exemption.file} no longer exists: remove its recorded exemption from token-contract.mjs`)
  }
  const warnings = theme === null ? [] : contrastReport(theme, files.theme)
  return { errors, warnings, exemptions: themeExemptions }
}

// Runs the one-theme-file contract on the repo (or `--root <dir>`). `--theme` is accepted for
// compatibility with the #90 entry point; it is the only check now.
function runThemeCheck(argv) {
  const rootFlag = argv.indexOf('--root')
  const root = rootFlag === -1 ? resolve(import.meta.dirname, '../..') : resolve(argv[rootFlag + 1])
  const { errors, warnings, exemptions } = auditThemeContract(root)
  if (warnings.length) console.warn(`Contrast warnings (${warnings.length}, not failures):\n${warnings.join('\n')}`)
  console.log(`Recorded exemptions:\n${exemptions.map(exemption => `${exemption.file ?? exemption.arcSlot}: ${exemption.reason}`).join('\n')}`)
  if (errors.length) { console.error(`Theme contract failed (${errors.length}):\n${errors.join('\n')}`); process.exitCode = 1 }
  else console.log('Theme contract passed: visual values live only in the theme file; CSS, inline styles, icons and search controls use shared sources.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runThemeCheck(process.argv)
