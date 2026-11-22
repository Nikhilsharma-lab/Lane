import * as auth from "@/lib/auth-client"
import { authErrorCopy, forCode, type AuthErrorCode } from "@/lib/auth-error-copy"
import type { WorkspacePermission } from "@/lib/auth-guard"
import { HOME } from "@/lib/auth-return-address"
import { createExternalStore } from "@/lib/external-store"
import { signInPage, signUpPage } from "./auth-addresses"

/**
 * Where the invitation stands, as increment 5's `/invite/[id]` reads it: Better Auth's `rejected` is declined and
 * `canceled` cancelled, and a pending invitation past its expiry is expired (#376 Q3: the view decides from the
 * status, and shows the expiry date only).
 */
export type InvitationStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired"

export type Invitation = {
  id: string
  workspace: string
  /** The inviter's name. */
  inviter: string
  /** The email it was sent to. */
  email: string
  role: WorkspacePermission
  /** ISO time it stops working; shown, never used to decide. */
  expiresAt: string
  status: InvitationStatus
}

/** Who is looking: signed out with or without a Lane account for the invited email, or signed in with an email. */
export type InvitationViewer = { signedIn: false; hasAccount: boolean } | { signedIn: true; email: string }

/** #346's invitation states, plus `closed`: an accept or decline refused because the invitation is no longer open. */
export type InvitationScreen =
  | "sign-in"
  | "create-account"
  | "accept"
  | "someone-else"
  | "expired"
  | "already-accepted"
  | "cancelled"
  | "closed"
  | "full"
  | "joined"

/** What the box beside the actions offers with its line: the code path, for an email that isn't confirmed. */
export type InvitationOffer = "code" | null
export type InvitationPending = "accept" | "decline" | "sign-out" | null

export type InvitationState = {
  screen: InvitationScreen
  alert: { message: string; offer: InvitationOffer } | null
  pending: InvitationPending
}

type Options = {
  invitation: Invitation
  viewer: InvitationViewer
  navigate: (path: string) => void
  /** Called once the person has joined; increment 5 sends them to the role step. */
  onJoined: () => void
}

/** Refusals that mean the invitation can't be accepted at all, so the page moves to that state. */
const SCREEN_OF: Partial<Record<AuthErrorCode, InvitationScreen>> = {
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "full",
  INVITATION_NOT_FOUND: "closed",
}
const OFFER_OF: Partial<Record<AuthErrorCode, InvitationOffer>> = {
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION: "code",
}

/** Increment 5's invitation page, where sign-in and sign-up come back to. */
export const invitationAddress = (id: string) => `/invite/${encodeURIComponent(id)}`

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function firstScreen({ status, email }: Invitation, viewer: InvitationViewer): InvitationScreen {
  if (status === "expired") return "expired"
  if (status === "accepted") return "already-accepted"
  if (status === "cancelled" || status === "declined") return "cancelled"
  if (!viewer.signedIn) return viewer.hasAccount ? "sign-in" : "create-account"
  return sameEmail(viewer.email, email) ? "accept" : "someone-else"
}

/**
 * #379: the invitation page's state, made once per mount. Accept, Decline and the switch to the invited email go
 * through Lane's browser auth client; every refusal reads `authErrorCopy`.
 */
export function createInvitationFlow({ invitation, viewer, navigate, onJoined }: Options) {
  const store = createExternalStore<InvitationState>({ screen: firstScreen(invitation, viewer), alert: null, pending: null })
  const set = (next: Partial<InvitationState>) => store.set({ ...store.get(), ...next })
  const signInHere = signInPage(invitation.email, invitationAddress(invitation.id))
  const signUpHere = signUpPage(invitation.email, invitationAddress(invitation.id))

  function refuse(code: string | undefined) {
    const screen = forCode(SCREEN_OF, code)
    set(screen ? { screen, alert: null } : { alert: { message: authErrorCopy(code), offer: forCode(OFFER_OF, code) ?? null } })
  }

  /** Runs one call at a time; a press while one is answering does nothing. */
  async function run(pending: Exclude<InvitationPending, null>, call: () => Promise<void>) {
    if (store.get().pending || store.get().screen === "joined") return
    set({ pending })
    try {
      await call()
    } finally {
      set({ pending: null })
    }
  }

  function signOutThenGo(path: string) {
    return run("sign-out", async () => {
      const answer = await auth.signOut()
      if (answer.ok) navigate(path)
      else refuse(answer.code)
    })
  }

  return {
    invitation,
    snapshot: store.get,
    subscribe: store.subscribe,
    /** Accept and join, and Try again from the full state. */
    accept: () =>
      run("accept", async () => {
        const answer = await auth.acceptInvitation(invitation.id)
        if (!answer.ok) return refuse(answer.code)
        set({ screen: "joined", alert: null })
        onJoined()
      }),
    decline: () =>
      run("decline", async () => {
        const answer = await auth.declineInvitation(invitation.id)
        if (answer.ok) set({ screen: "cancelled", alert: null })
        else refuse(answer.code)
      }),
    /** "Sign out and sign in as <email>": signs out, then goes to sign-in with the invited email, which comes back here. */
    signInAsInvited: () => signOutThenGo(signInHere),
    /**
     * The code path for an email that isn't confirmed: signs out, then opens sign-in at the code request with the
     * invited email. Signing in with the code confirms it, and comes back here.
     */
    confirmWithCode: () => signOutThenGo(signInPage(invitation.email, invitationAddress(invitation.id), "code-request")),
    /** Sign in to accept, and I already have an account. */
    signIn: () => navigate(signInHere),
    createAccount: () => navigate(signUpHere),
    /**
     * "Stay signed in as <email>", Go to Lane, and Open <workspace>. Lane's home opens the last workspace used, which
     * a person who just accepted is in; increment 5 can point Open at the workspace itself.
     */
    goToLane: () => navigate(HOME),
  }
}

export type InvitationFlow = ReturnType<typeof createInvitationFlow>
