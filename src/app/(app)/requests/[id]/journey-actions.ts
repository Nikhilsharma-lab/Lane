"use server";
import { loadRequestJourney } from "@/lib/data/request-journey";

/** Both projections share one guarded Request revision and captured UTC clock. */
export async function readRequestJourney(requestId: string, context: { orgId: string }) {
  return loadRequestJourney(requestId, context);
}
