import { z } from "zod";

/**
 * The Quarter note's rules (#209), client-safe: what an Admin may save, and how its plain text shows links. The
 * database refuses the same limits (migration 0043).
 */
export const QUARTER_NOTE_MAX_LENGTH = 4000;

/** One save of a quarter's note. Blank text clears it. `expectedEditedAt` is the edit time the Admin started from (null: no note yet). */
export const quarterNoteInputSchema = z.object({
  year: z.number().int().min(2000).max(2999),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string().trim().max(QUARTER_NOTE_MAX_LENGTH),
  expectedEditedAt: z.iso.datetime().nullable(),
}).strict();
export type QuarterNoteInput = z.infer<typeof quarterNoteInputSchema>;

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
