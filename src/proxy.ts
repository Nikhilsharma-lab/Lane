import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { serverTimingHeader } from "@/lib/feature-switches";
import { READ_TIMING_ID_HEADER, TIMING_ID_HEADER } from "@/lib/server-timing";
import { SIGN_IN_URL, SIGN_UP_URL, sessionTaskRedirect } from "@/lib/session-task-urls";

// D1 (#257): Clerk's middleware takes no `taskUrls`, so its server-side task address
// (`/login/tasks`) is sent to Lane's page for the task, as the browser's taskUrls do.
// #265: each request passed on carries a random timing id, which ties its timings
// to its response (src/lib/request-timings.ts). A route handler under /api times
// itself rather than as a page render, so its id has a name of its own.
const clerk = clerkMiddleware((_auth, request) => {
  const taskPage = sessionTaskRedirect(request.nextUrl);
  if (taskPage) return NextResponse.redirect(taskPage);
  const [own, other] = request.nextUrl.pathname.startsWith("/api/") ? [READ_TIMING_ID_HEADER, TIMING_ID_HEADER] : [TIMING_ID_HEADER, READ_TIMING_ID_HEADER];
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(own, crypto.randomUUID());
  requestHeaders.delete(other);
  return NextResponse.next({ request: { headers: requestHeaders } });
}, { signInUrl: SIGN_IN_URL, signUpUrl: SIGN_UP_URL });

// #265: Clerk's session check runs here, before the page, so its time is the
// `proxy` step of the response's Server-Timing header while the switch is on.
export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const start = performance.now();
  const response = await clerk(request, event);
  if (response && serverTimingHeader()) {
    response.headers.append("Server-Timing", `proxy;dur=${Math.round((performance.now() - start) * 10) / 10}`);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * Let resource-level guards protect data. Proxy only establishes Clerk's
     * request context and skips static assets.
     */
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
