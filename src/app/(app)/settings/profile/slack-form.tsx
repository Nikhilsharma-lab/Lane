"use client";

import { SlackConnectionCard, type SlackConnectionState, type SlackConnectResult } from "@/components/settings/slack-connection-card";
import { disconnectSlack, startSlackConnect } from "./slack-actions";

export function SlackForm({ connection, result, orgId }: { connection: SlackConnectionState; result?: SlackConnectResult; orgId: string }) {
  return <SlackConnectionCard connection={connection} result={result}
    onConnect={() => startSlackConnect({}, { orgId })}
    onDisconnect={() => disconnectSlack({}, { orgId })} />;
}
