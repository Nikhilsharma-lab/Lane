/**
 * #206: the delivery choices a person can make today, client-safe. Email is the default (no saved row). Slack DM
 * is offered only once an Admin connects Slack (#207); until then it is not a choice.
 */
import { z } from "zod";

export const DELIVERY_CHOICES = ["email", "off"] as const;
export type DeliveryChoice = (typeof DELIVERY_CHOICES)[number];
export const DEFAULT_DELIVERY_CHOICE: DeliveryChoice = "email";

export const deliveryPreferenceSchema = z.object({ channel: z.enum(DELIVERY_CHOICES) });
