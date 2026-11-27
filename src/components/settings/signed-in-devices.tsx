"use client"

import { useTransition } from "react"
import { useServerRefresh } from "@/components/requests/use-optimistic-action"
import { deviceCallbacks } from "./account-callbacks"
import { ProfileAccountDevices, type ProfileAccountDevicesProps } from "./profile-account-devices"

export type SignedInDevicesProps = Pick<ProfileAccountDevicesProps, "devices" | "state"> & { orgId: string }

/** #394: the person's own signed-in devices. Try again after a failed read shows the list loading while it's read again. */
export function SignedInDevices({ orgId, devices, state }: SignedInDevicesProps) {
  const refresh = useServerRefresh()
  const [reloading, startReload] = useTransition()
  const callbacks = deviceCallbacks({ orgId, refresh: () => startReload(refresh) })
  return <ProfileAccountDevices devices={devices} state={reloading ? "loading" : state} {...callbacks} />
}
