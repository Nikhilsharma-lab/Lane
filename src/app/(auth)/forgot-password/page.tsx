import type { Metadata } from "next";

import { authPageQuery, type AuthPageQuery } from "@/components/auth/better-auth/auth-addresses";
import { PasswordResetForm } from "@/components/auth/better-auth/password-reset-form";

// #271 (A114): the tab reads "Forgot password · Lane".
export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<AuthPageQuery> }) {
  return <PasswordResetForm email={authPageQuery(await searchParams).email} />;
}
