"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import { GOOGLE_ONLY_METHOD } from "@/lib/auth-error-copy"
import { createProfileAccount, type ProfileAccountCallbacks } from "./profile-account-controller"
import { AccountRowFailure } from "./profile-account-row-failure"
import { SettingsGroup, SettingsRow } from "./settings-group"
import styles from "./settings.module.css"
import account from "./profile-account.module.css"

// The password dialog loads the first time it opens. If it can't load, Lane says so and nothing changes.
const passwordDialogCode = popupCode(() => import("./profile-account-password"))

export type ProfileAccountViewProps = ProfileAccountCallbacks & {
  name: string
  /** Read-only: changing it isn't offered yet (#333 Q13). */
  email: string
  /** The ways this person signs in. */
  methods: { password: boolean; google: boolean }
  /** The connected Google account's email. */
  googleEmail?: string
  /** The `error` on Google's redirect back here after Connect Google, if any: it says nothing changed. */
  googleError?: string
}

/**
 * #380: Settings → Profile's account section: Account (name, email) and Sign-in methods (password, Google). Every
 * change goes through a callback that answers success or an error code; the view never calls Better Auth itself.
 */
export function ProfileAccountView(props: ProfileAccountViewProps) {
  const { email, methods, googleEmail } = props
  const googleOnly = methods.google && !methods.password
  const [controller] = useState(() => createProfileAccount(props))
  useEffect(() => { controller.keepCallbacks(props) })
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot)
  const nameRef = useRef<HTMLInputElement>(null)
  const draft = state.name.draft.trim()
  const problem = state.google.problem
  const mode = methods.password ? "change" : "set"
  const passwordDialog = usePopupCode(passwordDialogCode, state.password.open,
    () => couldNotOpen("account-password", open => { if (open) controller.openPassword(mode); else controller.closePassword() }))

  async function saveName(event: FormEvent) {
    event.preventDefault()
    await controller.saveName()
    if (controller.snapshot().name.error) nameRef.current?.focus()
  }

  return <>
    <SettingsGroup label="Account" labelId="account-heading">
      <SettingsRow id="account-name" label="Name" hint="Shown on your Requests and comments." control={
        <form className={account.inlineForm} onSubmit={saveName} noValidate aria-label="Name">
          <Input ref={nameRef} label="Name" hideLabel name="name" autoComplete="name" required value={state.name.draft} readOnly={state.name.busy}
            error={state.name.error ?? undefined} onChange={event => controller.changeName(event.target.value)} />
          <Button type="submit" variant="secondary" size="sm" loading={state.name.busy} disabled={!draft || draft === state.name.saved}>Save</Button>
        </form>} />
      <SettingsRow id="account-email" label="Email" hint="Changing your email isn’t available yet." control={<span className={styles.identifier}>{email}</span>} />
    </SettingsGroup>

    <SettingsGroup label="Sign-in methods" labelId="sign-in-methods-heading" description="Keep at least one way to sign in. You can always get a sign-in code by email.">
      <SettingsRow id="account-password" label="Password"
        hint={methods.password ? "Changing it can sign you out on your other devices." : methods.google ? "You sign in with Google. Add a password to sign in without it." : undefined}
        control={<Button type="button" variant="secondary" size="sm" onClick={() => controller.openPassword(mode)}>{methods.password ? "Change password" : "Set a password"}</Button>} />
      <SettingsRow id="account-google" label="Google" hint={methods.google ? `Connected as ${googleEmail ?? email}.` : `Sign in with your Google account for ${email}.`}
        control={methods.google
          ? <Button type="button" variant="secondary" size="sm" disabled={googleOnly} aria-describedby={googleOnly ? "google-only-method" : undefined}
              loading={state.google.busy === "disconnect"} onClick={() => { void controller.disconnectGoogle() }}>Disconnect</Button>
          : <Button type="button" variant="secondary" size="sm" loading={state.google.busy === "connect"} onClick={() => { void controller.connectGoogle() }}>Connect Google</Button>}>
        {googleOnly && <p id="google-only-method" className={styles.note}>{GOOGLE_ONLY_METHOD}</p>}
        {problem && <AccountRowFailure problem={problem} />}
      </SettingsRow>
    </SettingsGroup>

    <p role="status" className={account.status}>{state.status}</p>

    {passwordDialog && <passwordDialog.ProfileAccountPasswordDialog account={controller} mode={state.password.mode} email={email} />}
  </>
}
