import { getValidSignupInvite } from "@/lib/signup-invite";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { SignupForm } from "./signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  const invite = await getValidSignupInvite(next);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4">
      <SignupForm
        next={next}
        initialEmail={invite?.email ?? params.email ?? ""}
        emailLocked={Boolean(invite)}
      />
    </div>
  );
}
