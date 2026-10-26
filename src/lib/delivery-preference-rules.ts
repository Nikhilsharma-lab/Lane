/**
 * #206/#207: the delivery choices, client-safe. Email is the default (no saved row). Slack DM is a choice only
 * while an Admin has Slack connected; the server checks that, this only checks the word.
 */
import { z } from "zod";

export const DELIVERY_CHOICES = ["email", "slack", "off"] as const;
export type DeliveryChoice = (typeof DELIVERY_CHOICES)[number];
export const DEFAULT_DELIVERY_CHOICE: DeliveryChoice = "email";

export const deliveryPreferenceSchema = z.object({ channel: z.enum(DELIVERY_CHOICES) });
