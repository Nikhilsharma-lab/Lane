import type { Metadata } from "next";

import { authPageQuery, type AuthPageQuery } from "@/components/auth/better-auth/auth-addresses";
import { PasswordResetForm } from "@/components/auth/better-auth/password-reset-form";

// #271 (A114): the tab reads "Reset password · Lane".
export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<AuthPageQuery> }) {
  return <PasswordResetForm email={authPageQuery(await searchParams).email} />;
}
