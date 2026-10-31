/**
 * #206/#207: the delivery choices, client-safe. Email is the default (no saved row). Slack DM is a choice only
 * while an Admin has Slack connected; the server checks that. The action's schema is in
 * delivery-preference-schema.ts, so Settings' browser code carries no form-checking library (#266).
 */
export const DELIVERY_CHOICES = ["email", "slack", "off"] as const;
export type DeliveryChoice = (typeof DELIVERY_CHOICES)[number];
export const DEFAULT_DELIVERY_CHOICE: DeliveryChoice = "email";
