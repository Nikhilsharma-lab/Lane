// app/api/figma/oauth/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile || (profile.role !== "admin" && profile.role !== "lead")) {
    return NextResponse.redirect(new URL("/settings/integrations?error=forbidden", req.url));
  }

  const state = randomUUID();

  const params = new URLSearchParams({
    client_id: process.env.FIGMA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/figma/oauth/callback`,
    scope: "file_read",
    state,
    response_type: "code",
  });

  const response = NextResponse.redirect(
    `https://www.figma.com/oauth?${params.toString()}`
  );

  response.cookies.set("figma_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
