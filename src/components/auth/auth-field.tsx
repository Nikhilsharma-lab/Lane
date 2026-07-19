"use client";

import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { PasswordField } from "@/components/auth/password-field";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const AUTH_FIELD_CONTROL_CLASSNAME =
  "h-control-form-touch bg-card px-3 sm:h-control-form dark:bg-card read-only:bg-muted dark:read-only:bg-muted";

type AuthFieldContentProps = {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  trailing?: ReactNode;
};

type AuthInputFieldProps = AuthFieldContentProps &
  Omit<
    ComponentProps<typeof Input>,
    "aria-describedby" | "aria-invalid" | "className"
  > & {
    endIcon?: LucideIcon;
  };

type AuthPasswordFieldProps = AuthFieldContentProps &
  Omit<
    ComponentProps<typeof PasswordField>,
    "aria-describedby" | "aria-invalid" | "className"
  >;

function FieldHeader({
  label,
  trailing,
}: {
  label: ReactNode;
  trailing?: ReactNode;
}) {
  if (!trailing) return <FieldLabel>{label}</FieldLabel>;

  return (
    <div className="flex items-center justify-between gap-4">
      <FieldLabel>{label}</FieldLabel>
      {trailing}
    </div>
  );
}

function FieldMessage({
  description,
  error,
}: {
  description?: ReactNode;
  error?: ReactNode;
}) {
  if (error) return <FieldError>{error}</FieldError>;
  if (description) {
    return <FieldDescription>{description}</FieldDescription>;
  }
  return null;
}

export function AuthInputField({
  label,
  description,
  error,
  trailing,
  endIcon: EndIcon,
  disabled,
  id,
  readOnly,
  ...props
}: AuthInputFieldProps) {
  const invalid = Boolean(error);

  return (
    <Field data-auth-field="" invalid={invalid} disabled={disabled}>
      <FieldHeader label={label} trailing={trailing} />
      {EndIcon ? (
        <div className="relative">
          <Input
            {...props}
            id={id}
            disabled={disabled}
            readOnly={readOnly}
            aria-invalid={invalid || undefined}
            className={cn(AUTH_FIELD_CONTROL_CLASSNAME, "pr-11")}
          />
          <EndIcon
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground",
              disabled && "text-disabled-foreground"
            )}
            strokeWidth={1.8}
          />
        </div>
      ) : (
        <Input
          {...props}
          id={id}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={invalid || undefined}
          className={AUTH_FIELD_CONTROL_CLASSNAME}
        />
      )}
      <FieldMessage description={description} error={error} />
    </Field>
  );
}

export function AuthPasswordField({
  label,
  description,
  error,
  trailing,
  disabled,
  id,
  ...props
}: AuthPasswordFieldProps) {
  const invalid = Boolean(error);

  return (
    <Field data-auth-field="" invalid={invalid} disabled={disabled}>
      <FieldHeader label={label} trailing={trailing} />
      <PasswordField
        {...props}
        id={id}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={AUTH_FIELD_CONTROL_CLASSNAME}
      />
      <FieldMessage description={description} error={error} />
    </Field>
  );
}
