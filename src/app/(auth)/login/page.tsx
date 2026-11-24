import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { authPageQuery, type AuthPageQuery } from "@/components/auth/better-auth/auth-addresses";
import { AuthForm } from "@/components/auth/better-auth/auth-form";
import { safeReturnAddress } from "@/lib/auth-return-address";
import { getSession } from "@/lib/ensure-workspace";

// #271 (A114): the tab reads "Sign in · Lane".
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<AuthPageQuery> }) {
  const { email, returnTo, errorCode, start } = authPageQuery(await searchParams);
  if (await getSession()) redirect(safeReturnAddress(returnTo));
  return <AuthForm mode="sign-in" email={email} returnTo={returnTo} errorCode={errorCode} start={start} />;
}
