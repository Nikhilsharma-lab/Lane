"use client"

import dynamic from "next/dynamic"
import { Placeholder } from "@/components/loading/placeholder"

/**
 * #394: every Settings page carries Profile's account and devices, so their code loads after the page instead of in its
 * first load, as the Members section's does. The server still draws the account's rows with the page.
 */
export const ProfileAccountLoader = dynamic(() => import("./profile-account").then((module) => module.ProfileAccount), {
  loading: () => <Placeholder label="Loading account…" lines={4} />,
})
export const SignedInDevicesLoader = dynamic(() => import("./signed-in-devices").then((module) => module.SignedInDevices), {
  loading: () => <Placeholder label="Loading devices…" lines={2} />,
})
