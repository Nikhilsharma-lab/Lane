"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, savedViews } from "@/db";
import { refusal, requireActiveMember, type MemberAuth } from "@/lib/auth-guard";
import { canUseProject } from "@/lib/project-access";
import { parseSavedViewName, readSavedViewFilters, savedViewFilters, type SavedView, type SavedViewFilters } from "@/lib/saved-view-rules";

/**
 * #219: a person's own saved views of the Requests list. Saving one is personal state, like the profile label and
 * the first run, so every role may keep their own, Viewers and Guests included (requireActiveMember). The workspace
 * comes from the page; the owner only from the session. A view is found by id, workspace and owner together, so
 * nobody reaches anyone else's.
 */
export type SavedViewResult = { ok: true; view: SavedView } | { error: string };

const GONE = "That view isn't saved any more.";
const BAD_FILTERS = "Those filters can't be saved. Reload the page and try again.";
const PROJECT_UNAVAILABLE = "That Project isn't available. Choose another and try again.";
const duplicate = (name: string) => `You already have a view called “${name}”. Choose another name.`;
const selection = { id: savedViews.id, name: savedViews.name, filters: savedViews.filters };
const shaped = (row: { id: string; name: string; filters: unknown }): SavedView => ({ id: row.id, name: row.name, filters: readSavedViewFilters(row.filters) });
const isDuplicate = (error: unknown) => (error as { code?: string; cause?: { code?: string } })?.code === "23505" || (error as { cause?: { code?: string } })?.cause?.code === "23505";
const owned = (auth: MemberAuth, id: string) => and(eq(savedViews.id, id), eq(savedViews.orgId, auth.orgId), eq(savedViews.ownerId, auth.userId));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filters the list has, naming only a Project this person may see. */
async function allowedFilters(auth: MemberAuth, input: unknown): Promise<SavedViewFilters | { error: string }> {
  const filters = savedViewFilters((input ?? {}) as { status?: unknown; project?: unknown });
  if (!filters) return { error: BAD_FILTERS };
  if (filters.project !== "all" && filters.project !== "none" && !(await canUseProject(filters.project, auth))) return { error: PROJECT_UNAVAILABLE };
  return filters;
}

function changed() {
  // The navigation (the layout) and the list page both read the views.
  revalidatePath("/", "layout");
}

export async function saveView(data: { name: string; filters: { status: string; project: string } }, context: { orgId: string }): Promise<SavedViewResult> {
  const name = parseSavedViewName(data?.name);
  if ("error" in name) return name;
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("You can't save views in this workspace.") };
  const filters = await allowedFilters(auth, data?.filters);
  if ("error" in filters) return filters;
  try {
    const [row] = await db.insert(savedViews).values({ orgId: auth.orgId, ownerId: auth.userId, name: name.name, filters }).returning(selection);
    changed();
    return { ok: true, view: shaped(row) };
  } catch (error) {
    if (isDuplicate(error)) return { error: duplicate(name.name) };
    throw error;
  }
}

export async function renameSavedView(data: { id: string; name: string }, context: { orgId: string }): Promise<SavedViewResult> {
  const name = parseSavedViewName(data?.name);
  if ("error" in name) return name;
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("You can't change views in this workspace.") };
  if (typeof data.id !== "string" || !UUID.test(data.id)) return { error: GONE };
  try {
    const [row] = await db.update(savedViews).set({ name: name.name }).where(owned(auth, data.id)).returning(selection);
    if (!row) return { error: GONE };
    changed();
    return { ok: true, view: shaped(row) };
  } catch (error) {
    if (isDuplicate(error)) return { error: duplicate(name.name) };
    throw error;
  }
}

/** Saves the list's current filters into a view the person already has. */
export async function updateSavedView(data: { id: string; filters: { status: string; project: string } }, context: { orgId: string }): Promise<SavedViewResult> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("You can't change views in this workspace.") };
  if (typeof data?.id !== "string" || !UUID.test(data.id)) return { error: GONE };
  const filters = await allowedFilters(auth, data.filters);
  if ("error" in filters) return filters;
  const [row] = await db.update(savedViews).set({ filters }).where(owned(auth, data.id)).returning(selection);
  if (!row) return { error: GONE };
  changed();
  return { ok: true, view: shaped(row) };
}

export async function deleteSavedView(data: { id: string }, context: { orgId: string }): Promise<{ ok: true } | { error: string }> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("You can't change views in this workspace.") };
  if (typeof data?.id !== "string" || !UUID.test(data.id)) return { error: GONE };
  const [row] = await db.delete(savedViews).where(owned(auth, data.id)).returning({ id: savedViews.id });
  if (!row) return { error: GONE };
  changed();
  return { ok: true };
}
