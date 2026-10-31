import { z } from "zod";
import { DELIVERY_CHOICES } from "./delivery-preference-rules";

/** #206/#207: the Inbox delivery action checks the word against the choices (delivery-preference-rules.ts). */
export const deliveryPreferenceSchema = z.object({ channel: z.enum(DELIVERY_CHOICES) });
