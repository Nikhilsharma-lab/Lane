/**
 * The Quarter note's rules (#209), client-safe and dependency-free (the report ships it): how long a note may be, and
 * how its plain text shows links. The action checks the rest (quarter-note-actions.ts); the database refuses the same
 * limits (migration 0043).
 */
export const QUARTER_NOTE_MAX_LENGTH = 4000;

export type NoteSegment = { kind: "text"; text: string } | { kind: "link"; href: string };

const LINK = /https?:\/\/[^\s<>"]+/g;
/** Punctuation that ends a sentence rather than a link: "see https://example.test." links without the full stop. */
const TRAILING = /[.,;:!?)\]'"]+$/;

/** A note's plain text as text and links: only http and https addresses become links, so nothing else is ever run or loaded. */
export function noteSegments(text: string): NoteSegment[] {
  const segments: NoteSegment[] = [];
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
