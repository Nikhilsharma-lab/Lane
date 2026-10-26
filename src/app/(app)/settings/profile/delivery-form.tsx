"use client";

import { InboxDeliveryForm } from "@/components/settings/inbox-delivery-form";
import type { DeliveryChoice } from "@/lib/delivery-preference-rules";
import { updateDeliveryPreference } from "./delivery-actions";

export function DeliveryForm({ initialChoice, email, orgId, slackOffered, choseSlack }: {
  initialChoice: DeliveryChoice; email: string; orgId: string; slackOffered: boolean; choseSlack: boolean;
}) {
  return <InboxDeliveryForm initialChoice={initialChoice} email={email} slackOffered={slackOffered} choseSlack={choseSlack}
    onSave={(channel) => updateDeliveryPreference({ channel }, { orgId })} />;
}
