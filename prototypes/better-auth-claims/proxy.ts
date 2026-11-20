// PROTOTYPE (#344). Next 16 proxy (Node runtime by default) with Better Auth's
// session check, timed into Server-Timing like Lane's src/proxy.ts.
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export default async function proxy(request: NextRequest) {
  const start = performance.now();
  const session = await auth.api.getSession({ headers: request.headers });
  const dur = performance.now() - start;
  if (!session && request.nextUrl.pathname.startsWith("/app")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const response = NextResponse.next();
  response.headers.append("Server-Timing", `proxy;dur=${dur.toFixed(1)}`);
  return response;
}

export const config = { matcher: ["/((?!_next|api/auth|favicon.ico).*)"] };
