import "server-only";
import { inArray } from "drizzle-orm";
import { db, profiles } from "@/db";
import type { MemberAuth } from "./auth-guard";
import type { WorkspacePerson } from "./workspace-roster";
import { RequestChangeError, type RequestTx } from "./request-change-store";
import { FORMER_MEMBER, journeyActions, requesterOf, type ActionAvailability, type JourneyActions, type JourneyFacts, type JourneyViewer } from "./request-journey";
import type { ReleaseState } from "./request-release";

/** This person's live roster entry as an active non-guest member, or undefined. */
export const rosterMember = (roster: readonly WorkspacePerson[] | null, id: string) =>
  roster?.find((p) => p.nominee.kind === "member" && p.nominee.userId === id)

/**
 * The journey viewer for a signed-in caller, from the session and the live roster. Admin needs both the
 * session and the roster to say so. `roster` is null when it couldn't be read: the viewer is then inactive,
 * so every action is refused rather than guessed.
 */
export function journeyViewer(auth: MemberAuth, roster: readonly WorkspacePerson[] | null): JourneyViewer {
  if (auth.role === "guest" || auth.role === "viewer") return { id: auth.userId, role: auth.role, active: false }
  const entry = rosterMember(roster, auth.userId)
  return { id: auth.userId, role: auth.role === "admin" && entry?.role === "org:admin" ? "admin" : "member", active: Boolean(entry) }
}

/**
 * What this caller may do on this Request now, with reasons. The one call both the server actions (to refuse)
 * and the reads (to show) make, so they always agree. `requesterName` names the Requester in reasons.
 */
export function journeyActionsFor(
  request: JourneyFacts & { createdBy: string; takenOnBy: string | null; releaseState: ReleaseState | null },
  auth: MemberAuth,
  roster: readonly WorkspacePerson[] | null,
  requesterName: string,
  now: Date,
): JourneyActions {
  const requesterActive = Boolean(rosterMember(roster, requesterOf(request)))
  return journeyActions(request, journeyViewer(auth, roster), { requesterName, requesterActive }, now)
}

/** Refuse a change the journey doesn't allow, with the journey's own reason. */
export function allow(action: ActionAvailability): void {
  if (!action.allowed) throw new RequestChangeError(action.reason)
}

/**
 * People's names for reasons and history, by id: the live roster first, then their saved profile (which covers
 * departed people and guests, who get no roster), else FORMER_MEMBER. One query, only for ids the roster lacks.
 */
export async function peopleNames(reader: RequestTx | typeof db, roster: readonly WorkspacePerson[] | null, ids: readonly string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)]
  const live = new Map(unique.flatMap(id => { const name = rosterMember(roster, id)?.name; return name ? [[id, name] as const] : [] }))
  const missing = unique.filter(id => !live.has(id))
  const saved = missing.length ? await reader.select({ id: profiles.id, name: profiles.fullName }).from(profiles).where(inArray(profiles.id, missing)) : []
  return Object.fromEntries(unique.map(id => [id, live.get(id) || saved.find(p => p.id === id)?.name || FORMER_MEMBER]))
}

/** One person's name, as peopleNames reads it. */
export async function personName(reader: RequestTx | typeof db, roster: readonly WorkspacePerson[] | null, id: string): Promise<string> {
  return (await peopleNames(reader, roster, [id]))[id]
}
