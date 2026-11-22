const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])

/** Static markup as assistive tech reads it: every element marked
 * aria-hidden="true" is dropped with its subtree. */
export function withoutHidden(html: string) {
  let out = "", depth = 0, last = 0
  for (const tag of html.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b[^>]*>/g)) {
    const [text, closing, name] = tag
    const index = tag.index!
    if (depth === 0) out += html.slice(last, index)
    last = index + text.length
    const opens = !closing && !VOID.has(name.toLowerCase()) && !text.endsWith("/>")
    if (depth > 0) { if (opens) depth++; else if (closing) depth--; continue }
    if (!closing && /\baria-hidden="true"/.test(text)) { if (opens) depth = 1; continue }
    out += text
  }
  return depth === 0 ? out + html.slice(last) : out
}

/** The words in some markup, spaces collapsed. */
export const markupWords = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

/** Every button in the markup: its opening tag, the words on it, and its name as assistive tech reads it. */
export function buttonsIn(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].map(([, tag, inner]) => ({
    tag,
    text: markupWords(inner),
    name: /aria-label="([^"]*)"/.exec(tag)?.[1] ?? markupWords(withoutHidden(inner)),
    disabled: /\sdisabled=""/.test(tag),
    ariaDisabled: /aria-disabled="true"/.test(tag),
    submit: /type="submit"/.test(tag),
  }))
}

/** The accessible names of every role="status" element left in the markup. */
export function statusLabels(html: string) {
  return [...html.matchAll(/<[^>]*\brole="status"[^>]*>/g)].map(([tag]) => /aria-label="([^"]*)"/.exec(tag)?.[1] ?? "")
}
