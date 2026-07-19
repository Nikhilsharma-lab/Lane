"use client"

import * as React from "react"
import { Field as FieldPrimitive } from "@base-ui/react/field"

import { cn } from "@/lib/utils"

function Field({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Root>) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Label>) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn(
        "text-type-label text-foreground select-none data-disabled:cursor-not-allowed data-disabled:text-disabled-foreground",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Description>) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn(
        "text-type-support text-muted-foreground data-disabled:text-disabled-foreground",
        className
      )}
      {...props}
    />
  )
}

function FieldError({
  className,
  match = true,
  ...props
}: React.ComponentProps<typeof FieldPrimitive.Error>) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      match={match}
      role="alert"
      className={cn(
        "text-type-support text-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Field, FieldDescription, FieldError, FieldLabel }
