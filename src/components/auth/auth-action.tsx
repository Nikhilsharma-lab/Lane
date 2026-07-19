import {
  LoaderCircleIcon,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

const kindClasses: Record<AuthActionKind, string> = {
  primary:
    "h-control-form-touch w-full sm:h-control-form disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100",
  secondary:
    "h-touch-target w-full border-input bg-transparent text-foreground hover:bg-muted hover:text-foreground disabled:border-input disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100 dark:bg-transparent dark:hover:bg-muted dark:disabled:bg-disabled dark:disabled:text-disabled-foreground",
  tertiary:
    "h-touch-target w-full gap-2 px-3 text-type-label text-muted-foreground hover:bg-muted hover:text-foreground disabled:bg-transparent disabled:text-disabled-foreground disabled:opacity-100",
  utility:
    "h-touch-target gap-1.5 px-3 text-type-meta sm:h-control-utility disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100",
};

const loadingClasses: Record<AuthActionKind, string> = {
  primary:
    "disabled:bg-primary disabled:text-primary-foreground",
  secondary:
    "disabled:border-input disabled:bg-transparent disabled:text-foreground dark:disabled:bg-transparent dark:disabled:text-foreground",
  tertiary:
    "disabled:bg-transparent disabled:text-muted-foreground",
  utility:
    "disabled:bg-primary disabled:text-primary-foreground",
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
  const StateIcon = loading ? LoaderCircleIcon : Icon;

  return (
    <Button
      {...props}
      variant={
        kind === "secondary"
          ? "outline"
          : kind === "tertiary"
            ? "ghost"
            : "default"
      }
      size="default"
      className={cn(kindClasses[kind], loading && loadingClasses[kind])}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
    >
      {StateIcon && (
        <StateIcon
          aria-hidden="true"
          data-icon="inline-start"
          className={cn(
            kind === "utility" ? "size-3.5" : "size-4",
            loading && "animate-spin motion-reduce:animate-none"
          )}
          strokeWidth={1.8}
        />
      )}
      {loading ? (loadingLabel ?? children) : children}
    </Button>
  );
}
