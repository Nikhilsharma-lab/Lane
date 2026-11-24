import { setFirstPassword, signOutDevice, signOutOtherDevices } from "@/app/(app)/settings/profile/account-actions"
import { callAction } from "@/lib/action-call"
import type { AuthAnswer } from "@/lib/auth-answer"
import type { ProfileAccountCallbacks } from "./profile-account-controller"
import type { SignedInDevicesCallbacks } from "./profile-account-devices-controller"

/** `orgId` is the page's workspace; `refresh` reads the page's server data again. */
type Page = { orgId: string; refresh: () => void }

const calls = async () => (await import("./account-calls")).accountCalls

/**
 * #394 (spec #383): what Settings → Profile's account view calls. A person's own sign-in methods go through Lane's
 * browser auth client, loaded when one is changed; a first password is a Server Action. A change reads the page's
 * server data again, so the name, the methods and the devices on screen are the saved ones.
 */
export function accountCallbacks({ orgId, refresh }: Page): ProfileAccountCallbacks {
  async function changed(send: Promise<AuthAnswer>) {
    const answer = await send
    if (answer.ok) refresh()
    return answer
  }
  return {
    onSaveName: async (name) => changed((await calls()).onSaveName(name)),
    onChangePassword: async (change) => changed((await calls()).onChangePassword(change)),
    onSetPassword: (newPassword) => changed(callAction(() => setFirstPassword(newPassword, { orgId }))),
    onConnectGoogle: async () => (await calls()).onConnectGoogle(),
    onDisconnectGoogle: async () => changed((await calls()).onDisconnectGoogle()),
  }
}

/** #394: what the signed-in devices view calls. Signing out is a Server Action: the server finds the session's token. */
export function deviceCallbacks({ orgId, refresh }: Page): SignedInDevicesCallbacks {
  return {
    onSignOutDevice: (device) => callAction(() => signOutDevice(device.id, { orgId })),
    onSignOutOtherDevices: () => callAction(() => signOutOtherDevices({ orgId })),
    onReloadDevices: refresh,
  }
}
