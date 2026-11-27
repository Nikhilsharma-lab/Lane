"use client"

import { useServerRefresh } from "@/components/requests/use-optimistic-action"
import { accountCallbacks } from "./account-callbacks"
import { ProfileAccountView, type ProfileAccountViewProps } from "./profile-account-view"
import type { ProfileAccountCallbacks } from "./profile-account-controller"

export type ProfileAccountProps = Omit<ProfileAccountViewProps, keyof ProfileAccountCallbacks> & { orgId: string }

/** #394: Settings → Profile's account section on Lane's own account. */
export function ProfileAccount({ orgId, ...account }: ProfileAccountProps) {
  const refresh = useServerRefresh()
  return <ProfileAccountView {...account} {...accountCallbacks({ orgId, refresh })} />
}
