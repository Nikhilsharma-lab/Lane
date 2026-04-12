"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bootstrapOrganizationMembership } from "@/lib/bootstrap-access";

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

  // bootstrap_organization_membership is idempotent — safe to call even if
  // profile already exists; the SQL function returns early in that case.
  const baseSlug = orgName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    const result = await bootstrapOrganizationMembership({
      userId,
      orgName,
      slug,
      fullName,
      email,
    });
    if (!result) throw new Error("bootstrap_organization_membership returned no result");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[signup] workspace bootstrap failed:", msg);
    return { error: "Something went wrong setting up your workspace. Please try again or contact support." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
