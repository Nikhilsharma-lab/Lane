"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Placeholder } from "@/components/loading/placeholder"
import { useInBrowser } from "@/components/requests/local-time"
import { createSignedInDevices, type SignedInDevicesCallbacks } from "./profile-account-devices-controller"
import { AccountRowFailure } from "./profile-account-row-failure"
import { SettingsBlock, SettingsGroup, SettingsRow, SettingsRowFailure, SettingsRowList } from "./settings-group"
import { deviceDay, deviceName, type SignedInDevice } from "./signed-in-device-rules"
import account from "./profile-account.module.css"
import members from "./members.module.css"

export type { SignedInDevice }

export type ProfileAccountDevicesProps = SignedInDevicesCallbacks & {
  devices: SignedInDevice[]
  state: "loading" | "ready" | "error"
}

/**
 * #380 (#346 point 5): Settings → Profile's Signed-in devices, which only the person themselves ever sees. Each device
 * reads as browser and system, last used and signed in, by day. This device has no Sign out; every other one does.
 * Its own module, so it loads after the page (profile-account-loader.tsx).
 */
export function ProfileAccountDevices(props: ProfileAccountDevicesProps) {
  const { devices, state: load } = props
  const headingRef = useRef<HTMLSpanElement>(null)
  const [controller] = useState(() => createSignedInDevices(props))
  useEffect(() => { controller.keepCallbacks(props) })
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot)
  // The server and the hydrating render can't know the viewer's zone, so they count days in UTC until the page is here.
  const timeZone = useInBrowser() ? undefined : "UTC"
  const day = (at: SignedInDevice["lastUsedAt"]) => deviceDay(at, { timeZone })
  const shown = devices.filter(device => !state.signedOut.includes(device.id) && (device.current || !state.othersSignedOut))
  const others = shown.some(device => !device.current)
  const failure = (target: string) => state.problem?.target === target && <AccountRowFailure problem={state.problem} />

  /** The pressed button goes with what it signed out, so focus that was on it moves to the group's heading (#405). */
  async function press(button: HTMLButtonElement, signOut: () => Promise<boolean>) {
    const signedOut = await signOut()
    const focused = document.activeElement
    if (signedOut && (focused === button || focused === document.body)) headingRef.current?.focus()
  }

  return <>
    <SettingsGroup label={<><span ref={headingRef} id="devices-heading" tabIndex={-1}>Signed-in devices</span>{load === "ready" && <>{" "}<span className={members.groupCount} aria-hidden="true">{shown.length}</span></>}</>}
      aria-labelledby="devices-heading" description="Only you see this. A device stays signed in for 7 days after it was last used.">
      {load === "loading" && <SettingsBlock><Placeholder label="Loading devices…" lines={2} /></SettingsBlock>}
      {load === "error" && <SettingsBlock><SettingsRowFailure title="Your devices couldn’t be loaded" onRetry={controller.reload} /></SettingsBlock>}
      {load === "ready" && <>
        <SettingsRowList label="Signed-in devices">
          {shown.map(device => {
            const name = deviceName(device)
            return <SettingsRow as="li" key={device.id} label={name} hint={`Used ${day(device.lastUsedAt)}, signed in ${day(device.signedInAt)}`}
              control={device.current
                ? <Badge size="sm" tone="success">This device</Badge>
                : <Button type="button" variant="ghost" size="sm" aria-label={`Sign out of ${name}`} loading={state.busy === device.id}
                    disabled={!!state.busy && state.busy !== device.id} onClick={event => { void press(event.currentTarget, () => controller.signOut(device)) }}>Sign out</Button>}>
              {failure(device.id)}
            </SettingsRow>
          })}
        </SettingsRowList>
        {others && <SettingsBlock>
          <Button type="button" variant="secondary" size="sm" loading={state.busy === "others"} disabled={!!state.busy && state.busy !== "others"}
            onClick={event => { void press(event.currentTarget, controller.signOutOthers) }}>Sign out of all other devices</Button>
          {failure("others")}
        </SettingsBlock>}
      </>}
    </SettingsGroup>
    <p role="status" className={account.status}>{state.status}</p>
  </>
}
