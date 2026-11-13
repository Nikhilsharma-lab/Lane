/**
 * The Quarter note's rules (#209), client-safe and dependency-free (the report ships it): how long a note may be. Its
 * plain text shows links through text-links.ts. The action checks the rest (quarter-note-actions.ts); the database refuses the same
 * limits (migration 0043).
 */
export const QUARTER_NOTE_MAX_LENGTH = 4000;
