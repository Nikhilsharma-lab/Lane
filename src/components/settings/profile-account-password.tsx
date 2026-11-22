"use client"

import { useRef, useSyncExternalStore, type FormEvent } from "react"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { AuthPasswordField } from "@/components/auth/auth-field"
import { Dialog, DialogClose, DialogContent } from "@/components/popup/adaptive-dialog"
import type { ProfileAccount } from "./profile-account-controller"
import styles from "./settings.module.css"
import account from "./profile-account.module.css"

type Mode = "change" | "set"

/**
 * #380: Change password, or Set a password for someone who signs in only with Google. Loaded the first time it opens,
 * so it stays out of Settings → Profile's first load. Escape asks before it drops a typed password.
 */
export function ProfileAccountPasswordDialog({ account: controller, mode, email }: { account: ProfileAccount; mode: Mode; email: string }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot)
  return <Dialog open={state.password.open} onOpenChange={open => { if (!open) controller.closePassword() }} dismissible={!state.password.busy} guardTypedText>
    <DialogContent title={mode === "change" ? "Change password" : "Set a password"}
      description={mode === "set" ? `Then you can sign in with ${email} and this password, as well as Google.` : undefined}>
      <ProfileAccountPasswordForm account={controller} mode={mode} />
    </DialogContent>
  </Dialog>
}

/** The dialog's fields. A refused submit puts each line on its field and moves focus to the first. */
export function ProfileAccountPasswordForm({ account: controller, mode }: { account: ProfileAccount; mode: Mode }) {
  const { password } = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot)
  const currentRef = useRef<HTMLInputElement>(null)
  const newRef = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const field = await controller.submitPassword()
    if (field) (field === "current" ? currentRef : newRef).current?.focus()
  }

  return <form className={account.passwordForm} onSubmit={submit} noValidate aria-busy={password.busy || undefined}>
    {mode === "change" && <AuthPasswordField ref={currentRef} id="account-current-password" label="Current password" name="current-password" autoComplete="current-password" required
      autoFocus value={password.current} readOnly={password.busy} error={password.errors.current} onChange={event => controller.changeCurrentPassword(event.target.value)} />}
    <AuthPasswordField ref={newRef} id="account-new-password" label="New password" name="new-password" autoComplete="new-password" required autoFocus={mode === "set"}
      description="Use at least 8 characters." value={password.next} readOnly={password.busy} error={password.errors.new}
      onChange={event => controller.changeNewPassword(event.target.value)} />
    {mode === "change" && <Checkbox label="Sign out of my other devices" checked={password.signOutOthers} disabled={password.busy}
      onCheckedChange={checked => controller.setSignOutOthers(checked === true)} />}
    {password.error && <Alert role="alert" tone="danger" title={password.error} />}
    <div className={styles.dialogActions}>
      <DialogClose asChild><Button type="button" variant="secondary" disabled={password.busy}>Cancel</Button></DialogClose>
      <Button type="submit" loading={password.busy}>{mode === "change" ? "Change password" : "Set password"}</Button>
    </div>
  </form>
}
