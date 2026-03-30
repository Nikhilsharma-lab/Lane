"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { organizations, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const orgName = formData.get("orgName") as string;

  // Try to sign up
  const { data, error } = await supabase.auth.signUp({ email, password });

  let userId: string;

  if (error) {
    // "User already registered" — sign them in and create missing profile
    if (error.message.toLowerCase().includes("already registered") || error.message.toLowerCase().includes("already been registered")) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) return { error: "Account exists but wrong password. Try signing in instead." };
      if (!signInData.user) return { error: "Could not sign in" };
      userId = signInData.user.id;
    } else {
      return { error: error.message };
    }
  } else {
    if (!data.user) return { error: "Signup failed" };
    if (data.user.identities?.length === 0) {
      // Confirmed duplicate — sign in instead
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) return { error: "Account exists. Try signing in with your existing password." };
      if (!signInData.user) return { error: "Could not sign in" };
      userId = signInData.user.id;
    } else {
      userId = data.user.id;
      // Sign in explicitly to ensure session cookie is set
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) return { error: signInError.message };
    }
  }

  // Create org + profile only if missing
  const [existingProfile] = await db.select().from(profiles).where(eq(profiles.id, userId));

  if (!existingProfile) {
    const baseSlug = orgName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      const [org] = await db.insert(organizations).values({ name: orgName, slug }).returning();
      await db.insert(profiles).values({ id: userId, orgId: org.id, fullName, email, role: "lead" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: `DB error: ${msg}` };
    }
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
