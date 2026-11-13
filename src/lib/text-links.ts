/**
 * How plain text shows web addresses: as text and links. Quarter notes (#209) started it; #281 (B21) shares it with a
 * Request's description, comments and release evidence. Client-safe and dependency-free. Only http and https
 * addresses become links, so nothing else is ever run or loaded.
 */
export type TextSegment = { kind: "text"; text: string } | { kind: "link"; href: string };

const LINK = /https?:\/\/[^\s<>"]+/g;
/** Punctuation that ends a sentence rather than a link: "see https://example.test." links without the full stop. */
const TRAILING = /[.,;:!?)\]'"]+$/;

export function linkSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let from = 0;
  for (const match of text.matchAll(LINK)) {
    const href = match[0].replace(TRAILING, "");
    const start = match.index;
    if (start > from) segments.push({ kind: "text", text: text.slice(from, start) });
    segments.push({ kind: "link", href });
    from = start + href.length;
  }
  if (from < text.length) segments.push({ kind: "text", text: text.slice(from) });
  return segments;
}
