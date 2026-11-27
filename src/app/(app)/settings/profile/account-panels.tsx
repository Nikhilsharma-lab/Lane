import { Suspense } from "react";
import { AiDataUse } from "@/components/settings/ai-data-use";
import { ProfileAccountLoader, SignedInDevicesLoader } from "@/components/settings/profile-account-loader";
import type { SharedPanels } from "@/components/settings/settings-command-adapter";
import { readUserAgent } from "@/components/settings/signed-in-device-rules";
import { loadSignInMethods } from "@/lib/data/sign-in-methods";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { readSignedInDevices } from "@/lib/session";

/**
 * #394 Settings → Profile's account section, as every Settings page renders it: the person's name, email and ways to
 * sign in, with the `error` Google came back with if connecting it changed nothing; their signed-in devices, streamed
 * after the page; and Security & access's AI data use.
 */
export async function accountPanels(workspace: Pick<WorkspaceContext, "orgId" | "userId" | "fullName" | "email">, googleError?: string): Promise<Pick<SharedPanels, "account" | "devices" | "security">> {
  const { orgId, userId, fullName, email } = workspace;
  const methods = await loadSignInMethods(userId);
  return {
    account: <ProfileAccountLoader orgId={orgId} name={fullName} email={email} methods={methods} googleError={googleError} />,
    devices: <Suspense fallback={<SignedInDevicesLoader orgId={orgId} devices={[]} state="loading" />}>
      <Devices orgId={orgId} />
    </Suspense>,
    security: <AiDataUse />,
  };
}

/** The session's person's own devices: a browser and a system each, never an address (#346 point 5). */
async function Devices({ orgId }: { orgId: string }) {
  const sessions = await readDevices();
  const devices = (sessions ?? []).map(({ userAgent, ...device }) => ({ ...device, ...readUserAgent(userAgent) }));
  return <SignedInDevicesLoader orgId={orgId} devices={devices} state={sessions ? "ready" : "error"} />;
}

/** Null when they couldn't be read, or the session ended as the page drew. Never rejects. */
async function readDevices() {
  try {
    return await readSignedInDevices();
  } catch (error) {
    console.error("[profile] signed-in devices not read:", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}
