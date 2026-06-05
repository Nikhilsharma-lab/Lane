"use server";

import { createClient } from "@/lib/supabase/server";

export async function acceptInvite(data: {
  token: string;
  userId: string;
  fullName: string;
  email: string;
}) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("accept_invite_membership", {
    invite_token: data.token,
    target_user_id: data.userId,
    target_full_name: data.fullName,
    target_email: data.email,
  });

  if (error) {
    console.error("[invite] accept failed:", error.message);
    return { error: error.message };
  }

  return { success: true };
}
