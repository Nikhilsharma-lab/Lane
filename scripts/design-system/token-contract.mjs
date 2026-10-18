import postcss from 'postcss'
import ts from 'typescript'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Source definitions are audited separately by provenance. Consumers have no blanket vendor exemption.
const sources = new Set(['src/styles/supabase-tokens.css', 'src/components/arc/foundation.css'])
const length = /(?<![\w-])-?(?:\d*\.)?\d+(?:px|rem|em|ms|s|pt)\b/gi
const paint = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\(|(?<![\w-])(?:black|white|red|blue|green|gray|grey)\b(?!-)/i

export function auditCss(css, file = 'component.css') {
  const errors = []
  postcss.parse(css, { from: file }).walkDecls(d => {
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
    const ownsControlTokens = file === 'src/styles/lane-arc-theme.css' || file.startsWith('src/components/arc/')
    if (sharedControlToken && (!ownsControlTokens || d.prop.startsWith('--sb-') && file !== 'src/styles/lane-arc-theme.css')) {
      errors.push(`${file}:${d.source.start.line} shared control override ${d.prop}: update the shared component or theme mapping`)
    }
    if ((!mechanicalClip && dimensions.length) || (!mask && paint.test(d.value) && !(file === "src/styles/lane-arc-theme.css" && d.prop.startsWith("--") && d.value.startsWith("color-mix(") && !/#[\da-f]|\b(?:rgb|oklch)\(/i.test(d.value))) || fixedType) {
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

export function auditTree(root) {
  const errors = []
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.css')) errors.push(...auditCss(readFileSync(path, 'utf8'), relative(root, path).replaceAll('\\', '/')))
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
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = auditTree(resolve(import.meta.dirname, '../..'))
  if (errors.length) { console.error(`Fixed visual values (${errors.length}):\n${errors.join('\n')}`); process.exitCode = 1 }
  else console.log('Token contract passed: application CSS, inline styles, icons and search controls use shared sources.')
}
