import { type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/arc/button/button";

export const AUTH_ACTION_KINDS = [
  "primary",
  "secondary",
  "tertiary",
  "utility",
] as const;

type AuthActionKind = (typeof AUTH_ACTION_KINDS)[number];

type AuthActionProps = Omit<
  ComponentProps<typeof Button>,
  "children" | "className" | "size" | "style" | "variant"
> & {
  children: ReactNode;
  icon?: LucideIcon;
  kind?: AuthActionKind;
  loading?: boolean;
  loadingLabel?: ReactNode;
};

export function AuthAction({
  children,
  disabled,
  icon: Icon,
  kind = "primary",
  loading = false,
  loadingLabel,
  ...props
}: AuthActionProps) {
  const StateIcon = loading ? undefined : Icon;

  return (
    <Button
      {...props}
      variant={
        kind === "secondary"
          ? "secondary"
          : kind === "tertiary"
            ? "ghost"
            : "primary"
      }
      loading={loading}
      className={kind === "utility" ? undefined : "w-full"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
    >
      {StateIcon && (
        <StateIcon
          aria-hidden="true"
          data-icon="inline-start"
          className={kind === "utility" ? "size-3.5" : "size-4"}
        />
      )}
      {loading ? (loadingLabel ?? children) : children}
    </Button>
  );
}
