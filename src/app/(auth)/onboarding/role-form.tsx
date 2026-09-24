"use client";

import { useState } from "react";
import { ClipboardListIcon, Code2Icon, PenToolIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { AuthAction } from "@/components/auth/auth-action";
import { OnboardingChrome, StepHeading } from "@/components/auth/onboarding-chrome";
import { Feedback } from "@/components/ui/feedback";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRecoverableAction } from "@/components/ui/use-recoverable-action";
import { cn } from "@/lib/utils";
import { saveOnboardingRole } from "./actions";

type FunctionalRole = "pm" | "designer" | "developer";

const roles = [
  {
    value: "pm" as const,
    label: "PM",
    helper: "Product direction and prioritisation",
    icon: ClipboardListIcon,
  },
  {
    value: "designer" as const,
    label: "Designer",
    helper: "Research, interaction, and visual craft",
    icon: PenToolIcon,
  },
  {
    value: "developer" as const,
    label: "Developer",
    helper: "Engineering and implementation",
    icon: Code2Icon,
  },
];

export function RoleForm() {
  const router = useRouter();
  const [role, setRole] = useState<FunctionalRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRecoverableAction();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) {
      setError("Choose a role to continue.");
      return;
    }

    setError(null);
    const outcome = await run(() => saveOnboardingRole({ role }));
    if (outcome.status === "blocked") return;
    if (outcome.status === "failed") {
      setError(
        "Your role selection is still here. Check your connection and try again."
      );
      return;
    }

    if (outcome.value.error) {
      setError(outcome.value.error);
      return;
    }

    router.refresh();
  }

  return (
    <OnboardingChrome current={2} total={2}>
      <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
        <StepHeading
          title="How do you work?"
          description="Choose the label that best describes you. You can change it later, and it never changes what you can access."
        />

        <div className="space-y-2">
          <Label id="role-label">Your role</Label>
          <RadioGroup
            className="border-t border-border"
            aria-labelledby="role-label"
            name="functionalRole"
            required
            value={role}
            onValueChange={(value) => {
              if (!value) return;
              setRole(value as FunctionalRole);
              setError(null);
            }}
          >
            {roles.map((option) => {
              const selected = role === option.value;
              const Icon = option.icon;

              return (
                <label
                  key={option.value}
                  data-slot="radio-option"
                  className={cn(
                    "relative flex min-h-[56px] w-full cursor-pointer items-center gap-3 border-b px-2 text-left transition-colors hover:bg-muted/60 sm:min-h-[58px] sm:px-3",
                    selected &&
                      "border-brand bg-brand-soft hover:bg-brand-soft"
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-[18px] shrink-0",
                      selected ? "text-brand" : "text-muted-foreground"
                    )}
                    strokeWidth={1.8}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-type-control",
                        selected && "font-semibold"
                      )}
                    >
                      {option.label}
                    </span>
                    <span className="block text-type-meta text-muted-foreground">
                      {option.helper}
                    </span>
                  </span>
                  <RadioGroupItem
                    value={option.value}
                    aria-label={option.label}
                  />
                </label>
              );
            })}
          </RadioGroup>
        </div>

        {error && (
          <Feedback kind="error" variant="inline">
            {error}
          </Feedback>
        )}

        <AuthAction type="submit" loading={pending} loadingLabel="Saving role…">
          Continue
        </AuthAction>
      </form>
    </OnboardingChrome>
  );
}
