import "server-only";
import { eq } from "drizzle-orm";
import { db, profiles } from "@/db";
import type { MemberAuth } from "./auth-guard";
import type { WorkspacePerson } from "./workspace-roster";
import { RequestChangeError, type RequestTx } from "./request-change-store";
import { journeyActions, requesterOf, type ActionAvailability, type JourneyActions, type JourneyFacts, type JourneyViewer } from "./request-journey";
import type { ReleaseState } from "./request-release";

const rosterMember = (roster: readonly WorkspacePerson[] | null, id: string) =>
  roster?.find((p) => p.nominee.kind === "member" && p.nominee.userId === id)

/**
 * The journey viewer for a signed-in caller, from the session and the live roster. Admin needs both the
 * session and the roster to say so. `roster` is null when it couldn't be read: the viewer is then inactive,
 * so every action is refused rather than guessed.
 */
export function journeyViewer(auth: MemberAuth, roster: readonly WorkspacePerson[] | null): JourneyViewer {
  if (auth.role === "guest") return { id: auth.userId, role: "guest", active: false }
  const entry = rosterMember(roster, auth.userId)
  return { id: auth.userId, role: auth.role === "admin" && entry?.role === "org:admin" ? "admin" : "member", active: Boolean(entry) }
}

/**
 * What this caller may do on this Request now, with reasons. The one call both the server actions (to refuse)
 * and the reads (to show) make, so they always agree. `requesterName` names the Requester in reasons.
 */
export function journeyActionsFor(
  request: JourneyFacts & { createdBy: string; releaseState: ReleaseState | null },
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

/** A person's name for reasons: the live roster first, then their saved profile (a former member). */
export async function personName(reader: RequestTx | typeof db, roster: readonly WorkspacePerson[] | null, id: string): Promise<string> {
  const live = rosterMember(roster, id)?.name
  if (live) return live
  const [saved] = await reader.select({ name: profiles.fullName }).from(profiles).where(eq(profiles.id, id))
  return saved?.name || "Former member"
}
