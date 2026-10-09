type ClerkEnv = Record<string, string | undefined>;

export function assertClerkDevelopmentInstance(
  env: ClerkEnv = process.env
): void {
  const publishable = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const secret = env.CLERK_SECRET_KEY ?? "";

  if (
    !publishable.startsWith("pk_test_") ||
    !secret.startsWith("sk_test_")
  ) {
    throw new Error(
      "[clerk] Refusing Clerk user mutations without a development instance (pk_test_ / sk_test_)."
    );
  }
}
