import { recordPaymentEvent } from "@/lib/billing";
import { paymentProvider } from "@/lib/payment-provider";

/**
 * #214 (spec #195 build plan, item 5): the payment provider tells Lane here that a workspace paid. Only an event
 * signed with the provider's webhook secret counts, and recording it twice changes nothing, so the provider's
 * retries are safe. With no payment provider set up (no Stripe keys) every call is refused.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const provider = paymentProvider();
  if (!provider) return Response.json({ error: "Paying for Lane isn't set up." }, { status: 503, headers: NO_STORE });
  const body = await request.text();
  const reading = await provider.readEvent(body, request.headers, new Date());
  if (!reading.ok) return Response.json({ error: "Not a signed payment event." }, { status: 400, headers: NO_STORE });
  if (reading.event) await recordPaymentEvent(reading.event);
  return Response.json({ received: true }, { headers: NO_STORE });
}
