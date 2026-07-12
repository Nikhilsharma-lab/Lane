import { CheckEmail } from "./check-email";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { z } from "zod";

const emailSchema = z.string().email().max(254);

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const params = await searchParams;
  const parsedEmail = emailSchema.safeParse(params.email);
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4">
      <CheckEmail
        email={parsedEmail.success ? parsedEmail.data : ""}
        next={safeRedirectPath(params.next)}
      />
    </div>
  );
}
