import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

/**
 * #264 (polish bar §11): the copy check. It reads the words people see in Lane and fails on the ones the wording
 * rules rule out, so they can't drift back. It runs with the unit tests (`src/test/copy-check.test.ts`).
 *
 * What counts as user-facing: every string and JSX text in Lane's source (rendered UI, toasts, server-action
 * refusals, thrown messages the UI shows, emails, page metadata) plus the web manifest and the share-image alt text.
 * What doesn't: comments, `console.*` lines, import paths, tests, the database folder (schema and migrations),
 * the test helpers, and the AI prompt in `src/lib/ai` (Lane's instructions to the model, never shown).
 */

export type CopyProblem = { file: string; line: number; text: string; rule: string }

const RULES: { pattern: RegExp; rule: string }[] = [
  { pattern: /could not/i, rule: "Write \"Couldn't\", not \"Could not\"" },
  { pattern: /\u2014/, rule: "No em dashes" },
  { pattern: /\(UTC\)/, rule: "No \"(UTC)\"" },
  { pattern: /\bexposure\b/i, rule: "No \"exposure\"" },
  { pattern: /\bUndo Done\b/, rule: "No \"Undo Done\"" },
]

const ROOT = path.resolve(__dirname, "../..")
const NOT_SHOWN = ["src/test/", "src/db/", "src/lib/ai/"]
const PLAIN_TEXT = ["src/app/manifest.webmanifest", "src/app/opengraph-image.alt.txt"]

const problemsIn = (file: string, line: number, text: string) =>
  RULES.filter(({ pattern }) => pattern.test(text)).map(({ rule }) => ({ file, line, text: text.trim(), rule }))

const isConsoleCall = (node: ts.Node) =>
  ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
  && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "console"

const isModulePath = (node: ts.Node) =>
  ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExternalModuleReference(node)
  || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
  || ts.isImportTypeNode(node)

/** The copy problems in one TypeScript or TSX source: its strings, template text and JSX text, outside logs and imports. */
export function copyProblems(file: string, source: string): CopyProblem[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const problems: CopyProblem[] = []
  const lineOf = (node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  const visit = (node: ts.Node) => {
    if (isConsoleCall(node) || isModulePath(node)) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      problems.push(...problemsIn(file, lineOf(node), node.text))
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return problems
}

const sourceFiles = (dir: string): string[] => readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
  const relative = `${dir}/${entry.name}`
  if (entry.isDirectory()) return NOT_SHOWN.includes(`${relative}/`) ? [] : sourceFiles(relative)
  return /\.tsx?$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name) ? [relative] : []
})

/** Every copy problem in Lane's user-facing source and text files. */
export function laneCopyProblems(): CopyProblem[] {
  const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8")
  return [
    ...sourceFiles("src").flatMap(file => copyProblems(file, read(file))),
    ...PLAIN_TEXT.flatMap(file => read(file).split("\n").flatMap((text, index) => problemsIn(file, index + 1, text))),
  ]
}
