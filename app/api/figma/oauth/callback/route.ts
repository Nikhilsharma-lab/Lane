// app/api/figma/oauth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, figmaConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptToken } from "@/lib/encrypt";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("figma_oauth_state")?.value;

  const clearState = (res: NextResponse) => {
    res.cookies.delete("figma_oauth_state");
    return res;
  };

  if (!code || !state || !storedState || state !== storedState) {
    return clearState(
      NextResponse.redirect(new URL("/settings/integrations?error=oauth_failed", req.url))
    );
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return clearState(NextResponse.redirect(new URL("/login", req.url)));
  if (profile.role !== "admin" && profile.role !== "lead") {
    return clearState(
      NextResponse.redirect(new URL("/settings/integrations?error=forbidden", req.url))
    );
  }

  const tokenRes = await fetch("https://api.figma.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.FIGMA_CLIENT_ID!,
      client_secret: process.env.FIGMA_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/figma/oauth/callback`,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return clearState(
      NextResponse.redirect(new URL("/settings/integrations?error=token_exchange_failed", req.url))
    );
  }

  let tokenData: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  try {
    tokenData = await tokenRes.json();
  } catch {
    return clearState(
      NextResponse.redirect(new URL("/settings/integrations?error=token_exchange_failed", req.url))
    );
  }

  if (!tokenData.access_token) {
    return clearState(
      NextResponse.redirect(new URL("/settings/integrations?error=token_exchange_failed", req.url))
    );
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  await db
    .insert(figmaConnections)
    .values({
      orgId: profile.orgId,
      accessToken: encryptToken(tokenData.access_token),
      refreshToken: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
      scopes: tokenData.scope ?? "file_read",
      connectedById: user.id,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: figmaConnections.orgId,
      set: {
        accessToken: encryptToken(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
        scopes: tokenData.scope ?? "file_read",
        connectedById: user.id,
        expiresAt,
        updatedAt: new Date(),
      },
    });

  return clearState(
    NextResponse.redirect(new URL("/settings/integrations?connected=true", req.url))
  );
}
