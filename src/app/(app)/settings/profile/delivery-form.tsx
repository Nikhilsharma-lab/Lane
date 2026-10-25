"use client";

import { InboxDeliveryForm } from "@/components/settings/inbox-delivery-form";
import type { DeliveryChoice } from "@/lib/delivery-preference-rules";
import { updateDeliveryPreference } from "./delivery-actions";

export function DeliveryForm({ initialChoice, email, orgId }: { initialChoice: DeliveryChoice; email: string; orgId: string }) {
  return <InboxDeliveryForm initialChoice={initialChoice} email={email} onSave={(channel) => updateDeliveryPreference({ channel }, { orgId })} />;
}
