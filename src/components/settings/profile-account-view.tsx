"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { createProfileAccount, type ProfileAccountCallbacks } from "./profile-account-controller"
import { SettingsGroup, SettingsRow } from "./settings-group"
import styles from "./settings.module.css"
import account from "./profile-account.module.css"

export type ProfileAccountViewProps = ProfileAccountCallbacks & {
  name: string
  /** Read-only: changing it isn't offered yet (#333 Q13). */
  email: string
  /** The ways this person signs in. */
  methods: { password: boolean; google: boolean }
  /** The connected Google account's email. */
  googleEmail?: string
}

/**
 * #380: Settings → Profile's account section, which replaces Clerk's Manage account and Manage security when
 * increment 5 mounts it. Account (name, email) and Sign-in methods (password, Google). Every change goes through a
 * callback that answers success or an error code; the view never calls Better Auth itself.
 */
export function ProfileAccountView(props: ProfileAccountViewProps) {
  const { email } = props
  const latest = useRef(props)
  useEffect(() => { latest.current = props })
  const [controller] = useState(() => createProfileAccount(props, () => latest.current))
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot)
  const nameRef = useRef<HTMLInputElement>(null)
  const draft = state.name.draft.trim()

  async function saveName(event: FormEvent) {
    event.preventDefault()
    await controller.saveName()
    if (controller.snapshot().name.error) nameRef.current?.focus()
  }

  return <>
    <SettingsGroup label="Account" labelId="account-heading">
      <SettingsRow label="Name" hint="Shown on your Requests and comments." control={
        <form className={account.inlineForm} onSubmit={saveName} noValidate aria-label="Name">
          <Input ref={nameRef} label="Name" hideLabel name="name" autoComplete="name" required value={state.name.draft} readOnly={state.name.busy}
            error={state.name.error ?? undefined} onChange={event => controller.changeName(event.target.value)} />
          <Button type="submit" variant="secondary" size="sm" loading={state.name.busy} disabled={!draft || draft === state.name.saved}>Save</Button>
        </form>} />
      <SettingsRow label="Email" hint="Changing your email isn’t available yet." control={<span className={styles.identifier}>{email}</span>} />
    </SettingsGroup>
    <p role="status" className={account.status}>{state.status}</p>
  </>
}
