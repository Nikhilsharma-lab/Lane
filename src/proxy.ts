import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { SIGN_IN_URL, SIGN_UP_URL, sessionTaskRedirect } from "@/lib/session-task-urls";

// D1 (#257): Clerk's middleware takes no `taskUrls`, so its server-side task address
// (`/login/tasks`) is sent to Lane's page for the task, as the browser's taskUrls do.
export default clerkMiddleware((_auth, request) => {
  const taskPage = sessionTaskRedirect(request.nextUrl);
  if (taskPage) return NextResponse.redirect(taskPage);
}, { signInUrl: SIGN_IN_URL, signUpUrl: SIGN_UP_URL });

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
