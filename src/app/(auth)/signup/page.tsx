import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { authPageQuery, type AuthPageQuery } from "@/components/auth/better-auth/auth-addresses";
import { AuthForm } from "@/components/auth/better-auth/auth-form";
import { safeReturnAddress } from "@/lib/auth-return-address";
import { getSession } from "@/lib/ensure-workspace";

// #271 (A114): the tab reads "Sign up · Lane".
export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<AuthPageQuery> }) {
  const { email, returnTo, errorCode } = authPageQuery(await searchParams);
  if (await getSession()) redirect(safeReturnAddress(returnTo));
  return <AuthForm mode="sign-up" email={email} returnTo={returnTo} errorCode={errorCode} />;
}
