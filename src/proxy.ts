import { NextResponse, type NextRequest } from "next/server";

import { RETURN_ADDRESS_HEADER, SIGN_IN_URL, SIGN_UP_URL, signInReturningTo } from "@/lib/auth-return-address";
import { serverTimingHeader } from "@/lib/feature-switches";
import { READ_TIMING_ID_HEADER, TIMING_ID_HEADER, newTimingId, proxyTiming } from "@/lib/server-timing";
import { sessionCookie } from "@/lib/session-cookies";

/** The pages anyone may open signed out; every `/invite/<id>` is one too. */
const SIGNED_OUT_PAGES = new Set([SIGN_IN_URL, SIGN_UP_URL, "/forgot-password", "/reset-password", "/privacy", "/terms"]);

/** A page being opened or read ahead, by someone who must sign in first. A POST is a Server Action, which answers for itself. */
function needsSignIn({ method, cookies, nextUrl: { pathname } }: NextRequest): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (SIGNED_OUT_PAGES.has(pathname) || pathname.startsWith("/invite/")) return false;
  return !sessionCookie(cookies);
}

// #387: the session check here is optimistic (is there a session cookie?) and asks the database nothing. The guards
// inside pages, actions and routes are the real check.
function answer(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const address = `${pathname}${search}`;
  if (needsSignIn(request)) return NextResponse.redirect(new URL(signInReturningTo(address), request.url));
  // #265: each request passed on carries a random timing id, which ties its timings
  // to its response (src/lib/request-timings.ts). A route handler under /api times
  // itself rather than as a page render, so its id has a name of its own.
  const [timingHeader, otherTimingHeader] = pathname.startsWith("/api/") ? [READ_TIMING_ID_HEADER, TIMING_ID_HEADER] : [TIMING_ID_HEADER, READ_TIMING_ID_HEADER];
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(timingHeader, newTimingId());
  requestHeaders.delete(otherTimingHeader);
  // For `sendToSignIn`, when the cookie turns out not to be a session.
  requestHeaders.set(RETURN_ADDRESS_HEADER, address);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

// #265: the proxy runs before the page, so its time is the `proxy` step of the
// response's Server-Timing header while the switch is on.
export default function proxy(request: NextRequest): NextResponse {
  const start = performance.now();
  const response = answer(request);
  if (serverTimingHeader()) response.headers.append("Server-Timing", proxyTiming(performance.now() - start));
  return response;
}

export const config = {
  matcher: [
    // Every path except Next's own files and static assets.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
