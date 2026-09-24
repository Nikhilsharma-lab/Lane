"use client";

import { SignIn, TaskChooseOrganization, useSession } from "@clerk/nextjs";
import { LockKeyholeIcon } from "lucide-react";

import { AuthShell, AuthTrust } from "@/components/auth/auth-shell";

const embeddedAppearance = {
  elements: {
    rootBox: "w-full",
    cardBox: "w-full border-0 shadow-none bg-transparent",
    card: "w-full border-0 shadow-none bg-transparent p-0",
  },
};

export default function LoginPage() {
  const { session } = useSession();

  return (
    <AuthShell
      footer={
        <AuthTrust icon={LockKeyholeIcon} className="justify-center sm:justify-start">
          Private to your workspace. Lane never tracks activity.
        </AuthTrust>
      }
    >
      {session?.currentTask?.key === "choose-organization" ? (
        <TaskChooseOrganization
          redirectUrlComplete="/onboarding"
          appearance={embeddedAppearance}
        />
      ) : (
        <SignIn
          routing="hash"
          signUpUrl="/signup"
          fallbackRedirectUrl="/"
          appearance={embeddedAppearance}
        />
      )}
    </AuthShell>
  );
}
