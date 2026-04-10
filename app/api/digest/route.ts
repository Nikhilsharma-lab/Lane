// app/api/digest/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateDigestForOrg } from "@/lib/digest";
import { checkAiRateLimit } from "@/lib/rate-limit";

// Re-export WeeklyDigest so digest-panel.tsx keeps compiling until Task 7 updates it
export type { WeeklyDigest } from "@/lib/digest";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimited = await checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const result = await generateDigestForOrg(profile.orgId);
  return NextResponse.json(result);
}
