import "server-only";

import { cache } from "react";
import type { MemberAuth } from "@/lib/auth-guard";
import { loadRequestDetail } from "@/lib/data/requests";
import { timed } from "@/lib/request-timings";

/** #271: one read of the Request per render, shared by the Request page, its tab title and its layout's 404 check.
 * A module of its own, so the layout imports no client code. */
export const readRequestPage = cache((member: MemberAuth, requestId: string) => timed("data", () => loadRequestDetail(member, requestId)));
