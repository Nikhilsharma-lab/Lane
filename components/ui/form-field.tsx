"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

interface FormFieldProps extends React.ComponentProps<"div"> {
  /** Label text displayed above the control. */
  label: string
  /** Connects the label to its control via htmlFor/id. */
  htmlFor?: string
  /** Error message shown below the control. */
  error?: string | null
  /** Hint text shown below the control (hidden when error is present). */
  hint?: string
  /** Whether the field is required — appends a visual indicator. */
  required?: boolean
}

function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
  ...props
}: FormFieldProps) {
  return (
    <div
      data-slot="form-field"
      className={cn("grid gap-1.5", className)}
      {...props}
    >
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="text-accent-danger ml-0.5" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p
          data-slot="form-field-error"
          className="text-xs text-accent-danger"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          data-slot="form-field-hint"
          className="text-xs text-muted-foreground/60"
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export { FormField, type FormFieldProps }
