import { settle, type AuthAnswer } from "@/lib/auth-answer"
import { authErrorCopy, eachCode, forCode } from "@/lib/auth-error-copy"
import { createExternalStore } from "@/lib/external-store"
import type { WorkspacePermission } from "@/lib/auth-guard"
import { invitationRefusal } from "./invitation-copy"

/** An invitation waiting for the person's email, as increment 5 reads it. */
export type PendingWorkspaceInvitation = {
  id: string
  workspace: string
  /** The inviter's name. */
  inviter: string
  role: WorkspacePermission
}

export const WORKSPACE_NAME_MISSING = "Name your workspace."

/** Codes whose line belongs on the name field: a workspace URL another workspace has. */
const NAME_CODES = eachCode(["ORGANIZATION_ALREADY_EXISTS", "ORGANIZATION_SLUG_ALREADY_TAKEN"], true)

export type OnboardingState = {
  nameError: string | null
  /** A refused Join (under the invitations) or Create (under the form). */
  alert: { at: "join" | "create"; title: string; detail: string | null } | null
  pending: { join: string } | "create" | null
}

type Options = {
  invitations: PendingWorkspaceInvitation[]
  onJoin: (invitationId: string) => Promise<AuthAnswer>
  onCreate: (name: string) => Promise<AuthAnswer>
}

/**
 * #379: Onboarding's workspace step, made once per mount. It calls the view's callbacks, never the browser auth
 * client, and reads every refusal from `authErrorCopy`. A Join refused because the workspace is full or the
 * invitation is gone reads as the invitation page does.
 */
export function createOnboardingFlow({ invitations, onJoin, onCreate }: Options) {
  const store = createExternalStore<OnboardingState>({ nameError: null, alert: null, pending: null })
  const set = (next: Partial<OnboardingState>) => store.set({ ...store.get(), ...next })

  /**
   * Runs one callback at a time, answering its refusal, or null when it succeeded or a call was already answering.
   * A throw is a refusal with no code, which reads as the generic line.
   */
  async function run(pending: OnboardingState["pending"], call: () => Promise<AuthAnswer>): Promise<{ code?: string } | null> {
    if (store.get().pending) return null
    set({ pending, alert: null })
    const answer = await settle(call)
    set({ pending: null })
    return answer.ok ? null : answer
  }

  return {
    snapshot: store.get,
    subscribe: store.subscribe,
    /** Typing a name forgets what was said about the last one. */
    editName() {
      if (store.get().nameError) set({ nameError: null })
    },
    async join(invitationId: string) {
      const refused = await run({ join: invitationId }, () => onJoin(invitationId))
      if (!refused) return
      const workspace = invitations.find((invitation) => invitation.id === invitationId)?.workspace
      const refusal = workspace ? invitationRefusal(refused.code, workspace) : null
      set({ alert: { at: "join", title: refusal?.title ?? authErrorCopy(refused.code), detail: refusal?.detail ?? null } })
    },
    async create(name: string) {
      if (store.get().pending) return
      const trimmed = name.trim()
      if (!trimmed) return set({ nameError: WORKSPACE_NAME_MISSING, alert: null })
      set({ nameError: null })
      const refused = await run("create", () => onCreate(trimmed))
      if (!refused) return
      if (forCode(NAME_CODES, refused.code)) set({ nameError: authErrorCopy(refused.code) })
      else set({ alert: { at: "create", title: authErrorCopy(refused.code), detail: null } })
    },
  }
}

export type OnboardingFlow = ReturnType<typeof createOnboardingFlow>
