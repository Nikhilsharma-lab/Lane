import * as auth from "@/lib/auth-client"
import type { ProfileAccountCallbacks } from "./profile-account-controller"

// Google comes back here from a connection, with `?error=` when nothing changed.
const PROFILE = "/settings/profile"

/** #394: the account section's changes that go through Lane's browser auth client. Loaded the first time one is made. */
export const accountCalls: Omit<ProfileAccountCallbacks, "onSetPassword"> = {
  onSaveName: (name) => auth.rename({ name }),
  onChangePassword: ({ currentPassword, newPassword, signOutOtherDevices }) => auth.changePassword({ currentPassword, newPassword, signOutOthers: signOutOtherDevices }),
  onConnectGoogle: () => auth.connectGoogle({ returnTo: PROFILE }),
  onDisconnectGoogle: auth.disconnectGoogle,
}
