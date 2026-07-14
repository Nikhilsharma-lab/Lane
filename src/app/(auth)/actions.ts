"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { inviteTokenFromPath, safeRedirectPath } from "@/lib/safe-redirect";
import { getValidSignupInvite } from "@/lib/signup-invite";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(1, "Full name is required").max(200),
});

const resendSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

function confirmationCallbackUrl(target: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL must be set.");
  const callbackUrl = new URL("/auth/callback", appUrl);
  callbackUrl.searchParams.set("next", target);
  return callbackUrl.toString();
}

export async function login(formData: FormData, redirectTo?: string) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  // Validate redirect target (same open-redirect protection as auth/callback)
  const target = safeRedirectPath(redirectTo);

  revalidatePath("/", "layout");
  redirect(target);
}

export async function signup(formData: FormData, redirectTo?: string) {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const target = safeRedirectPath(redirectTo);
  const invite = await getValidSignupInvite(target, parsed.data.email);
  if (inviteTokenFromPath(target) && !invite) {
    return {
      error:
        "This invite is invalid, expired, or belongs to a different email address.",
    };
  }
  const supabase = await createClient();

  if (invite) {
    const admin = createServiceClient();
    const { error: createError } = await admin.auth.admin.createUser({
      email: invite.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName },
    });

    if (createError) {
      return {
        error:
          "We couldn’t create this invited account. If you already signed up, use Sign in instead.",
      };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: invite.email,
      password: parsed.data.password,
    });
    if (signInError) {
      return { error: "Your account was created, but sign-in failed. Try signing in." };
    }

    revalidatePath("/", "layout");
    redirect(invite.target);
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: confirmationCallbackUrl(target),
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.session) {
    return {
      confirmationRequired: true as const,
      email: parsed.data.email,
      next: target,
    };
  }

  revalidatePath("/", "layout");
  redirect(target);
}

export async function resendSignupConfirmation(
  email: string,
  redirectTo?: string
) {
  const parsed = resendSchema.safeParse({ email });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const target = safeRedirectPath(redirectTo);
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: confirmationCallbackUrl(target) },
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function logoutAndRedirect(redirectTo: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(safeRedirectPath(redirectTo));
}
