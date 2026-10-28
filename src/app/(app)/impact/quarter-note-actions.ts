"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, profiles, quarterNotes } from "@/db";
import { guardOwnerOrAdmin } from "@/lib/auth-guard";
import { quarterStarted } from "@/lib/impact-period";
import { QUARTER_NOTE_MAX_LENGTH } from "@/lib/quarter-note-rules";
import { FORMER_MEMBER } from "@/lib/request-journey";

/** One save of a quarter's note. Blank text clears it. `expectedEditedAt` is the edit time the Admin started from (null: no note yet). */
const quarterNoteInputSchema = z.object({
  year: z.number().int().min(2000).max(2999),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string().trim().max(QUARTER_NOTE_MAX_LENGTH),
  expectedEditedAt: z.iso.datetime().nullable(),
}).strict();

type SavedNote = { text: string; editorName: string; editedAt: string };
type Result = { success: true; note: SavedNote | null } | { error: string; sessionExpired?: true };

const STALE = "Someone else changed this Quarter note. Reload to see it before editing.";

class Stale extends Error {}

/**
 * Write, edit or clear a quarter's note (#209). Admins only, at any time once the quarter has begun. The workspace
 * comes from the page; the editor comes from the session. An edit made over someone else's newer one is refused, so
 * nobody's words are overwritten unseen.
 */
export async function saveQuarterNote(data: unknown, context: { orgId: string }): Promise<Result> {
  const parsed = quarterNoteInputSchema.safeParse(data);
  if (!parsed.success) return { error: "Check the Quarter note. It can be up to 4,000 characters." };
  const auth = await guardOwnerOrAdmin(context.orgId, "Only Admins can write the Quarter note.");
  if ("error" in auth) return auth;
  const { year, quarter, text, expectedEditedAt } = parsed.data;
  const now = new Date();
  if (!quarterStarted(year, quarter, now)) return { error: "A Quarter note can be written once its quarter begins." };

  const where = and(eq(quarterNotes.orgId, auth.orgId), eq(quarterNotes.year, year), eq(quarterNotes.quarter, quarter));
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx.select({ editedAt: quarterNotes.editedAt }).from(quarterNotes).where(where).for("update");
      if ((current?.editedAt.toISOString() ?? null) !== expectedEditedAt) throw new Stale();
      if (!text) {
        if (current) await tx.delete(quarterNotes).where(where);
        return;
      }
      if (current) {
        await tx.update(quarterNotes).set({ body: text, editedBy: auth.userId, editedAt: now }).where(where);
        return;
      }
      // Two Admins writing a first note at once: the second finds the first's row and is refused as stale.
      const inserted = await tx.insert(quarterNotes).values({ orgId: auth.orgId, year, quarter, body: text, editedBy: auth.userId, editedAt: now }).onConflictDoNothing().returning({ year: quarterNotes.year });
      if (inserted.length === 0) throw new Stale();
    });
  } catch (error) {
    if (error instanceof Stale) return { error: STALE };
    return { error: "Could not save the Quarter note. Your text is kept; try again." };
  }

  revalidatePath("/impact");
  if (!text) return { success: true, note: null };
  const [editor] = await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, auth.userId));
  return { success: true, note: { text, editorName: editor?.fullName || FORMER_MEMBER, editedAt: now.toISOString() } };
}
